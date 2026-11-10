# Game rules

The rules the engine implements. Every rule has an id (`R4.2`, …) so code, tests and the report
can refer to it, e.g. `# R4.2: witch can't heal herself`.

How to read a rule:

- **Options** lists the variants worth considering. `(simplest)` marks the one that is easiest to
  implement *and* to model in a belief. It's a suggestion, not a decision.
- **Decision** is what the engine does. `TBD` until we pick.
- **Affects** says which part of the POMDP the choice touches: the state `s`, the actions `A`,
  the transitions `T`, the observations `O`, or the size of the belief.

When a rule is decided, write it as a short sentence the engine can follow without interpretation.

## Scope: v0 first, then the full game

| | **v0** (target: project update, Fri 2026-11-13) | **full game** (later) |
|---|---|---|
| players | 7: 2 werewolves, 1 seer, 4 villagers | 13: 3 wolves, seer, witch, little girl, 7 villagers |
| personalities | none | R1.3 |
| night | seer, wolves | + witch, little girl |
| day | TBD (see R5–R7: vote only, or statements too?) | conversations, statements, vote |

Rules tagged **`[full]`** don't apply to v0; leave them TBD for now. Everything else must be decided
for v0. The engine should still take the role counts as a parameter, so going to 13 players later
means adding rules, not rewriting them.

Size check for v0: a villager's hidden state is which 2 of the other 6 are wolves and which of the
remaining 4 is the seer: C(6,2) · 4 = 60 role assignments. Small enough for an exact belief.

---

## 1. Setup

### R1.1 Players and roles
- **Decision (v0):** 7 players: 2 werewolves, 1 seer, 4 villagers.
- **Decision (full):** 13 players: 3 werewolves, 1 seer, 1 witch, 1 little girl, 7 villagers. *(from the proposal)*

### R1.2 Role assignment
- **Options:** (a) uniformly random permutation of the role multiset, from the game seed *(simplest)*
- **Decision:** TBD
- **Affects:** the prior b₀. Uniform assignment = the "counting" prior is exact.

### R1.3 Personality assignment `[full]`
- **v0:** no personalities. (The log still needs a value per player: write a placeholder, e.g. `discreet` for everyone, and ignore it.)
- **Question:** which personalities exist, and how are they assigned?
  The schema has `aggressive, discreet, manipulative, trusting`; the proposal also mentions
  `conformist`. Pick the final list (the schema can be extended).
- **Options:** (a) each player independently uniform over K types *(simplest)*;
  (b) fixed counts per game; (c) depends on role (e.g. wolves more often manipulative)
- **Decision:** TBD
- **Affects:** the belief size (K¹² personality hypotheses). Independence of role makes the prior factor.

### R1.4 What each player knows at the start
- **Options:** own role only; wolves also know the pack *(standard)*. Does anyone know anyone's personality? Own personality?
- **Decision:** TBD
- **Affects:** b₀, `role_assigned` / `pack_revealed` visibility.

---

## 2. Round structure

### R2.1 Does the game start with a night or a day?
- **Options:** (a) night 1 first *(standard)*; (b) day 1 first (the first vote is pure noise)
- **Decision:** TBD

### R2.2 Order of one round
- **Template:** night (subphases in the order of R3.1) → dawn (R4) → day: conversations (R5) →
  statements (R6) → vote (R7) → runoff if needed → next round.
- **Decision:** TBD
- **Note:** this order is also the order of `steps` in the log and of the `subphase` labels.

### R2.3 Round limit
- **Question:** if every vote eliminates someone, a 13-player game ends in at most ~12 rounds.
  If a vote can eliminate nobody (abstentions, R7.5), the game can last forever. Cap it?
- **Options:** (a) every vote always eliminates someone, no cap needed *(simplest)*; (b) cap at N rounds, then who wins?
- **Decision:** TBD

---

## 3. Night

### R3.1 Night order
- **Options:** (a) little girl spies *during* the wolves' turn → seer → wolves → witch *(standard)*; (b) seer first, then wolves + little girl, then witch
- **Decision:** TBD
- **Affects:** what the witch knows when she acts (she must act after the wolves).

### R3.2 Can night powers be used on night 1?
- **Decision:** TBD (standard: yes, all of them)

### R3.3 Wolves: who chooses the victim?
There are several wolves but one victim.
- **Options:**
  (a) each wolf proposes, majority wins, ties broken at random *(simple, symmetric)*;
  (b) one wolf (random or rotating) proposes, the others accept;
  (c) the pack acts as a single agent (one decision for the team)
- **Decision:** TBD
- **Affects:** `A` for wolves, and whether one wolf's model must predict the other wolves.
  (c) is the simplest to plan for.

### R3.4 Wolves: legal targets
- **Options:** any living non-wolf *(standard)*; can wolves skip the kill?
- **Decision:** TBD

### R3.5 Seer: what she sees
- **Options:** (a) the exact role of the inspected player *(standard, matches the log payload)*; (b) only wolf / not wolf
- **Decision:** TBD
- **Affects:** `O`. (b) gives a coarser, cheaper observation.

### R3.6 Seer: legal targets
- **Question:** any living player other than herself? Can she re-inspect someone already inspected? (A rational agent wouldn't, but a random one would.)
- **Decision:** TBD

### R3.7 Witch: what she knows `[full]`
- **Question:** does she always learn the wolves' victim? Even after her heal potion is used?
- **Options:** (a) she always sees the victim *(simplest, standard)*; (b) only while she still has the heal potion
- **Decision:** TBD
- **Affects:** `O` for the witch: seeing the victim every night is a strong signal (a wolf target is never a wolf).

### R3.8 Witch: potions `[full]`
- Each potion is used at most once per game. *(fixed)*
- **Can she heal herself?** TBD (standard variants differ; "no" makes her more vulnerable)
- **Both potions in the same night?** TBD
- **Poison targets:** any living player other than herself? TBD
- **Action space per night:** e.g. `{nothing, heal, poison j, heal + poison j}` restricted by remaining potions. TBD
- **Affects:** `s` (potions left), `A`, `T` (0–2 deaths per night).

### R3.9 Little girl: spying `[full]`
- **Can she choose not to spy?** TBD (if yes, spying is a real decision with risk: good for the project)
- **p_see** (sees a wolf): TBD — suggestion: 0.3
- **p_caught**: TBD — suggestion: 0.1
- **Are "see" and "caught" independent draws?** TBD
- **What does she see?** (a) the identity of one random living wolf *(simplest)*; (b) all wolves; (c) the victim only
- **Decision:** TBD
- **Affects:** `O` for the little girl, `T` (death risk).

### R3.10 Little girl: when caught `[full]`
- **Options:** (a) the wolves learn who she is and she dies *instead of* their victim; (b) she dies *in addition*; (c) the wolves only learn who she is (no death)
- **Decision:** TBD
- **Does the witch's heal save her?** TBD
- **Cause in the log:** `caught_spying`

---

## 4. Dawn

### R4.1 Who dies
- **Rule template:** victim dies unless healed; poisoned player dies; caught little girl per R3.10. A player killed twice dies once.
- **Decision:** TBD

### R4.2 What the village learns
- **Is the cause of death revealed?** (wolves / poison / caught) **Options:** (a) no, only "X died" *(standard)*; (b) yes
- **Is the role card revealed?** (a) yes, every death *(standard, matches `death_announced`)*; (b) no
- **Order of the death list:** shuffled, so the order doesn't leak the cause. TBD
- **Decision:** TBD
- **Affects:** `O` for everyone. Revealed cards are the hard constraints of the counting belief.

---

## 5. Day: conversations

### R5.1 How pairs form
- **Options:** (a) random perfect matching of the living players *(simplest, no decision)*;
  (b) everyone picks a partner, then a matching algorithm pairs them (mutual picks first, rest random);
  (c) everyone picks a partner and every pick is a conversation (some players talk several times)
- **Decision:** TBD
- **Odd number of players:** who sits out, or one group of three? TBD
- **Affects:** `A` (`talk_to` is a decision only in b and c).

### R5.2 What a conversation produces
- **Rule template:** each participant gets a private impression of the other: `convincing` or
  `suspicious`. The probabilities belong to the *model* (B2), not the rules.
- **Are both impressions independent?** TBD
- **Who sees that a conversation happened?** (a) only the pair; (b) everyone (but not the impressions)
- **Decision:** TBD

---

## 6. Day: statements

### R6.1 Order
- **Options:** (a) simultaneous; (b) sequential, in a random order each day *(lets later speakers react)*; (c) sequential, fixed order
- **Decision:** TBD

### R6.2 What a player can say
One statement per player per day, from:
- `accuse j` / `defend j` (j living, not self)
- `claim_role r` — which roles can be claimed? Any role, including villager? TBD
- `quiet`
- **Can a seer claim announce results** ("I inspected j: wolf")? This is much richer and much harder to model. **Options:** (a) no, role claims only *(simplest)*; (b) yes
- **Decision:** TBD
- **Affects:** `A` for everyone, and the observation model for the belief.

### R6.3 Lying
- **Rule template:** any player may claim any allowed role (bluffs allowed). Nothing in the rules flags a lie; the card revealed at death is the only proof.
- **Decision:** TBD

---

## 7. Day: vote

### R7.1 Order
- **Options:** (a) simultaneous; (b) sequential in random order, every vote public as it's cast *(allows following the crowd)*
- **Decision:** TBD
- **Affects:** `O` during the vote, and which personalities can be expressed.

### R7.2 Legal votes
- **Question:** any living player other than self? Can wolves vote for a wolf? (allowed, just usually bad)
- **Decision:** TBD

### R7.3 Majority
- **Options:** (a) plurality: most votes is eliminated *(simplest)*; (b) absolute majority required
- **Decision:** TBD

### R7.4 Ties
- **Options:** (a) random among the tied *(simplest)*; (b) runoff vote among the tied, then random if still tied; (c) nobody dies
- **In a runoff, do the tied players vote? Can they be voted for only?** TBD
- **Decision:** TBD

### R7.5 Abstention
- **Options:** (a) not allowed *(simplest, guarantees the game ends)*; (b) allowed
- **Decision:** TBD

### R7.6 After the vote
- The eliminated player's card is revealed (`elimination` event with `{role}`). TBD
- **Last words?** (a) none *(simplest)*

---

## 8. Death

### R8.1 Dead players
- Dead players take no actions, make no statements, and don't vote. Their card is public. *(fixed)*
- Unused powers die with them (the witch's potions, etc.). *(fixed)*

---

## 9. End of the game

### R9.1 Win conditions
- **Village** wins when no wolf is alive.
- **Wolves** win when living wolves ≥ living non-wolves.
- **Decision:** TBD (confirm)

### R9.2 When it's checked
- **Options:** (a) after every death (dawn and vote) *(standard)*; (b) only at the end of each phase
- **Both conditions at once** (e.g. last wolf and enough villagers die the same night): who wins? TBD
- **Everyone dead?** TBD (can it happen with poison + wolves?)

### R9.3 Rewards (link to the POMDP)
- **Decision:** +1 if the agent's team wins, −1 if it loses, 0 otherwise, discount γ < 1. *(from the proposal)*
- Shaping terms (fear, good/bad eliminations) are B6, not rules.

---

## 10. Who sees what (observation table)

Fill this in once the sections above are decided. It is the observation function, and it becomes
the `visible_to` of every event.

| event | visible to |
|---|---|
| `role_assigned` | the player |
| `pack_revealed` | the wolves |
| `spy` | TBD (little girl; wolves if caught?) |
| `wolf_target` | TBD (wolves, witch?) |
| `inspect` | seer |
| `potion` | TBD (witch only?) |
| `dawn` / `death_announced` | all |
| `conversation` | TBD (R5.2) |
| `impression` | the holder |
| `statement` | all |
| `vote` | all (TBD: as cast, or all at once — R7.1) |
| `vote_result` / `elimination` | all |
| `game_end` | all |

---

## 11. Out of scope

Explicitly not simulated, so nobody asks later:

- Cupid / lovers, captain (schema keeps them reserved), hunter, other expansion roles.
- Natural language: statements are discrete actions, conversations are impressions.
- Wolves talking among themselves at night beyond choosing the victim (R3.3).
- Last words, revealing a card voluntarily.
- TBD: anything else?

---

## 12. Parameters

Numbers the engine reads from `config` (logged in `meta.config`).

| name | value | rule |
|---|---|---|
| `role_counts` | 3 / 1 / 1 / 1 / 7 | R1.1 |
| `personalities` | TBD | R1.3 |
| `p_see` | TBD | R3.9 |
| `p_caught` | TBD | R3.9 |
| `max_rounds` | TBD | R2.3 |

Model parameters (impression probabilities, policies by role and personality) are not rules:
they go with the models in B2.

---

## Change log

- 2026-11-10: template.
- 2026-11-10: v0 scope (7 players, 2 wolves, seer, no personalities) for the Fri 2026-11-13 update.
