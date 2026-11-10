# Game log writer: the glue between the simulator and the viewer.
# It records what happened (players, steps, events, beliefs, decisions, result)
# and writes it as JSON in the format of schema/game_log.schema.json.
# It contains no game logic: the engine decides everything and calls these functions.
#
# Typical use, from the engine:
#     log = GameLog(seed=42, role_counts=Dict(:werewolf => 3, :seer => 1, ...))
#     add_player!(log, 1, "Amélie", :seer, :village, :discreet)
#     begin_step!(log, 1, :night; subphase="seer")
#     add_event!(log, :inspect, 1, 6, Dict(:role => :werewolf); visible_to=[1])
#     set_belief!(log, 1, 6, Dict(:werewolf => 1.0))
#     add_decision!(log, 1, :inspect, [(action=:inspect, target=6, value=0.81)], 1)
#     ...
#     finish!(log, :village)
#     write_log("out/game_0001.json", log)
#
# Player ids can be given as integers (1 -> "p01") or as strings ("p01").
# Roles, teams, phases, ... can be Symbols or Strings.

using JSON
using Dates

const SCHEMA_VERSION = "1.0.0"

# Allowed values, copied from schema/game_log.schema.json
const ROLES = ["werewolf", "seer", "witch", "little_girl", "villager", "cupid"]
const TEAMS = ["village", "werewolves", "lovers"]
const PERSONALITIES = ["aggressive", "discreet", "manipulative", "trusting", "none"]
const PHASES = ["setup", "night", "day", "end"]
const EVENT_TYPES = ["role_assigned", "pack_revealed", "spy", "wolf_target", "inspect", "potion",
                     "dawn", "death_announced", "conversation", "impression", "statement",
                     "vote", "vote_result", "elimination", "game_end",
                     "lovers_bound", "captain_elected"]
const DECISION_KINDS = ["wolf_target", "spy", "inspect", "potion", "talk_to", "statement", "vote"]
const CAUSES = ["wolves", "vote", "poison", "caught_spying", "heartbreak"]

# Ordered JSON object, so the file reads in the same order as the schema
const Obj = JSON.Object{String,Any}

function obj(pairs...)
    o = Obj()
    for (k, v) in pairs
        o[string(k)] = v
    end
    return o
end

# "p01" for player 1; strings are kept as they are; nothing stays nothing (JSON null)
pid(i::Integer) = "p" * lpad(i, 2, '0')
pid(s::AbstractString) = String(s)
pid(::Nothing) = nothing

# Converts payload values: Symbols become strings, player ids stay as given
jsonify(x::Symbol) = string(x)
jsonify(x::AbstractDict) = obj((string(k) => jsonify(v) for (k, v) in x)...)
jsonify(x::AbstractVector) = [jsonify(v) for v in x]
jsonify(x::NamedTuple) = jsonify(Dict(pairs(x)))
jsonify(x) = x

mutable struct GameLog
    meta::Obj
    players::Vector{Obj}
    steps::Vector{Obj}
    eliminations::Vector{Obj}
    winner::Union{String,Nothing}
    final_round::Int
end

function GameLog(; seed::Integer, role_counts=nothing, config=Dict(), title=nothing, mock=false)
    # seed: the RNG seed of the game, so a log can be reproduced
    # role_counts: e.g. Dict(:werewolf => 3, :seer => 1, :villager => 7); shown by the viewer
    # config: any other simulator settings you want to keep with the log (free-form)
    cfg = jsonify(config)
    if role_counts !== nothing
        cfg["role_counts"] = jsonify(role_counts)
    end
    meta = obj(:schema_version => SCHEMA_VERSION,
               :seed => seed,
               :config => cfg,
               :timestamp => Dates.format(now(UTC), "yyyy-mm-ddTHH:MM:SS") * "Z")
    if title !== nothing
        meta["title"] = title
    end
    if mock
        meta["mock"] = true
    end
    return GameLog(meta, Obj[], Obj[], Obj[], nothing, 0)
end

function add_player!(log::GameLog, id, name, role, team, personality=:none)
    # personality: leave it out (:none) for games without personalities
    push!(log.players, obj(:id => pid(id), :name => string(name), :role => string(role),
                           :team => string(team), :personality => string(personality)))
    return log
end

function begin_step!(log::GameLog, round::Integer, phase; subphase=nothing)
    # Starts a new step; events, beliefs and decisions are added to the latest step.
    # t is the step index, filled in automatically (0, 1, 2, ...)
    step = obj(:t => length(log.steps), :round => round, :phase => string(phase))
    if subphase !== nothing
        step["subphase"] = string(subphase)
    end
    step["events"] = Obj[]
    step["beliefs"] = Obj()
    step["decisions"] = Obj[]
    push!(log.steps, step)
    return log
end

function current_step(log::GameLog)
    isempty(log.steps) && error("call begin_step! before adding events, beliefs or decisions")
    return log.steps[end]
end

function add_event!(log::GameLog, type, actor, target, payload=Dict(); visible_to=:all)
    # visible_to: :all, or a list of the players who see the event
    vis = visible_to === :all || visible_to == "all" ? "all" : unique([pid(p) for p in visible_to])
    push!(current_step(log)["events"],
          obj(:type => string(type), :actor => pid(actor), :target => pid(target),
              :payload => jsonify(payload), :visible_to => vis))
    return log
end

function set_belief!(log::GameLog, observer, target, dist)
    # dist: role => probability for one target, e.g. Dict(:werewolf => 0.3, :villager => 0.7).
    # Roles left out are treated as 0 by the viewer.
    beliefs = current_step(log)["beliefs"]
    o = pid(observer)
    if !haskey(beliefs, o)
        beliefs[o] = Obj()
    end
    beliefs[o][pid(target)] = obj((string(r) => Float64(p) for (r, p) in dist)...)
    return log
end

function set_beliefs!(log::GameLog, observer, dists)
    # dists: target => (role => probability), all the targets of one observer at once
    for (target, dist) in dists
        set_belief!(log, observer, target, dist)
    end
    return log
end

function add_decision!(log::GameLog, player, kind, options, chosen::Integer)
    # options: a list of NamedTuples with fields action and value, and optionally target and label,
    #          e.g. [(action=:vote, target=3, value=0.42), (action=:vote, target=5, value=0.17)]
    # chosen: the index of the chosen option, 1-based like Julia (written 0-based in the JSON)
    opts = Obj[]
    for op in options
        o = obj(:action => string(op.action))
        if hasproperty(op, :target)
            o["target"] = pid(op.target)
        end
        o["value"] = Float64(op.value)
        if hasproperty(op, :label)
            o["label"] = string(op.label)
        end
        push!(opts, o)
    end
    push!(current_step(log)["decisions"],
          obj(:player => pid(player), :kind => string(kind), :options => opts, :chosen => chosen - 1))
    return log
end

function add_elimination!(log::GameLog, player, cause)
    # Records a death in result.eliminations, at the round, phase and t of the current step.
    # (The engine still adds the matching dawn / death_announced / elimination events itself.)
    step = current_step(log)
    push!(log.eliminations, obj(:player => pid(player), :round => step["round"],
                                :phase => step["phase"], :t => step["t"], :cause => string(cause)))
    return log
end

function finish!(log::GameLog, winner; final_round=nothing)
    # final_round defaults to the round of the last step
    log.winner = string(winner)
    log.final_round = final_round === nothing ? current_step(log)["round"] : final_round
    return log
end

function to_json(log::GameLog)
    return obj(:meta => log.meta,
               :players => log.players,
               :steps => log.steps,
               :result => obj(:winner => log.winner, :final_round => log.final_round,
                              :eliminations => log.eliminations))
end

# ---------------------------------------------------------------------
# Checks. A quick subset of the schema plus the viewer's rules, so mistakes
# show up in Julia with a clear message. The full check is the viewer's
# validator: validate_with_viewer(path) below.
# ---------------------------------------------------------------------

function check_log(log::GameLog)
    # returns a list of problems (empty if none)
    problems = String[]
    bad(msg) = push!(problems, msg)

    ids = Set(p["id"] for p in log.players)
    length(ids) == length(log.players) || bad("duplicate player ids")
    4 <= length(log.players) <= 24 || bad("there must be 4 to 24 players, found $(length(log.players))")
    for p in log.players
        occursin(r"^p[0-9]{2}$", p["id"]) || bad("player id $(p["id"]) should look like p01")
        p["role"] in ROLES || bad("player $(p["id"]): unknown role $(p["role"])")
        p["team"] in TEAMS || bad("player $(p["id"]): unknown team $(p["team"])")
        p["personality"] in PERSONALITIES || bad("player $(p["id"]): unknown personality $(p["personality"])")
    end
    if haskey(log.meta["config"], "role_counts")
        for r in keys(log.meta["config"]["role_counts"])
            r in ROLES || bad("role_counts: unknown role $r")
        end
    end

    isempty(log.steps) && bad("the log has no steps")
    known(x) = x === nothing || x in ids
    for step in log.steps
        where = "step $(step["t"])"
        step["phase"] in PHASES || bad("$where: unknown phase $(step["phase"])")
        for e in step["events"]
            e["type"] in EVENT_TYPES || bad("$where: unknown event type $(e["type"])")
            known(e["actor"]) || bad("$where: $(e["type"]) has unknown actor $(e["actor"])")
            known(e["target"]) || bad("$where: $(e["type"]) has unknown target $(e["target"])")
            e["visible_to"] == "all" || all(in(ids), e["visible_to"]) ||
                bad("$where: $(e["type"]) is visible to an unknown player")
        end
        for (o, row) in step["beliefs"]
            o in ids || bad("$where: beliefs of unknown observer $o")
            for (j, dist) in row
                j in ids || bad("$where: $o has a belief about unknown player $j")
                j == o && bad("$where: $o has a belief about itself")
                all(in(ROLES), keys(dist)) || bad("$where: $o -> $j uses an unknown role")
                all(p -> 0 <= p <= 1, values(dist)) || bad("$where: $o -> $j has a probability outside [0, 1]")
                s = sum(values(dist); init=0.0)
                abs(s - 1) <= 0.02 || bad("$where: $o -> $j sums to $(round(s, digits=3)), not 1")
            end
        end
        for d in step["decisions"]
            d["player"] in ids || bad("$where: decision by unknown player $(d["player"])")
            d["kind"] in DECISION_KINDS || bad("$where: unknown decision kind $(d["kind"])")
            isempty(d["options"]) && bad("$where: decision of $(d["player"]) has no options")
            0 <= d["chosen"] < length(d["options"]) || bad("$where: decision of $(d["player"]) chose an option that doesn't exist")
            all(op -> !haskey(op, "target") || known(op["target"]), d["options"]) ||
                bad("$where: decision of $(d["player"]) targets an unknown player")
        end
    end

    log.winner === nothing && bad("finish! was not called (no winner)")
    log.winner === nothing || log.winner in TEAMS || bad("unknown winner $(log.winner)")
    for el in log.eliminations
        el["player"] in ids || bad("elimination of unknown player $(el["player"])")
        el["cause"] in CAUSES || bad("elimination of $(el["player"]): unknown cause $(el["cause"])")
    end
    return problems
end

function write_log(path::AbstractString, log::GameLog; check=true, pretty=false)
    # Writes the log as JSON. With check=true, refuses to write a log with problems.
    if check
        problems = check_log(log)
        if !isempty(problems)
            error("the log has $(length(problems)) problem(s):\n  " * join(problems, "\n  "))
        end
    end
    mkpath(dirname(abspath(path)))
    open(path, "w") do io
        pretty ? JSON.json(io, to_json(log); pretty=true) : JSON.json(io, to_json(log))
    end
    return path
end

const VIEWER_DIR = normpath(joinpath(@__DIR__, "..", "..", "viewer"))

function validate_with_viewer(paths::AbstractString...)
    # Runs the viewer's full schema validator (needs Node and `npm install` in viewer/).
    # Returns true if every file is valid.
    cmd = Cmd(`npm run --silent validate-logs -- $(abspath.(collect(paths)))`; dir=VIEWER_DIR)
    return success(pipeline(cmd; stdout=stdout, stderr=stderr))
end
