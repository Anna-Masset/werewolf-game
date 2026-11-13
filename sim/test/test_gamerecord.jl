# Tests for src/gamerecord.jl: a game played by hand with the engine's transitions
# (no game loop, no agents) is turned into a log, which must pass check_log.
# Included from runtests.jl.

using Random
using Werewolf: State, Event, StepRecord, Decision, game_log, players_left,
                seer_inspect, werewolves_kill, dawn, vote, runoff

# A fixed, hand-written game: seer finds a wolf, a tie, a runoff, the village wins on day 2.
# Returns the final state and the step records, like the game loop will.
function scripted_game(seed=1)
    s = State(Dict(:werewolf => 2, :seer => 1, :villager => 5), MersenneTwister(seed))
    wolves = findall(==(:werewolf), s.roles)
    seer = findfirst(==(:seer), s.roles)
    vill = findall(==(:villager), s.roles)
    others(s, i) = filter(!=(i), players_left(s))
    uniform(n) = fill(1 / n, n)
    choose(opts, t) = findfirst(==(t), opts)
    steps = StepRecord[]

    beliefs = Dict(seer => Dict(j => Dict(:werewolf => 2 / 7, :villager => 5 / 7) for j in others(s, seer)))
    push!(steps, StepRecord(0, :setup, :setup, copy(s.history); beliefs=beliefs))

    # night 1: seer inspects wolf 1, wolves kill villager 1
    opts = others(s, seer)
    s, ev = seer_inspect(s, wolves[1])
    push!(steps, StepRecord(1, :night, :seer, ev, [Decision(seer, :inspect, opts, uniform(length(opts)), choose(opts, wolves[1]))]))
    opts = filter(i -> s.roles[i] != :werewolf, players_left(s))
    s, ev = werewolves_kill(s, vill[1])
    push!(steps, StepRecord(1, :night, :wolves, ev, [Decision(wolves[1], :wolf_target, opts, uniform(length(opts)), choose(opts, vill[1]))]))
    s, ev = dawn(s)
    push!(steps, StepRecord(1, :night, :dawn, ev))

    # day 1: a tie between wolf 1 and villager 2, then the runoff eliminates wolf 1
    # 7 alive: A and B vote for each other, 2 others vote A, 2 vote B, the last one votes for
    # someone else -> A 3, B 3, C 1
    A, B = wolves[1], vill[2]
    alive = players_left(s)
    rest = filter(v -> v != A && v != B, alive)
    ballots = Dict(A => B, B => A, rest[1] => A, rest[2] => A, rest[3] => B, rest[4] => B,
                   rest[5] => rest[1])
    decisions = [Decision(v, :vote, others(s, v), uniform(length(alive) - 1), choose(others(s, v), ballots[v])) for v in sort(alive)]
    s, ev = vote(s, ballots)
    push!(steps, StepRecord(1, :day, :vote, ev, decisions))
    result = ev[findfirst(e -> e.type == :vote_result, ev)]
    @assert result.payload[:runoff] "the scripted vote should be a tie"
    if result.payload[:runoff]
        cands = ev[end].payload[:candidates]
        rb = Dict(v => (v == wolves[1] ? first(filter(!=(v), cands)) : wolves[1]) for v in players_left(s))
        decisions = [Decision(v, :runoff, filter(!=(v), cands), uniform(length(filter(!=(v), cands))),
                              choose(filter(!=(v), cands), rb[v])) for v in sort(players_left(s))]
        s, ev = runoff(s, rb, MersenneTwister(seed))
        push!(steps, StepRecord(1, :day, :runoff, ev, decisions))
    end

    # night 2 and day 2: wolves kill villager 3, the village votes out wolf 2
    s, ev = werewolves_kill(s, vill[3]); push!(steps, StepRecord(2, :night, :wolves, ev))
    s, ev = dawn(s); push!(steps, StepRecord(2, :night, :dawn, ev))
    alive = players_left(s)
    target = filter(i -> s.in_game[i], wolves)[1]
    ballots = Dict(v => (v == target ? first(filter(!=(v), alive)) : target) for v in alive)
    s, ev = vote(s, ballots)
    push!(steps, StepRecord(2, :day, :vote, ev))
    return s, steps
end

@testset "game record -> log" begin
    s, steps = scripted_game()
    @test s.winner == :village

    log = game_log(s, steps; seed=1, role_counts=Dict(:werewolf => 2, :seer => 1, :villager => 5),
                   title="Scripted test game")
    @test isempty(check_log(log))

    j = Werewolf.to_json(log)
    @test length(j["players"]) == 8
    @test j["players"][1]["personality"] == "none"
    @test j["result"]["winner"] == "village"
    @test [el["cause"] for el in j["result"]["eliminations"]] == ["wolves", "vote", "wolves", "vote"]
    @test length(j["steps"]) == length(steps)
    @test [st["subphase"] for st in j["steps"]][1:5] == ["setup", "seer", "wolves", "dawn", "vote"]

    # player numbers inside payloads become ids
    events = [e for st in j["steps"] for e in st["events"]]
    pack = events[findfirst(e -> e["type"] == "pack_revealed", events)]
    @test all(m -> occursin(r"^p\d\d$", m), pack["payload"]["members"])
    result = events[findfirst(e -> e["type"] == "vote_result", events)]
    @test all(k -> occursin(r"^p\d\d$", k), keys(result["payload"]["tally"]))
    @test all(c -> occursin(r"^p\d\d$", c), result["payload"]["candidates"])
    dawn_ev = events[findfirst(e -> e["type"] == "dawn", events)]
    @test all(d -> occursin(r"^p\d\d$", d), dawn_ev["payload"]["deaths"])

    # decisions: runoff ballots are written as votes; chosen is 0-based in the JSON
    kinds = Set(d["kind"] for st in j["steps"] for d in st["decisions"])
    @test kinds ⊆ Set(["inspect", "wolf_target", "vote"])
    d = j["steps"][2]["decisions"][1]
    @test d["kind"] == "inspect"
    @test d["options"][d["chosen"]+1]["target"] == steps[2].events[1].target |> Werewolf.pid

    # beliefs are written where given
    @test !isempty(j["steps"][1]["beliefs"])

    # an unfinished game can't be written
    s0 = State(Dict(:werewolf => 2, :seer => 1, :villager => 5), MersenneTwister(1))
    @test_throws AssertionError game_log(s0, steps; seed=1, role_counts=Dict(:werewolf => 2))
end
