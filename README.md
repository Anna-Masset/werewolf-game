# How a Village Acts with Fear

AA228/CS238 final project: a Werewolf (*Les Loups-garous de Thiercelieux*) simulator where every
player is an agent that keeps a belief over the hidden roles and plans its actions.

This repository currently contains the **viewer only**: a static web app that replays games from
JSON log files. The simulator will write logs in the same format later. Until then, the viewer runs
on hand-scripted **mock** logs.

```
schema/game_log.schema.json   the log format (the contract between simulator and viewer)
viewer/                       Vite + React + TypeScript app (no backend)
  public/logs/                game logs + index.json (the list on the start screen)
  public/results/summary.csv  experiment summary (mock for now)
  scripts/                    mock generator, validator, index builder
  src/                        the app
```

## Running the viewer

Requires Node 20+.

```bash
cd viewer
npm install
npm run dev        # http://localhost:5173
```

Other commands:

| command | what it does |
|---|---|
| `npm run build` | type-check and build a static site into `viewer/dist/` (open it from any static server) |
| `npm run validate-logs` | validate every log in `public/logs/` against the schema |
| `npm run validate-logs -- path/to/log.json` | validate specific files, e.g. simulator output |
| `npm run index-logs` | rebuild `public/logs/index.json` from the files in `public/logs/` |
| `npm run mock` | regenerate the mock logs and `summary.csv` (overwrites them) |

Keyboard shortcuts in the game view: **← / →** step, **space** play/pause, **Home / End** jump.

### What's on screen

- **Village:** each token has two rings. The thick one is the POV's P(*focus role*); pick the focus
  role with "Watching for". The thin gold one is the village consensus P(Werewolf). Both numbers
  are printed. During votes, arrows go from voter to target; hover a player to isolate their arrows.
- **Now tab:** what the POV saw in this step, the vote tally, and a **decision card** at each POV
  decision: observations since the last decision → belief *b* → *U*(*b*, *a*) for every action →
  π(*b*) = argmax. Use ◀ / ▶ to jump between decisions (🧠 on the timeline).
- **Suspicion tab:** sorted bars with ▲/▼ change since the previous step.
- **Event feed tab:** everything the POV experienced so far, filterable by type. Click a step to jump to it.
- **Belief history:** one line per player, drawn up to the current step only, so nothing is spoiled.
  Click names to pin up to 4 coloured lines, hover for values, and click the chart to jump.
  With *Show truth* on, the true werewolves' lines are dashed.
- **Watching for:** *auto* follows the role the POV most needs to find next. Villagers hunt the
  Werewolf; a wolf hunts the Seer, then the Witch once the Seer is revealed, then the Little Girl.
  Click a role to pick one yourself.
- **📜 Summary**, which opens automatically at the end: the winner, eliminations in order, belief
  accuracy over time (the average P(Werewolf) on the true werewolves, against the village average
  and chance), turning points (the biggest belief jumps, excluding card reveals), and villagers
  ranked by accuracy.
- **📊 Experiments** (link on the start screen): reads `public/results/summary.csv`, shows win rates
  by role and by personality (split by team), and lists the games. Games that have a log file open
  in the viewer.

### `summary.csv` format (for the experiments page)

One row per game, with a header row:

```csv
game_id,log_file,seed,n_players,winner,rounds,roster
sim-0001,game_0001.json,42,13,village,4,"Amélie|seer|discreet|died;Bastien|werewolf|manipulative|survived;..."
```

- `log_file`: a file name in `public/logs/`, or empty if no log was saved.
- `winner`: `village` or `werewolves`.
- `roster`: `;`-separated entries of `name|role|personality|survived` (or `died`).

## Adding a log file

Either:

- **Quick look:** on the start screen, click *Open a log file…* and pick any `.json` log. It is
  validated on load, and you'll see a list of problems if it doesn't match the schema.
- **Bundle it:** copy the file into `viewer/public/logs/`, then run `npm run index-logs` so it
  shows up in the start screen list. Run `npm run validate-logs` to check it.

## Log format (v1.0.0)

The full definition is in [`schema/game_log.schema.json`](schema/game_log.schema.json) (JSON
Schema draft 2020-12). In short:

```jsonc
{
  "meta":    { "schema_version": "1.0.0", "seed": 42, "config": { "role_counts": {...} },
               "timestamp": "2026-10-18T20:00:00Z", "title": "optional", "mock": false },
  "players": [ { "id": "p01", "name": "Amélie", "role": "seer", "team": "village",
                 "personality": "discreet" } ],
  "steps":   [ {
      "t": 0, "round": 1, "phase": "night", "subphase": "seer",
      "events":    [ { "type": "inspect", "actor": "p01", "target": "p06",
                       "payload": { "role": "werewolf" }, "visible_to": ["p01"] } ],
      "beliefs":   { "p01": { "p06": { "werewolf": 1, "seer": 0, "villager": 0 } } },
      "decisions": [ { "player": "p01", "kind": "inspect",
                       "options": [ { "action": "inspect", "target": "p06", "value": 0.81 } ],
                       "chosen": 0 } ]
  } ],
  "result":  { "winner": "village", "final_round": 4,
               "eliminations": [ { "player": "p08", "round": 1, "phase": "day", "cause": "vote" } ] }
}
```

Rules for the simulator:

- **Player ids** look like `p01`, `p02`, …. Roles: `werewolf, seer, witch, little_girl, villager, cupid`.
  Teams: `village, werewolves` (`lovers` is reserved for cupid). Personalities:
  `aggressive, discreet, manipulative, trusting`.
- **Steps** are ordered, and `t` is the step index (0, 1, 2, …). `phase` is `setup | night | day | end`.
  `subphase` is a free display label (`seer`, `wolves`, `witch`, `dawn`, `conversations`, `debate`,
  `vote`, `runoff`, …).
- **Visibility:** each event has `visible_to: "all"` or a list of player ids. In POV mode the
  viewer only shows events visible to that player. For example, an inspection is visible to the
  seer, and `wolf_target` is visible to the wolves and the witch.
- **Beliefs:** after each step, for every *living* observer, a role distribution for every other
  player. Each distribution should sum to 1; the viewer warns if it's off by more than 0.02.
- **Decisions:** `options` with a planner `value` each, plus `chosen` (an index into `options`).
  `target` and `label` on an option are optional.
- **Event types and payloads:**

  | type | actor → target | payload |
  |---|---|---|
  | `role_assigned` | player → null | `{role}` (visible to that player) |
  | `pack_revealed` | null → null | `{members: [ids]}` (visible to the wolves) |
  | `spy` | little girl → (glimpsed) | `{outcome: nothing\|glimpsed\|caught, glimpsed?}` |
  | `wolf_target` | a wolf → victim | `{}` |
  | `inspect` | seer → target | `{role}` |
  | `potion` | witch → target | `{kind: heal\|poison}` |
  | `dawn` | null → null | `{deaths: [ids]}` |
  | `death_announced` | null → dead player | `{role}` (card revealed) |
  | `conversation` | a → b | `{topic?}` (visible to both) |
  | `impression` | holder → other | `{verdict: convincing\|suspicious}` (visible to holder) |
  | `statement` | speaker → target? | `{kind: accuse\|defend\|claim_role\|quiet, claimed_role?, text?}` |
  | `vote` | voter → target | `{ballot?: main\|runoff}` |
  | `vote_result` | null → eliminated? | `{tally: {id: n}, tied, runoff?, ballot?, eliminated: id\|null}` |
  | `elimination` | null → eliminated | `{role}` |
  | `game_end` | null → null | `{winner}` |
  | `lovers_bound`, `captain_elected` | reserved for cupid / captain | — |

  Bluffs aren't flagged in the log: the viewer detects them by comparing `claimed_role` with the
  true role, and only shows that to players who know the truth (or the Narrator).

## Mock data

`viewer/scripts/generate_mock_logs.ts` writes three **hand-scripted** games. These are story beats,
not game logic. Beliefs are shaped by simple scripted nudges, and decision values are invented:

| file | players | winner | covers |
|---|---|---|---|
| `game_13p.json` | 13 | village | witch heals and poisons, little girl caught, seer finds a wolf, a wolf bluffs "seer", tied vote → runoff |
| `game_9p.json` | 9 | werewolves | little girl glimpses a wolf and is voted out anyway, seer killed night 1, witch never uses her potions |
| `game_short.json` | 8 | village | 2 rounds; counter-claimed seer (bluff), both potions |

`summary.csv` mixes one row per mock log with 60 random rows from a seeded RNG.
