# Game record -> viewer log. Glue between the game loop and the log writer (gamelog.jl).
# No game logic here: the loop plays the game and fills a list of StepRecords;
# game_log turns them into a GameLog that the viewer can replay.
#
# Contract with the game loop:
#   - one StepRecord per subphase the loop runs (setup, seer, wolves, dawn, vote, runoff),
#     in order, holding the events that subphase returned (the same Events as in the history);
#   - one Decision per agent asked in that subphase: who, what kind, the legal targets it was
#     given, the values it returned, and the index of the target it chose;
#   - optionally the beliefs of the living players after the step (observer => target => role => p).
#
# Typical use, at the end of the game loop:
#     log = game_log(final_state, steps; seed=seed, role_counts=role_counts)
#     write_log("out/game_0001.json", log)

struct Decision
    player::Int
    kind::Symbol               # :inspect, :wolf_target, :vote, :runoff
    options::Vector{Int}       # the legal targets given to the agent, in the same order
    values::Vector{Float64}    # the agent's value for each option
    chosen::Int                # index into options (1-based)
end

const Beliefs = Dict{Int,Dict{Int,Dict{Symbol,Float64}}}   # observer => target => role => p

struct StepRecord
    round::Int
    phase::Symbol              # :setup, :night, :day
    subphase::Symbol           # :setup, :seer, :wolves, :dawn, :vote, :runoff
    events::Vector{Event}
    decisions::Vector{Decision}
    beliefs::Beliefs
end

StepRecord(round, phase, subphase, events, decisions=Decision[]; beliefs=Beliefs()) =
    StepRecord(round, phase, subphase, events, decisions, beliefs)

const DEFAULT_NAMES = ["Amélie", "Bastien", "Camille", "Denis", "Élise", "Fabrice", "Gaëlle",
                       "Hugo", "Inès", "Julien", "Katia", "Léon", "Manon", "Nicolas", "Océane",
                       "Pierre", "Quentin", "Rose", "Samuel", "Théa", "Ulysse", "Valentine",
                       "William", "Yasmine"]

team_of(role::Symbol) = role == :werewolf ? :werewolves : :village

# The log has no "runoff" decision kind: a runoff ballot is a vote (the events say ballot=runoff)
log_kind(kind::Symbol) = kind == :runoff ? :vote : kind

# Payload keys that hold player numbers, converted to "p01"-style ids for the log
const PLAYER_LIST_KEYS = (:members, :deaths, :candidates)
const PLAYER_KEYS = (:eliminated, :glimpsed)

function log_payload(payload::Dict{Symbol,Any})
    out = Dict{Symbol,Any}()
    for (k, v) in payload
        if k in PLAYER_LIST_KEYS
            out[k] = [pid(i) for i in v]
        elseif k in PLAYER_KEYS
            out[k] = pid(v)
        elseif k == :tally
            out[k] = Dict(pid(i) => n for (i, n) in v)
        else
            out[k] = v
        end
    end
    return out
end

# Cause of a death, from the event that announces it
const DEATH_CAUSES = Dict(:death_announced => :wolves, :elimination => :vote)

function game_log(s::State, steps::Vector{StepRecord}; seed::Integer, role_counts,
                  names=DEFAULT_NAMES, title=nothing, config=Dict())
    @assert s.winner !== nothing "the game isn't over (no winner yet)"
    @assert length(names) >= length(s.roles) "not enough names for $(length(s.roles)) players"

    log = GameLog(seed=seed, role_counts=role_counts, config=config, title=title)
    for (i, role) in enumerate(s.roles)
        add_player!(log, i, names[i], role, team_of(role))
    end

    for st in steps
        begin_step!(log, st.round, st.phase; subphase=st.subphase)
        for e in st.events
            add_event!(log, e.type, e.actor, e.target, log_payload(e.payload); visible_to=e.visible_to)
            if haskey(DEATH_CAUSES, e.type)
                add_elimination!(log, e.target, DEATH_CAUSES[e.type])
            end
        end
        for d in st.decisions
            k = log_kind(d.kind)
            options = [(action=k, target=t, value=v) for (t, v) in zip(d.options, d.values)]
            add_decision!(log, d.player, k, options, d.chosen)
        end
        for (observer, row) in st.beliefs
            set_beliefs!(log, observer, row)
        end
    end

    finish!(log, s.winner)
    return log
end
