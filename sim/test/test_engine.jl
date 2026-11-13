# Tests for the game engine (src/state.jl, src/transitions.jl).
# They check the v0 rules of RULES.md; the rule ids are in the testset names.
# Included from runtests.jl.

using Random
using Werewolf: State, Event, elimination, winner_check!, player_view, players_left, is_over,
                seer_inspect, werewolves_kill, dawn, vote, runoff,
                legal_actions, runoff_candidates, RandomAgent, act

const V0 = Dict(:werewolf => 2, :seer => 1, :villager => 5)

new_game(seed=1) = State(V0, MersenneTwister(seed))
wolves_of(s) = findall(==(:werewolf), s.roles)
seer_of(s) = findfirst(==(:seer), s.roles)
villagers_of(s) = findall(==(:villager), s.roles)
types(events) = [e.type for e in events]

# Eliminates several players one after the other, returns the final state and the last events
function eliminate_all(s, targets, type=:elimination)
    events = Event[]
    for t in targets
        s, events = elimination(s, t, type)
    end
    return s, events
end

@testset "engine: setup (R1.1, R1.2, R1.4)" begin
    s = new_game()
    @test length(s.roles) == 8
    @test count(==(:werewolf), s.roles) == 2
    @test count(==(:seer), s.roles) == 1
    @test count(==(:villager), s.roles) == 5
    @test all(s.in_game)
    @test s.phase == :setup
    @test s.round == 0
    @test s.winner === nothing

    # same seed -> same deal; some other seed -> a different deal
    @test new_game(1).roles == new_game(1).roles
    @test any(seed -> new_game(seed).roles != new_game(1).roles, 2:20)

    # each player sees their own role; the wolves also see the pack
    w = wolves_of(s)[1]
    v = villagers_of(s)[1]
    @test types(player_view(s, w)) == [:role_assigned, :pack_revealed]
    @test types(player_view(s, v)) == [:role_assigned]
    @test types(player_view(s, seer_of(s))) == [:role_assigned]
    @test player_view(s, v)[1].payload[:role] == :villager
    pack = player_view(s, w)[2]
    @test sort(pack.payload[:members]) == wolves_of(s)
    @test sort(pack.visible_to) == wolves_of(s)
end

@testset "engine: elimination and win check (R7.6, R9.1, R9.2)" begin
    s = new_game()
    v = villagers_of(s)[1]

    # one elimination: card revealed, original state untouched, game goes on
    s2, ev = elimination(s, v, :elimination)
    @test types(ev) == [:elimination]
    @test ev[1].target == v
    @test ev[1].payload[:role] == :villager
    @test ev[1].visible_to === :all
    @test !s2.in_game[v]
    @test s.in_game[v]                       # copy: the input state is unchanged
    @test length(s.history) < length(s2.history)
    @test s2.winner === nothing
    @test !is_over(s2)
    @test length(players_left(s2)) == 7

    # a dead player can't be eliminated again
    @test_throws AssertionError elimination(s2, v, :elimination)

    # both wolves out -> village wins, game_end comes after the death
    s3, ev = eliminate_all(s, wolves_of(s))
    @test s3.winner == :village
    @test is_over(s3)
    @test types(ev) == [:elimination, :game_end]
    @test ev[end].payload[:winner] == :village
    @test types(s3.history[end-1:end]) == [:elimination, :game_end]

    # 2 wolves vs 3 others: not over yet; 2 vs 2: the wolves win (parity)
    others = findall(!=(:werewolf), s.roles)
    s4, _ = eliminate_all(s, others[1:3], :death_announced)
    @test s4.winner === nothing
    s5, ev = eliminate_all(s4, others[4:4], :death_announced)
    @test s5.winner == :werewolves
    @test types(ev) == [:death_announced, :game_end]
end

@testset "engine: seer (R3.5, R3.6)" begin
    s = new_game()
    seer = seer_of(s)
    w = wolves_of(s)[1]
    v = villagers_of(s)[1]

    s2, ev = seer_inspect(s, w)
    @test types(ev) == [:inspect]
    @test ev[1].actor == seer
    @test ev[1].target == w
    @test ev[1].payload[:role] == :werewolf
    @test ev[1].visible_to == [seer]
    @test :inspect in types(player_view(s2, seer))
    @test !(:inspect in types(player_view(s2, v)))     # nobody else sees it
    @test !(:inspect in types(player_view(s2, w)))
    @test length(s.history) + 1 == length(s2.history)  # input unchanged

    # re-inspecting is allowed (R3.6)
    s3, ev = seer_inspect(s2, w)
    @test ev[1].payload[:role] == :werewolf

    # illegal inspections
    @test_throws AssertionError seer_inspect(s, seer)                          # herself
    dead_v, _ = elimination(s, v, :elimination)
    @test_throws AssertionError seer_inspect(dead_v, v)                        # dead target
    dead_seer, _ = elimination(s, seer, :death_announced)
    @test_throws AssertionError seer_inspect(dead_seer, w)                     # dead seer
end

@testset "engine: wolves (R3.3, R3.4)" begin
    s = new_game()
    wolves = wolves_of(s)
    v = villagers_of(s)[1]

    s2, ev = werewolves_kill(s, v)
    @test types(ev) == [:wolf_target]
    @test ev[1].target == v
    @test ev[1].actor in wolves
    @test sort(ev[1].visible_to) == wolves
    @test s2.in_game[v]                                  # the kill happens at dawn, not now
    @test :wolf_target in types(player_view(s2, wolves[2]))
    @test !(:wolf_target in types(player_view(s2, v)))
    @test !(:wolf_target in types(player_view(s2, seer_of(s))))

    # the seer is a legal target too
    _, ev = werewolves_kill(s, seer_of(s))
    @test ev[1].target == seer_of(s)

    # after one wolf dies, only the living wolf acts and sees
    one_dead, _ = elimination(s, wolves[1], :elimination)
    _, ev = werewolves_kill(one_dead, v)
    @test ev[1].actor == wolves[2]
    @test ev[1].visible_to == [wolves[2]]

    # illegal targets
    @test_throws AssertionError werewolves_kill(s, wolves[1])                  # a wolf
    dead_v, _ = elimination(s, v, :elimination)
    @test_throws AssertionError werewolves_kill(dead_v, v)                     # dead player
end

@testset "engine: dawn (R4.1, R4.2, R9.2)" begin
    s = new_game()
    v = villagers_of(s)[1]

    # normal night: dawn, then the death with the card revealed, all public
    s1, _ = werewolves_kill(s, v)
    s2, ev = dawn(s1)
    @test types(ev) == [:dawn, :death_announced]
    @test ev[1].payload[:deaths] == [v]
    @test ev[2].target == v
    @test ev[2].payload[:role] == :villager
    @test all(e -> e.visible_to === :all, ev)
    @test types(s2.history[end-1:end]) == [:dawn, :death_announced]   # history in the same order
    @test !s2.in_game[v]
    @test s1.in_game[v]                                               # input unchanged
    @test s2.winner === nothing
    for i in players_left(s2)                                         # every living player sees it
        @test types(player_view(s2, i)[end-1:end]) == [:dawn, :death_announced]
    end

    # the wolves can win at dawn: 2 wolves vs 3 others, the night kill makes it 2 vs 2
    others = findall(!=(:werewolf), s.roles)
    t, _ = eliminate_all(s, others[1:3])
    t1, _ = werewolves_kill(t, others[4])
    t2, ev = dawn(t1)
    @test types(ev) == [:dawn, :death_announced, :game_end]
    @test t2.winner == :werewolves
    @test types(t2.history[end-2:end]) == [:dawn, :death_announced, :game_end]

    # dawn twice in a row (the victim is already dead), or with no wolf target at all
    @test_throws AssertionError dawn(s2)
    @test_throws AssertionError dawn(s)
end

# Everyone living votes for x; x votes for the first other living player
function ballots_against(s, x)
    other = first(filter(!=(x), players_left(s)))
    return Dict(v => (v == x ? other : x) for v in players_left(s))
end

# A 4-4 tie between players 1 and 2 (8 players alive)
const TIE_1_2 = Dict(1 => 2, 2 => 1, 3 => 1, 4 => 1, 5 => 2, 6 => 2, 7 => 2, 8 => 1)

@testset "engine: vote (R7.1-R7.3, R7.5, R7.6)" begin
    s = new_game()

    # clear winner: 8 votes, the result, then the elimination with the card revealed
    s2, ev = vote(s, ballots_against(s, 3))
    @test types(ev) == [fill(:vote, 8); :vote_result; :elimination]
    @test all(e -> e.visible_to === :all, ev)
    @test all(e -> e.payload[:ballot] == :main, ev[1:8])
    @test [e.actor for e in ev[1:8]] == 1:8                       # sorted, reproducible
    r = ev[9].payload
    @test r[:tally][3] == 7
    @test r[:tied] == false && r[:runoff] == false
    @test r[:eliminated] == 3 && ev[9].target == 3
    @test ev[10].target == 3 && ev[10].payload[:role] == s.roles[3]
    @test !s2.in_game[3]
    @test all(s.in_game)                                          # input unchanged
    @test types(s2.history[end-1:end]) == [:vote_result, :elimination]

    # tie: nobody dies, the sorted candidates are stored for the runoff
    s3, ev = vote(s, TIE_1_2)
    @test types(ev) == [fill(:vote, 8); :vote_result]
    r = ev[end].payload
    @test r[:tied] == true && r[:runoff] == true
    @test r[:eliminated] === nothing
    @test r[:candidates] == [1, 2]
    @test all(s3.in_game)

    # three-way tie
    _, ev = vote(s, Dict(1 => 2, 2 => 3, 3 => 1, 4 => 2, 5 => 3, 6 => 1, 7 => 4, 8 => 5))
    @test ev[end].payload[:candidates] == [1, 2, 3]

    # illegal ballots
    b = ballots_against(s, 3); delete!(b, 5)
    @test_throws AssertionError vote(s, b)                        # someone didn't vote (R7.5)
    b = ballots_against(s, 3); b[4] = 4
    @test_throws AssertionError vote(s, b)                        # self-vote (R7.2)
    dead, _ = elimination(s, 6, :elimination)
    @test_throws AssertionError vote(dead, ballots_against(s, 3)) # a dead player votes
    b = ballots_against(dead, 3); b[4] = 6
    @test_throws AssertionError vote(dead, b)                     # vote for a dead player

    # the wolves can win on a vote: 2 wolves vs 3 others, voting out one more makes 2 vs 2
    others = findall(!=(:werewolf), s.roles)
    t, _ = eliminate_all(s, others[1:3])
    t2, ev = vote(t, ballots_against(t, others[4]))
    @test types(ev[end-2:end]) == [:vote_result, :elimination, :game_end]
    @test t2.winner == :werewolves
end

@testset "engine: runoff (R7.4)" begin
    s = new_game()
    tied, _ = vote(s, TIE_1_2)

    # the runoff votes decide: everyone but 1 votes for 1 -> 1 is eliminated, no random draw
    b = Dict(v => (v == 1 ? 2 : 1) for v in 1:8)
    s2, ev = runoff(tied, b, MersenneTwister(1))
    @test types(ev) == [fill(:vote, 8); :vote_result; :elimination]
    @test all(e -> e.payload[:ballot] == :runoff, ev[1:9])
    r = ev[9].payload
    @test r[:eliminated] == 1
    @test r[:tied] == false && r[:runoff] == false
    @test !s2.in_game[1] && s2.in_game[2]

    # same for the other candidate (so the result doesn't ignore the ballots)
    b = Dict(v => (v == 2 ? 1 : 2) for v in 1:8)
    s3, ev = runoff(tied, b, MersenneTwister(1))
    @test ev[9].payload[:eliminated] == 2
    @test !s3.in_game[2] && s3.in_game[1]

    # tied again: one of the candidates is drawn at random, reproducible from the seed
    picks = Int[]
    for seed in 1:30
        s4, ev = runoff(tied, TIE_1_2, MersenneTwister(seed))
        r = ev[9].payload
        @test r[:tied] == true && r[:runoff] == false
        @test r[:eliminated] in (1, 2)
        @test count(!, s4.in_game) == 1                           # exactly one death
        push!(picks, r[:eliminated])
    end
    @test Set(picks) == Set([1, 2])                               # both can be drawn
    pick(seed) = runoff(tied, TIE_1_2, MersenneTwister(seed))[2][9].payload[:eliminated]
    @test pick(7) == pick(7)

    # illegal runoffs
    b = Dict(v => (v == 3 ? 1 : 3) for v in 1:8)
    @test_throws AssertionError runoff(tied, b, MersenneTwister(1))          # 3 isn't a candidate
    @test_throws AssertionError runoff(s, TIE_1_2, MersenneTwister(1))       # no vote yet
    clear, _ = vote(s, ballots_against(s, 3))
    @test_throws AssertionError runoff(clear, ballots_against(clear, 1), MersenneTwister(1))  # no tie
    again, _ = runoff(tied, TIE_1_2, MersenneTwister(1))
    alive = players_left(again)
    @test_throws AssertionError runoff(again, ballots_against(again, alive[1]), MersenneTwister(1))  # runoff already done
end

@testset "engine: legal actions (R3.4, R3.6, R7.2, R7.4)" begin
    s = new_game()
    seer, wolves, vill = seer_of(s), wolves_of(s), villagers_of(s)

    @test legal_actions(s, seer, :inspect) == filter(!=(seer), 1:8)
    @test legal_actions(s, wolves[1], :wolf_target) == findall(!=(:werewolf), s.roles)
    @test legal_actions(s, vill[1], :vote) == filter(!=(vill[1]), 1:8)
    @test_throws ErrorException legal_actions(s, vill[1], :dance)

    # dead players are never targets, and dead players can't act
    dead, _ = elimination(s, vill[2], :elimination)
    @test !(vill[2] in legal_actions(dead, seer, :inspect))
    @test !(vill[2] in legal_actions(dead, wolves[1], :wolf_target))
    @test !(vill[2] in legal_actions(dead, vill[1], :vote))
    @test_throws AssertionError legal_actions(dead, vill[2], :vote)

    # runoff: the candidates except yourself, only when a runoff is due
    @test_throws AssertionError legal_actions(s, 3, :runoff)
    tied, _ = vote(s, TIE_1_2)
    @test runoff_candidates(tied) == [1, 2]
    @test legal_actions(tied, 1, :runoff) == [2]
    @test legal_actions(tied, 2, :runoff) == [1]
    @test legal_actions(tied, 5, :runoff) == [1, 2]
end

@testset "agents: random" begin
    s = new_game()
    a = RandomAgent()
    legal = legal_actions(s, 1, :vote)
    view = player_view(s, 1)
    for seed in 1:50
        action, values = act(a, view, :vote, legal, MersenneTwister(seed))
        @test action in legal
        @test length(values) == length(legal)
        @test sum(values) ≈ 1
    end
    picks = Set(act(a, view, :vote, legal, MersenneTwister(seed))[1] for seed in 1:200)
    @test picks == Set(legal)                                     # every legal target gets picked
    @test act(a, view, :vote, legal, MersenneTwister(3)) == act(a, view, :vote, legal, MersenneTwister(3))
    @test_throws AssertionError act(a, view, :vote, Int[], MersenneTwister(1))
end
