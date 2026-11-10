# Backend roadmap

Each milestone ends with logs you can replay in the viewer. Reader = *Algorithms for Decision
Making* (the course reader). Who writes what: the log writer and scripts that don't involve decisions
are glue (Claude). The engine, models, beliefs, agents, planners and evaluation are yours.

| # | Milestone | Reader |
|---|---|---|
| B0 ✅ | Julia project, log writer, demo log, tests | — |
| B1 | Game engine + random agents + "counting" beliefs | Ch 19 intro (POMDP tuple), 19.1 |
| B2 | Models of the other players: π(a \| role, personality), impression model | Ch 24, 26 |
| B3 | Beliefs: exact discrete filter (small games), then particle filter (13 players) | 19.2, 19.6–19.8 |
| B4 | Baselines: random, greedy, QMDP | 21.1 |
| B5 | Online planner: rollouts, then POMCP | 22.1, 22.5 |
| B6 | Personality and fear (reward, discount) | — |
| B7 | Experiments: batch runs → `summary.csv`, win rates by role and personality | — |

---

## B1: game engine and random agents

**Goal:** full games of random agents that run start to finish and replay correctly in the viewer.
There's no intelligence yet, but every piece of the POMDP is in place: the state, the actions,
the transitions, the observations and the end of the game.

### 1. Write down the rules first (`RULES.md`)

A few variants change what an agent can learn, so decide them before coding:

- **Night order.** For example: little girl spies during the wolves' turn, then seer, then wolves, then witch.
- **Wolves' choice.** There are several wolves but only one victim. Who decides? Options: majority of
  proposals with ties broken at random, or one wolf proposes and the others agree.
- **Witch.** Can she heal herself? Can she use both potions in the same night? Does she still see
  the victim after her heal potion is used?
- **Little girl.** Choose p_see and p_caught. If she's caught, does she die instead of the victim or as well?
- **Conversations.** How do the pairs form? Everyone picks a partner and you match them, or the
  pairs are random?
- **Statements and votes.** Simultaneous, or **sequential** in random order? With sequential votes,
  later voters see earlier ones, which is what makes "following the crowd" possible.
- **Ties.** A runoff between the tied players, then random if they tie again?
- **Win check** after every death: the village wins with 0 wolves; the wolves win when wolves ≥ others.

### 2. Separate the true state from what a player sees

- **State `s`:** roles σ, personalities, who is alive, round, phase, potions, and the record of
  public events. Keep it cheap to `copy`. In B5, POMCP will copy a sampled state thousands of times.
- **Observations:** each event's `visible_to` *is* your observation function O(o | s′, a). A
  player's view is the list of events visible to them (plus their own role). Agents may only see this view.
  They must never touch the state. This is the most important rule for honest results.

### 3. Write the transitions as a generative model

The reader's online methods (Ch 22) only need a *generative model*: sample (s′, o, r) given (s, a).
Write your transitions so they can be reused that way:

- one function per subphase that takes the state, the chosen actions and an `rng`, and **returns
  the events** (with visibility) and the new state;
- **no logging and no global randomness inside**. Pass `rng::AbstractRNG` everywhere. The game loop
  is what calls the log writer. This lets the planner run the same code on imagined states.

### 4. One agent interface for every kind of agent

Something like `act(agent, view, kind, legal_actions, rng) → (action, values)`, where `values` is
the planner's value for each legal action. A random agent returns equal values. Later, greedy,
QMDP and POMCP agents fill `values` from U(b, a). That vector goes straight into
`add_decision!`, which is how the decision card in the viewer gets its numbers.

### 5. "Counting" beliefs (your first belief, Reader 19.1)

Before any likelihood model, an agent already knows its own role, the pack if it's a wolf, and the
cards revealed at death. Spread the remaining role counts uniformly over the players whose role is
still unknown. That gives the prior b₀ and its hard-constraint updates. Log it every step for
every living observer: it makes the viewer's gauges move at deaths and inspections. B3 will
replace it, and it's a useful sanity check there (the exact filter with uninformative likelihoods
should reproduce it).

### 6. Done when

- `scripts/run_games.jl` (or similar) plays N random games from seeds. The same seed gives the identical log.
- 1000 games run without errors, and every log passes `check_log`. A few pass `validate_with_viewer`.
- Tests for invariants: dead players never act, each potion is used at most once, every game ends
  (at most 12 days for 13 players), and the winner matches the win condition.
- Win rate of random vs random for 13 players, reported. This is your first baseline number.
- A game opened in the viewer reads like a plausible (if silly) game from every POV.

### Pitfalls

- 1-based vs 0-based: give the writer Julia indices. It converts `chosen` and the player ids itself.
- Information leaks: an agent reading `state.roles` directly. Pass it the view only.
- Beliefs about dead players: keep them in your agent if useful, but only *living* observers must be logged.

When you have a first version, or get stuck on a rule or a design choice, bring it back for a review.
