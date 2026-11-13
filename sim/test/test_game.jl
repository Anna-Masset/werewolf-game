# Tests for the game loop (src/game.jl): whole games of random agents.
# Included from runtests.jl.

using Random
using Werewolf: play_game, game_log, RandomAgent, Decision, StepRecord, players_left

const RC = Dict(:werewolf => 2, :seer => 1, :villager => 5)
random_agents() = [RandomAgent() for _ in 1:8]
play(seed) = play_game(RC, random_agents(), MersenneTwister(seed))

@testset "game loop: whole games" begin
    winners = Symbol[]
    for seed in 1:1000
        s, steps = play(seed)
        push!(winners, s.winner)

        # ends with a winner, by day 3 (R2.3), and the winner matches the parity rule (R9.1)
        @test s.winner in (:village, :werewolves)
        @test steps[end].round <= 3
        w = count(i -> s.roles[i] == :werewolf, players_left(s))
        others = length(players_left(s)) - w
        @test s.winner == (w == 0 ? :village : :werewolves)
        s.winner == :werewolves && @test w >= others

        # one death per night and per day: deaths = 2 per full round (R3.4, R7.3-R7.5)
        deaths = count(e -> e.type in (:death_announced, :elimination), s.history)
        @test deaths == 8 - length(players_left(s))

        # the steps hold every event of the history, in order
        @test reduce(vcat, [st.events for st in steps]) == s.history

        # dead players never act: every decision is by a player alive at that step
        dead = Set{Int}()
        for st in steps
            for d in st.decisions
                @test !(d.player in dead)
                @test d.options[d.chosen] in d.options
                @test !(d.options[d.chosen] in dead)
            end
            for e in st.events
                e.type in (:death_announced, :elimination) && push!(dead, e.target)
            end
        end

        # every log passes the checks
        seed <= 200 && @test isempty(check_log(game_log(s, steps; seed=seed, role_counts=RC)))
    end

    # random vs random: about 23% for the village (RULES R9.1); loose bounds
    @test 0.18 < count(==(:village), winners) / length(winners) < 0.28

    # same seed -> same game
    # (Events hold Dicts, which == compares by identity inside a struct: compare the contents)
    contents(h) = [(e.type, e.actor, e.target, e.payload, e.visible_to) for e in h]
    s1, st1 = play(42); s2, st2 = play(42)
    @test contents(s1.history) == contents(s2.history)
    @test s1.roles == s2.roles
    @test [d.chosen for st in st1 for d in st.decisions] == [d.chosen for st in st2 for d in st.decisions]
end
