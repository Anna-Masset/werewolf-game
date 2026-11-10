# julia --project=. -e 'using Pkg; Pkg.test()'

using Test
using Werewolf
using JSON

function small_log()
    log = GameLog(seed=1, role_counts=Dict(:werewolf => 1, :villager => 3))
    for i in 1:4
        add_player!(log, i, "P$i", i == 1 ? :werewolf : :villager, i == 1 ? :werewolves : :village, :discreet)
    end
    begin_step!(log, 0, :setup)
    return log
end

@testset "log writer" begin
    @test pid(3) == "p03"
    @test pid(12) == "p12"
    @test pid("p07") == "p07"
    @test pid(nothing) === nothing

    log = small_log()
    add_event!(log, :vote, 2, 1, Dict(:ballot => :main))
    add_decision!(log, 2, :vote, [(action=:vote, target=1, value=0.7), (action=:vote, target=3, value=0.1)], 1)
    set_belief!(log, 2, 1, Dict(:werewolf => 0.6, :villager => 0.4))
    add_elimination!(log, 1, :vote)
    finish!(log, :village)
    @test isempty(check_log(log))

    j = JSON.parse(JSON.json(Werewolf.to_json(log)))
    step = j["steps"][1]
    @test step["t"] == 0
    @test step["events"][1]["actor"] == "p02"
    @test step["events"][1]["payload"]["ballot"] == "main"
    @test step["events"][1]["visible_to"] == "all"
    @test step["decisions"][1]["chosen"] == 0          # 1-based in Julia, 0-based in the JSON
    @test step["decisions"][1]["options"][2]["target"] == "p03"
    @test step["beliefs"]["p02"]["p01"]["werewolf"] == 0.6
    @test j["result"]["winner"] == "village"
    @test j["result"]["final_round"] == 0
    @test j["result"]["eliminations"][1]["t"] == 0
end

@testset "checks catch mistakes" begin
    has(problems, text) = any(p -> occursin(text, p), problems)

    log = small_log()
    set_belief!(log, 2, 1, Dict(:werewolf => 0.6, :villager => 0.6))
    set_belief!(log, 2, 2, Dict(:villager => 1.0))
    add_event!(log, :vote, 2, 9)
    add_event!(log, :teleport, 2, 1)
    add_decision!(log, 2, :vote, [(action=:vote, target=1, value=0.7)], 2)
    @test has(check_log(log), "sums to 1.2")
    @test has(check_log(log), "about itself")
    @test has(check_log(log), "unknown target p09")
    @test has(check_log(log), "unknown event type teleport")
    @test has(check_log(log), "option that doesn't exist")
    @test has(check_log(log), "finish! was not called")
    @test_throws ErrorException write_log(tempname() * ".json", log)

    @test_throws ErrorException add_event!(GameLog(seed=0), :vote, 1, 2)   # no step yet
end
