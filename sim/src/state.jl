using Random

# ---------------------------------------------------------------- events
# An immutable struct: once created, an event never changes.
struct Event
    type::Symbol                       
    actor::Union{Int,Nothing}
    target::Union{Int,Nothing}
    payload::Dict{Symbol,Any}
    visible_to::Union{Symbol,Vector{Int}} 
end

# A second constructor with a default for `visible_to`
Event(type, actor, target, payload=Dict{Symbol,Any}(); visible_to=:all) =
    Event(type, actor, target, payload, visible_to)

# ---------------------------------------------------------------- the state
# A mutable struct: fields can be changed after creation (s.round += 1).
mutable struct State
    roles::Vector{Symbol}  # hidden part: roles[i] = player i's role (never changes)
    in_game::BitVector     # in_game[i] = is player i still playing (a compact Vector{Bool})
    round::Int
    phase::Symbol          # :setup, :day, :night, :end
    history::Vector{Event} # everything that happened, with its visibility
    winner::Union{Symbol,Nothing}
end

# Constructor: build the starting state from the list of roles and an rng.
function State(role_numbers::Dict, rng::AbstractRNG)
    # Deal a random role to each player: :villager, :werewolf and :seer 
    n = sum(values(role_numbers))
    role_list = [fill(role, k) for (role, k) in sort(collect(role_numbers))]
    roles = shuffle!(rng, reduce(vcat, role_list))
    s = State(roles, trues(n), 0, :setup, Event[], nothing)
    for i in 1:n
        push!(s.history, Event(:role_assigned, i, nothing, Dict{Symbol,Any}(:role => roles[i]);
                               visible_to=[i]))
    end
    werewolves = findall(==(:werewolf), s.roles)
    pack_revealed = Event(:pack_revealed, nothing, nothing, Dict{Symbol,Any}(:members => werewolves), werewolves)
    push!(s.history, pack_revealed)
    return s
end

# ---------------------------------------------------------------- copy
# POMCP-style planners copy states a lot. `copy` the vectors so the two states don't share
# them. Events are immutable, so copying the history vector (not each event) is enough.
Base.copy(s::State) = State(s.roles, copy(s.in_game), s.round, s.phase,
                                  copy(s.history), s.winner)

# ---------------------------------------------------------------- rules (not state)
# Rules are constants and functions next to the state, not fields in it.
const PHASE_ORDER = (:setup, :night, :day, :end)

players_left(s::State) = findall(s.in_game)        # indices where in_game is true
is_over(s::State) = s.phase == :end

# ---------------------------------------------------------------- views
# What player i sees: the events visible to them. Agents get this, never the state.
can_see(e::Event, i::Int) = e.visible_to === :all || i in e.visible_to
player_view(s::State, i::Int) = filter(e -> can_see(e, i), s.history)

# ---------------------------------------------------------------- winner check
function winner_check!(s::State)
    werewolves_left = length(filter(x -> s.roles[x] == :werewolf, players_left(s)))
    villagers_left = length(filter(x -> s.roles[x] != :werewolf, players_left(s)))
    if werewolves_left == 0
        s.phase = :end
        s.winner = :village
        return Event(:game_end, nothing, nothing, Dict{Symbol,Any}(:winner => s.winner))
    elseif villagers_left <= werewolves_left
        s.phase = :end
        s.winner = :werewolves
        return Event(:game_end, nothing, nothing, Dict{Symbol,Any}(:winner => s.winner))
    end
    return
end 

# ---------------------------------------------------------------- transitions
# A player is voted out or eaten by the wolves
function elimination(s::State, target::Int, type::Symbol)
    s2 = copy(s)
    @assert s2.in_game[target] "can't eliminate a player who's already out"
    s2.in_game[target] = false
    events = [Event(type, nothing, target, Dict{Symbol,Any}(:role => s2.roles[target]))]
    winner_check = winner_check!(s2)
    if winner_check !== nothing
        push!(events, winner_check)
    end
    append!(s2.history, events)
    return s2, events
end
