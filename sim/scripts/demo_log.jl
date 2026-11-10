# Writes a tiny hand-scripted 4-player log to check the log writer end to end.
# The events are written by hand: this is not game logic, just an example of every call.
#
#     julia --project=. scripts/demo_log.jl
#
# Then open out/demo.json in the viewer ("Open a log file…" on the start screen).

using Werewolf

log = GameLog(seed=0, role_counts=Dict(:werewolf => 1, :seer => 1, :villager => 2),
              title="Log writer demo", mock=true)
add_player!(log, 1, "Amélie", :seer, :village, :discreet)
add_player!(log, 2, "Bastien", :werewolf, :werewolves, :manipulative)
add_player!(log, 3, "Chloé", :villager, :village, :trusting)
add_player!(log, 4, "Damien", :villager, :village, :aggressive)

# Uniform belief over the other players' roles, for the observer `me` (hand-made numbers)
function uniform_beliefs!(log, me)
    for j in 1:4
        j == me || set_belief!(log, me, j, Dict(:werewolf => 1/3, :seer => 1/3, :villager => 1/3))
    end
end

begin_step!(log, 0, :setup)
for (i, role) in enumerate([:seer, :werewolf, :villager, :villager])
    add_event!(log, :role_assigned, i, nothing, Dict(:role => role); visible_to=[i])
end
for me in [1, 3, 4]
    uniform_beliefs!(log, me)
end
for j in [1, 3, 4]
    set_belief!(log, 2, j, Dict(:seer => 1/3, :villager => 2/3))
end

begin_step!(log, 1, :night; subphase="seer")
add_decision!(log, 1, :inspect, [(action=:inspect, target=2, value=0.6),
                                 (action=:inspect, target=3, value=0.5, label="inspect Chloé")], 1)
add_event!(log, :inspect, 1, 2, Dict(:role => :werewolf); visible_to=[1])
set_belief!(log, 1, 2, Dict(:werewolf => 1.0))
set_belief!(log, 1, 3, Dict(:villager => 1.0))
set_belief!(log, 1, 4, Dict(:villager => 1.0))

begin_step!(log, 1, :night; subphase="wolves")
add_decision!(log, 2, :wolf_target, [(action=:kill, target=1, value=0.9), (action=:kill, target=3, value=0.4)], 1)
add_event!(log, :wolf_target, 2, 1; visible_to=[2])

begin_step!(log, 1, :day; subphase="dawn")
add_event!(log, :dawn, nothing, nothing, Dict(:deaths => [pid(1)]))
add_event!(log, :death_announced, nothing, 1, Dict(:role => :seer))
add_elimination!(log, 1, :wolves)
for j in [2, 4]
    set_belief!(log, 3, j, Dict(:werewolf => 0.5, :villager => 0.5))
end
for j in [2, 3]
    set_belief!(log, 4, j, Dict(:werewolf => 0.5, :villager => 0.5))
end

begin_step!(log, 1, :day; subphase="vote")
for (voter, target) in [(2, 4), (3, 2), (4, 2)]
    add_event!(log, :vote, voter, target, Dict(:ballot => :main))
end
add_decision!(log, 3, :vote, [(action=:vote, target=2, value=0.5), (action=:vote, target=4, value=0.5)], 1)
add_event!(log, :vote_result, nothing, 2, Dict(:tally => Dict(pid(2) => 2, pid(4) => 1),
                                               :tied => false, :eliminated => pid(2)))
add_event!(log, :elimination, nothing, 2, Dict(:role => :werewolf))
add_elimination!(log, 2, :vote)

begin_step!(log, 1, :end)
add_event!(log, :game_end, nothing, nothing, Dict(:winner => :village))
finish!(log, :village)

path = write_log(joinpath(@__DIR__, "..", "out", "demo.json"), log; pretty=true)
println("wrote ", normpath(path))
validate_with_viewer(path) || exit(1)
