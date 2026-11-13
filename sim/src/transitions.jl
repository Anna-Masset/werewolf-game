function seer_inspect(s::State, target::Int)
    s2 = copy(s)
    seer_id = findfirst(==(:seer), s2.roles)
    @assert s2.in_game[seer_id] "Seer is already dead"
    @assert target != seer_id "Seer cannot inspect themselves"
    @assert s2.in_game[target] "Seer cannot inspect a dead player"
    role_seen = s2.roles[target]
    event = Event(:inspect, seer_id, target, Dict{Symbol,Any}(:role => role_seen), [seer_id])
    push!(s2.history, event)
    return s2, [event]
end

function werewolves_kill(s::State, target::Int)
    s2 = copy(s)
    @assert s2.roles[target] != :werewolf "Werewolves cannot kill each other"
    @assert s2.in_game[target] "Werewolves cannot kill a dead player"
    wolves_id = findall(==(:werewolf), s2.roles)
    wolves_alive = wolves_id[s2.in_game[wolves_id]]
    event = Event(:wolf_target, wolves_alive[1], target, Dict{Symbol,Any}(), wolves_alive)
    push!(s2.history, event)
    return s2, [event]
end

function dawn(s::State)
    wolf_target_history_idx = findlast(e -> e.type == :wolf_target, s.history)
    @assert wolf_target_history_idx !== nothing "no wolf target tonight"
    wolf_target_history = s.history[wolf_target_history_idx]

    s2 = copy(s)
    dawn_event = Event(:dawn, nothing, nothing, Dict{Symbol,Any}(:deaths => [wolf_target_history.target]))
    push!(s2.history, dawn_event)

    s3, event_elimination = elimination(s2, wolf_target_history.target, :death_announced)
    return s3, vcat([dawn_event], event_elimination)
end

function vote(s::State, ballots::Dict{Int,Int})
    @assert all(s.in_game[voter] for voter in keys(ballots)) "Voters must be alive"
    @assert all(s.in_game[target] for target in values(ballots)) "Vote targets must be alive"
    @assert all(p -> p.first != p.second, ballots) "Voters cannot vote for themselves"
    @assert all(v -> haskey(ballots, v), players_left(s)) "All alive voters must vote"
    
    events = Event[]
    s2 = copy(s)
    for voter in sort(collect(keys(ballots)))
        target = ballots[voter]
        event = Event(:vote, voter, target, Dict{Symbol,Any}(:ballot => :main), :all)
        push!(s2.history, event)
        push!(events, event)
    end
    counts = Dict{Int, Int}()
    for player in values(ballots)
        counts[player] = get(counts, player, 0) + 1
    end
    max_votes = maximum(values(counts))
    voted_players = sort([player for (player, count) in counts if count == max_votes])
    if length(voted_players) == 1
        event = Event(:vote_result, nothing, voted_players[1],
                      Dict{Symbol,Any}(:tally => counts, :tied => false, :runoff => false, 
                                       :ballot => :main, :eliminated => voted_players[1]), :all)
        push!(s2.history, event)
        push!(events, event)
        s2, event_elimination = elimination(s2, voted_players[1], :elimination)
        append!(events, event_elimination)
    else
        event = Event(:vote_result, nothing, nothing,
                      Dict{Symbol,Any}(:tally => counts, :tied => true, :runoff => true,
                                       :ballot => :main, :eliminated => nothing, :candidates => voted_players), :all)
        push!(s2.history, event)
        push!(events, event)
    end
    return s2, events
end

function runoff_candidates(s::State)
    idx = findlast(e -> e.type == :vote_result, s.history)
    @assert idx !== nothing && s.history[idx].payload[:runoff] "No runoff is due"
    return s.history[idx].payload[:candidates]
end

function runoff(s::State, ballots::Dict{Int,Int}, rng::AbstractRNG)
    candidates = runoff_candidates(s)
    
    @assert all(s.in_game[voter] for voter in keys(ballots)) "Voters must be alive"
    @assert all(s.in_game[target] for target in values(ballots)) "Vote targets must be alive"
    @assert all(p -> p.first != p.second, ballots) "Voters cannot vote for themselves"
    @assert all(v -> haskey(ballots, v), players_left(s)) "All alive voters must vote"
    @assert all(p -> p.second in candidates, ballots) "Vote targets must be runoff candidates"
    
    events = Event[]
    s2 = copy(s)
    for voter in sort(collect(keys(ballots)))
        target = ballots[voter]
        event = Event(:vote, voter, target, Dict{Symbol,Any}(:ballot => :runoff), :all)
        push!(s2.history, event)
        push!(events, event)
    end
    counts = Dict{Int, Int}()
    for player in values(ballots)
        counts[player] = get(counts, player, 0) + 1
    end
    max_votes = maximum(values(counts))
    top = sort([player for (player, count) in counts if count == max_votes])
    if length(top) == 1
        eliminated_player = top[1]
    else
        eliminated_player = rand(rng, top)
    end
    event = Event(:vote_result, nothing, eliminated_player,
                      Dict{Symbol,Any}(:tally => counts, :tied => length(top) > 1, :runoff => false,
                                       :ballot => :runoff, :eliminated => eliminated_player), :all)
    push!(s2.history, event)
    push!(events, event)
    s2, event_elimination = elimination(s2, eliminated_player, :elimination)
    append!(events, event_elimination)
    return s2, events
end 

function legal_actions(s::State, player::Int, kind::Symbol)
    @assert s.in_game[player] "Player must be alive"

    if kind == :inspect || kind == :vote
        return filter(i -> i != player && s.in_game[i], players_left(s))
    elseif kind == :wolf_target
        return filter(i -> s.roles[i] != :werewolf, players_left(s))
    elseif kind == :runoff
        return filter(i -> i != player && i in runoff_candidates(s), players_left(s))
    end
    error("Unknown action kind: $kind")
end