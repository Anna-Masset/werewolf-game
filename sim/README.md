# Simulator (Julia)

The backend: game engine, belief-tracking agents and experiments. It writes game logs that the
viewer in `../viewer` replays. See [ROADMAP.md](ROADMAP.md) for the milestones.

```
Project.toml        Julia project (module Werewolf)
src/Werewolf.jl     module file: include your source files here
src/gamelog.jl      log writer (glue to the viewer, no game logic)
scripts/            runnable scripts (demo_log.jl for now)
test/runtests.jl    tests
out/                generated logs (git-ignored)
```

## Setup and commands

Requires Julia 1.10+. For `validate_with_viewer`, also Node 20+ and `npm install` in `../viewer`.

```bash
cd sim
julia --project=. -e 'using Pkg; Pkg.instantiate()'   # once
julia --project=. -e 'using Pkg; Pkg.test()'          # run the tests
julia --project=. scripts/demo_log.jl                 # write and validate out/demo.json
```

In the REPL: `julia --project=.`, then `using Revise, Werewolf` (Revise reloads your edits; add it
to your global environment with `] add Revise`).

To view a log: open it in the viewer with *Open a log file…*, or copy it into
`../viewer/public/logs/` and run `npm run index-logs` there.

## Log writer API (`src/gamelog.jl`)

Player ids can be integers (`3` → `"p03"`) or strings. Roles, phases, kinds, ... can be Symbols.

| call | what it does |
|---|---|
| `GameLog(seed=42, role_counts=Dict(:werewolf=>3, ...), config=Dict(...), title=nothing)` | new log |
| `add_player!(log, i, name, role, team, personality=:none)` | one entry in `players` (leave out the personality for games without them) |
| `begin_step!(log, round, phase; subphase="vote")` | starts a new step; `t` is automatic |
| `add_event!(log, type, actor, target, payload=Dict(); visible_to=:all)` | event in the current step; `visible_to` is `:all` or a list of players |
| `set_belief!(log, observer, target, Dict(role=>p))` | one role distribution (missing roles = 0) |
| `set_beliefs!(log, observer, Dict(target=>Dict(role=>p)))` | all of an observer's targets at once |
| `add_decision!(log, player, kind, options, chosen)` | `options = [(action=:vote, target=3, value=0.4, label="…"), …]`; `chosen` is **1-based** |
| `add_elimination!(log, player, cause)` | death in `result.eliminations` at the current step |
| `finish!(log, winner; final_round=current round)` | sets the result |
| `check_log(log)` | list of problems (subset of the schema + belief sums) |
| `write_log(path, log; check=true, pretty=false)` | writes JSON; refuses if `check_log` finds problems |
| `validate_with_viewer(path)` | runs the viewer's full schema validator |

The event types and payloads are listed in the [main README](../README.md#log-format-v100).
Beliefs: at every step, log one distribution per *living* observer and every other player.
