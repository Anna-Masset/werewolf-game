# Plays N games from seeds 1..N, checks every log, writes the first few to out/, prints win rates.
#
#     julia --project=. scripts/run_games.jl                 # 1000 random games, writes 5 logs
#     julia --project=. scripts/run_games.jl 5000 20         # 5000 games, writes 20 logs
#
# Then open a log from out/ in the viewer ("Open a log file…" on the start screen), or copy them to
# ../viewer/public/logs/ and run `npm run index-logs` there to list them on the start screen.
#
# Glue only: the game itself is play_game (src/game.jl) with the agents chosen below.

using Werewolf, Random
using Werewolf: play_game, game_log, RandomAgent

const ROLE_COUNTS = Dict(:werewolf => 2, :seer => 1, :villager => 5)
const N_PLAYERS = sum(values(ROLE_COUNTS))

# Which agent each player uses. Later: e.g. greedy for some players, random for the others.
make_agents() = [RandomAgent() for _ in 1:N_PLAYERS]
const AGENTS_LABEL = "random vs random"

n_games = length(ARGS) >= 1 ? parse(Int, ARGS[1]) : 1000
n_write = length(ARGS) >= 2 ? parse(Int, ARGS[2]) : 5

outdir = joinpath(@__DIR__, "..", "out")
mkpath(outdir)

village_wins = 0
rounds = Int[]
bad = 0
for seed in 1:n_games
    s, steps = play_game(ROLE_COUNTS, make_agents(), MersenneTwister(seed))
    global village_wins += s.winner == :village
    push!(rounds, steps[end].round)

    log = game_log(s, steps; seed=seed, role_counts=ROLE_COUNTS,
                   title="Game $seed ($AGENTS_LABEL)", config=Dict(:agents => AGENTS_LABEL))
    problems = check_log(log)
    if !isempty(problems)
        global bad += 1
        bad <= 3 && println("seed $seed: ", join(problems[1:min(3, end)], "; "))
        continue
    end
    if seed <= n_write
        write_log(joinpath(outdir, "game_$(lpad(seed, 4, '0')).json"), log)
    end
end

p = village_wins / n_games
se = sqrt(p * (1 - p) / n_games)
println("$AGENTS_LABEL, $n_games games ($(N_PLAYERS) players)")
println("  village wins: $village_wins ($(round(100p, digits=1))% ± $(round(196se, digits=1))%, 95% interval)")
println("  rounds: mean $(round(sum(rounds) / length(rounds), digits=2)), max $(maximum(rounds))")
println("  logs with problems: $bad")
println("  wrote $(min(n_write, n_games)) logs to $(normpath(outdir))")
