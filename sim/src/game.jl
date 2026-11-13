function ask(s::State, agents::AbstractVector{<:Agent}, player::Int, kind::Symbol, rng::AbstractRNG)
    legal = legal_actions(s, player, kind)
    agent = agents[player]
    view = player_view(s, player)
    action, values = act(agent, view, kind, legal, rng)
    decision = Decision(player, kind, legal, values, findfirst(==(action), legal))
    return action, decision
end

function play_game(role_counts::Dict{Symbol, Int}, agents::AbstractVector{<:Agent}, rng::AbstractRNG)
    s = State(role_counts, rng)
    steps = StepRecord[]
    push!(steps, StepRecord(0, :setup, :setup, copy(s.history)))

    round = 1
    # The order is always the same: night (inspect, kill), day (announce death, vote)
    while !is_over(s)
        alive = players_left(s)

        # NIGHT
        # Seer inspects a player 
        k = findfirst(player -> s.roles[player] == :seer, alive)
        if k !== nothing
            seer = alive[k]
            action, d = ask(s, agents, seer, :inspect, rng)
            s, ev = seer_inspect(s, action)
            push!(steps, StepRecord(round, :night, :seer, ev, [d]))
        end
        
        # Werewolf kills a player
        k = findfirst(player -> s.roles[player] == :werewolf, alive)
        if k !== nothing
            werewolf = alive[k]
            action, d = ask(s, agents, werewolf, :wolf_target, rng)
            s, ev = werewolves_kill(s, action)
            push!(steps, StepRecord(round, :night, :wolves, ev, [d]))
        end

        # DAY
        # Announce death
        s, ev = dawn(s)
        push!(steps, StepRecord(round, :day, :dawn, ev))
        is_over(s) && break
        alive = players_left(s)

        # Vote
        ballots = Dict{Int, Int}()
        decisions = Decision[]
        for player in alive
            action, d = ask(s, agents, player, :vote, rng)
            ballots[player] = action
            push!(decisions, d)
        end
        s, ev = vote(s, ballots)
        push!(steps, StepRecord(round, :day, :vote, ev, decisions))

        r = ev[findfirst(e -> e.type == :vote_result, ev)]
        if r.payload[:runoff]
            ballots = Dict{Int, Int}()
            decisions = Decision[]
            tied_candidates = runoff_candidates(s)
            for player in alive
                action, d = ask(s, agents, player, :runoff, rng)
                ballots[player] = action
                push!(decisions, d)
            end
            s, ev = runoff(s, ballots, rng)
            push!(steps, StepRecord(round, :day, :runoff, ev, decisions))
        end
        round += 1
        
    end
    return s, steps
end




        