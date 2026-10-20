/**
 * ============================================================================
 *  MOCK DATA GENERATOR (throwaway, not the simulator)
 * ============================================================================
 * Writes hand-scripted example games to public/logs/ and a fake experiment
 * summary to public/results/summary.csv so the viewer has something to replay.
 *
 * Nothing here is game logic. Every death, vote and claim is written by hand
 * below as a "story beat". Beliefs are shaped with simple scripted nudges
 * (multiply P(role) by a factor), then rebalanced so each observer's beliefs
 * stay consistent with the role counts. That keeps the gauges plausible, but
 * it is NOT a belief update, and the decision "values" are invented so that the
 * scripted choice comes out on top.
 *
 *   npm run mock            # regenerate everything
 *   npm run validate-logs   # check the result against the schema
 * ============================================================================
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  Beliefs, Decision, DecisionKind, DecisionOption, Elimination, EventType, GameEvent,
  GameLog, Personality, Phase, Player, PlayerId, Role, RoleDist, Step, Team, Visibility,
} from '../src/types/log'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOG_DIR = join(HERE, '..', 'public', 'logs')
const RESULTS_DIR = join(HERE, '..', 'public', 'results')

type Matrix = Record<PlayerId, Record<PlayerId, Record<string, number>>>

const teamOf = (r: Role): Team => (r === 'werewolf' ? 'werewolves' : 'village')
const round3 = (x: number) => Math.round(x * 1000) / 1000

/** Story-writing helper: records events/decisions and keeps a belief matrix per observer. */
class Story {
  players: Player[]
  byId: Record<PlayerId, Player>
  alive = new Set<PlayerId>()
  roles: Role[]
  counts: Record<string, number> = {}
  B: Matrix = {}
  steps: Step[] = []
  elims: Elimination[] = []
  private cur: { round: number; phase: Phase; subphase?: string; events: GameEvent[]; decisions: Decision[] } | null = null
  private ballots: Record<PlayerId, PlayerId> = {}

  constructor(spec: [string, Role, Personality][]) {
    this.players = spec.map(([name, role, personality], i) => ({
      id: `p${String(i + 1).padStart(2, '0')}`, name, role, team: teamOf(role), personality,
    }))
    this.byId = Object.fromEntries(this.players.map((p) => [p.id, p]))
    this.players.forEach((p) => this.alive.add(p.id))
    for (const p of this.players) this.counts[p.role] = (this.counts[p.role] ?? 0) + 1
    this.roles = (['werewolf', 'seer', 'witch', 'little_girl', 'villager', 'cupid'] as Role[]).filter((r) => this.counts[r])
    // Priors: uniform over what's left once you know your own card (wolves also know the pack).
    for (const o of this.players) {
      this.B[o.id] = {}
      for (const t of this.players) {
        if (t.id === o.id) continue
        this.B[o.id][t.id] = Object.fromEntries(this.roles.map((r) => [r, 1]))
        if (o.role === 'werewolf' && t.role === 'werewolf') this.B[o.id][t.id] = this.oneHot('werewolf')
      }
      this.balance(o.id)
    }
  }

  // ---------- ids & queries ----------
  id(name: string): PlayerId {
    const p = this.players.find((x) => x.name === name)
    if (!p) throw new Error(`unknown player ${name}`)
    return p.id
  }
  get pack() { return this.players.filter((p) => p.role === 'werewolf').map((p) => p.id) }
  get livingWolves() { return this.pack.filter((w) => this.alive.has(w)) }
  byRole(r: Role) { return this.players.find((p) => p.role === r)?.id }
  isWolf(id: PlayerId) { return this.byId[id].role === 'werewolf' }
  P(obs: PlayerId, target: PlayerId, role: Role) { return this.B[obs][target]?.[role] ?? 0 }
  livingOthers(id: PlayerId) { return [...this.alive].filter((x) => x !== id) }

  // ---------- belief shaping (scripted, see header) ----------
  private oneHot(role: Role) { return Object.fromEntries(this.roles.map((r) => [r, r === role ? 1 : 0])) }

  /** Rebalance one observer's matrix so rows sum to 1 and columns match the remaining role counts. */
  balance(obs: PlayerId) {
    const rows = this.B[obs]
    const targets = Object.keys(rows)
    const colTarget: Record<string, number> = {}
    for (const r of this.roles) colTarget[r] = this.counts[r] - (this.byId[obs].role === r ? 1 : 0)
    for (let it = 0; it < 200; it++) {
      for (const r of this.roles) {
        const s = targets.reduce((a, t) => a + rows[t][r], 0)
        for (const t of targets) rows[t][r] = s > 0 ? (rows[t][r] * colTarget[r]) / s : 0
      }
      for (const t of targets) {
        const s = this.roles.reduce((a, r) => a + rows[t][r], 0)
        for (const r of this.roles) rows[t][r] = s > 0 ? rows[t][r] / s : 0
      }
    }
  }
  /** Multiply P_obs(target is role) by factor, then rebalance. Only living observers are updated. */
  scale(obs: PlayerId, target: PlayerId, role: Role, factor: number) {
    if (!this.alive.has(obs) || obs === target) return
    const row = this.B[obs][target]
    // Exact zeros are hard knowledge (own pack, seer result, revealed card): nudges never revive them.
    if (!row[role]) return
    // Keep a small floor so a nudge can always move a near-zero gauge.
    row[role] = factor === 0 ? 0 : Math.max(row[role], 0.004) * factor
    this.balance(obs)
  }
  know(obs: PlayerId, target: PlayerId, role: Role) {
    if (!this.alive.has(obs) || obs === target) return
    this.B[obs][target] = this.oneHot(role)
    this.balance(obs)
  }
  /** Every living observer i (except `except`) applies f(i) as a factor on target's role. */
  everyone(target: PlayerId, role: Role, f: (obs: PlayerId) => number, except: PlayerId[] = []) {
    for (const o of this.alive) if (o !== target && !except.includes(o)) this.scale(o, target, role, f(o))
  }
  /** How much obs trusts what `who` says: +1 sure innocent … -1 sure wolf. Wolves "trust" packmates. */
  trust(obs: PlayerId, who: PlayerId) { return 1 - 2 * this.P(obs, who, 'werewolf') }

  // ---------- steps ----------
  begin(round: number, phase: Phase, subphase?: string) {
    if (this.cur) this.end()
    this.cur = { round, phase, subphase, events: [], decisions: [] }
  }
  end() {
    if (!this.cur) return
    const beliefs: Beliefs = {}
    for (const o of this.alive) {
      beliefs[o] = {}
      for (const [t, row] of Object.entries(this.B[o])) {
        const dist: RoleDist = {}
        let sum = 0, big: Role = this.roles[0]
        for (const r of this.roles) {
          dist[r] = round3(row[r]); sum += dist[r]!
          if (dist[r]! > dist[big]!) big = r
        }
        dist[big] = round3(dist[big]! + 1 - sum) // fix rounding drift
        beliefs[o][t] = dist
      }
    }
    this.steps.push({
      t: this.steps.length, round: this.cur.round, phase: this.cur.phase,
      ...(this.cur.subphase ? { subphase: this.cur.subphase } : {}),
      events: this.cur.events, beliefs, decisions: this.cur.decisions,
    })
    this.cur = null
  }
  get t() { return this.steps.length }
  ev(type: EventType, actor: PlayerId | null, target: PlayerId | null, payload: Record<string, unknown>, visible_to: Visibility) {
    this.cur!.events.push({ type, actor, target, payload, visible_to })
  }

  // ---------- decisions ----------
  /** A player's (invented) value for an action, read off their current beliefs. */
  value(p: PlayerId, action: string, target: PlayerId | null): number {
    const wolf = this.isWolf(p)
    if (!target) {
      return ({ pass: 0.3, quiet: 0.32, stay_in_bed: 0.4, spy: 0.55 } as Record<string, number>)[action] ?? 0.3
    }
    const pw = this.P(p, target, 'werewolf')
    const threat = this.P(p, target, 'seer') + 0.8 * this.P(p, target, 'witch') + 0.5 * this.P(p, target, 'little_girl') + 0.15
    if (wolf) {
      if (this.isWolf(target)) return action === 'defend' ? 0.45 : -0.5
      if (action === 'defend') return 0.1
      if (action.startsWith('claim')) return 0.4
      return round3(action === 'wolf_target' ? threat : 0.8 * threat + 0.1)
    }
    switch (action) {
      case 'inspect': return round3(4 * pw * (1 - pw) * 0.9 + 0.1)
      case 'heal': return round3(0.5 + 0.4 * (this.P(p, target, 'seer') + (1 - pw)) / 2)
      case 'defend': return round3(0.8 * (1 - pw) - 0.3)
      case 'talk_to': return round3(0.3 + 0.6 * pw * (1 - pw) * 2)
      default: return round3(pw) // vote, accuse, poison
    }
  }
  /**
   * Record a decision. `opts` lists [action, target] pairs; the scripted `choice`
   * is bumped to the top value (the mock is written as if the planner picked it).
   */
  decide(p: PlayerId, kind: DecisionKind, opts: [string, PlayerId | null][], choice: [string, PlayerId | null]) {
    const options: DecisionOption[] = opts.map(([action, target]) => ({ action, target, value: this.value(p, action, target) }))
    let chosen = options.findIndex((o) => o.action === choice[0] && (o.target ?? null) === choice[1])
    if (chosen < 0) { options.push({ action: choice[0], target: choice[1], value: 0 }); chosen = options.length - 1 }
    const best = Math.max(...options.map((o) => o.value))
    if (options[chosen].value < best) options[chosen].value = round3(best + 0.02 + ((p.charCodeAt(2) % 5) / 100))
    this.cur!.decisions.push({ player: p, kind, options, chosen })
  }
  targets(p: PlayerId, action: string, filter: (x: PlayerId) => boolean = () => true): [string, PlayerId][] {
    return this.livingOthers(p).filter(filter).map((x) => [action, x])
  }

  // ---------- story beats ----------
  setup() {
    this.begin(0, 'setup', 'cards dealt')
    for (const p of this.players) this.ev('role_assigned', p.id, null, { role: p.role }, [p.id])
    this.ev('pack_revealed', null, null, { members: this.pack }, this.pack)
  }

  seer(round: number, target: PlayerId) {
    const s = this.byRole('seer')!
    if (!this.alive.has(s)) return
    this.begin(round, 'night', 'seer')
    const unknown = (x: PlayerId) => Math.max(...Object.values(this.B[s][x])) < 0.999
    this.decide(s, 'inspect', this.targets(s, 'inspect', unknown), ['inspect', target])
    const role = this.byId[target].role
    this.ev('inspect', s, target, { role }, [s])
    this.know(s, target, role)
  }

  /** Wolves pick a victim; the little girl may spy first. Returns the victim. */
  wolves(round: number, victim: PlayerId, spy?: 'nothing' | 'caught' | { glimpsed: PlayerId }) {
    this.begin(round, 'night', 'wolves')
    const lg = this.byRole('little_girl')
    const pack = this.livingWolves
    if (lg && this.alive.has(lg) && spy) {
      this.decide(lg, 'spy', [['spy', null], ['stay_in_bed', null]], ['spy', null])
      if (spy === 'caught') {
        this.ev('spy', lg, null, { outcome: 'caught' }, [lg, ...pack])
        for (const w of pack) this.know(w, lg, 'little_girl')
        victim = lg
      } else if (spy === 'nothing') {
        this.ev('spy', lg, null, { outcome: 'nothing' }, [lg])
      } else {
        this.ev('spy', lg, spy.glimpsed, { outcome: 'glimpsed', glimpsed: spy.glimpsed }, [lg])
        this.scale(lg, spy.glimpsed, 'werewolf', 40)
      }
    }
    for (const w of pack) this.decide(w, 'wolf_target', this.targets(w, 'wolf_target', (x) => !this.isWolf(x)), ['wolf_target', victim])
    const witch = this.byRole('witch')
    const vis = [...pack, ...(witch && this.alive.has(witch) && witch !== victim ? [witch] : [])]
    this.ev('wolf_target', pack[0], victim, {}, vis)
    // The witch is shown the victim: wolves never kill each other, so the victim is not a wolf.
    if (witch && vis.includes(witch)) this.scale(witch, victim, 'werewolf', 0)
    return victim
  }

  witch(round: number, victim: PlayerId, heal: boolean, poison?: PlayerId) {
    const w = this.byRole('witch')!
    if (!this.alive.has(w)) return
    this.begin(round, 'night', 'witch')
    const opts: [string, PlayerId | null][] = [['pass', null]]
    if (!this.used.heal && victim !== w) opts.push(['heal', victim])
    if (!this.used.poison) opts.push(...this.targets(w, 'poison'))
    const choice: [string, PlayerId | null] = heal ? ['heal', victim] : poison ? ['poison', poison] : ['pass', null]
    this.decide(w, 'potion', opts, choice)
    if (heal) { this.used.heal = true; this.ev('potion', w, victim, { kind: 'heal' }, [w]) }
    if (poison) { this.used.poison = true; this.ev('potion', w, poison, { kind: 'poison' }, [w]) }
  }
  used = { heal: false, poison: false }

  kill(id: PlayerId, round: number, phase: Phase, cause: Elimination['cause']) {
    this.alive.delete(id)
    this.elims.push({ player: id, round, phase, t: this.t, cause })
  }

  /**
   * Card is revealed to everyone. Afterwards, what people said about that player
   * (and, for a vote elimination, how they voted) is re-read in that light.
   */
  reveal(id: PlayerId, afterVote = false) {
    const role = this.byId[id].role
    const wolf = role === 'werewolf'
    for (const o of this.alive) this.know(o, id, role)
    for (const [speaker, kind, about] of this.said) {
      // A revealed villager's accusations gain weight (a little girl's most of all: she may have seen it).
      if (speaker === id && kind === 'accuse' && !wolf && this.alive.has(about)) {
        this.everyone(about, 'werewolf', () => (role === 'little_girl' ? 4 : role === 'seer' ? 8 : 1.4))
      }
      if (about !== id || speaker === id || !this.alive.has(speaker)) continue
      const f = kind === 'defend' ? (wolf ? 1.9 : 0.85) : wolf ? 0.6 : 1.2
      this.everyone(speaker, 'werewolf', () => f)
    }
    if (afterVote) {
      for (const [voter, target] of Object.entries(this.ballots)) {
        if (voter === id || !this.alive.has(voter)) continue
        const f = wolf ? (target === id ? 0.7 : 1.3) : target === id ? 1.25 : 1
        this.everyone(voter, 'werewolf', () => f)
      }
    }
  }
  private said: [PlayerId, 'accuse' | 'defend', PlayerId][] = []

  dawn(round: number, deaths: PlayerId[]) {
    this.begin(round, 'day', 'dawn')
    this.ev('dawn', null, null, { deaths }, 'all')
    for (const d of deaths) {
      this.ev('death_announced', null, d, { role: this.byId[d].role }, 'all')
      this.reveal(d)
    }
    this.ballots = {}
  }

  talk(a: PlayerId, b: PlayerId, aSeesB: 'convincing' | 'suspicious', bSeesA: 'convincing' | 'suspicious', topic?: string) {
    this.decide(a, 'talk_to', this.targets(a, 'talk_to'), ['talk_to', b])
    this.ev('conversation', a, b, topic ? { topic } : {}, [a, b])
    this.impression(a, b, aSeesB)
    this.impression(b, a, bSeesA)
  }
  private impression(holder: PlayerId, other: PlayerId, verdict: 'convincing' | 'suspicious') {
    this.ev('impression', holder, other, { verdict }, [holder])
    if (this.isWolf(holder)) {
      // A wolf reads a sharp interlocutor as a possible seer or witch.
      if (verdict === 'suspicious') { this.scale(holder, other, 'seer', 1.6); this.scale(holder, other, 'witch', 1.3) }
    } else {
      this.scale(holder, other, 'werewolf', verdict === 'suspicious' ? 1.9 : 0.6)
    }
  }

  statementOptions(p: PlayerId): [string, PlayerId | null][] {
    return [['quiet', null], ...this.targets(p, 'accuse'), ...this.targets(p, 'defend')]
  }
  accuse(a: PlayerId, t: PlayerId, text: string) {
    this.decide(a, 'statement', this.statementOptions(a), ['accuse', t])
    this.ev('statement', a, t, { kind: 'accuse', text }, 'all')
    this.said.push([a, 'accuse', t])
    this.everyone(t, 'werewolf', (o) => 1 + 0.45 * this.trust(o, a), [a])
    this.scale(t, a, 'werewolf', 1.4)
    // Wolves wonder whether a confident accuser has inside information.
    if (!this.isWolf(a)) for (const w of this.livingWolves) if (w !== t) this.scale(w, a, 'seer', this.isWolf(t) ? 1.8 : 1.1)
  }
  defend(a: PlayerId, t: PlayerId, text: string) {
    this.decide(a, 'statement', this.statementOptions(a), ['defend', t])
    this.ev('statement', a, t, { kind: 'defend', text }, 'all')
    this.said.push([a, 'defend', t])
    this.everyone(t, 'werewolf', (o) => 1 - 0.3 * this.trust(o, a), [a])
  }
  quiet(a: PlayerId) {
    this.decide(a, 'statement', this.statementOptions(a), ['quiet', null])
    this.ev('statement', a, null, { kind: 'quiet' }, 'all')
    this.everyone(a, 'werewolf', () => (this.byId[a].personality === 'discreet' ? 1.05 : 1.15))
  }
  claim(a: PlayerId, role: Role, text: string, accuse?: PlayerId) {
    const opts = this.statementOptions(a)
    opts.push([`claim_${role}`, accuse ?? null])
    this.decide(a, 'statement', opts, [`claim_${role}`, accuse ?? null])
    this.ev('statement', a, accuse ?? null, { kind: 'claim_role', claimed_role: role, text }, 'all')
    // Wolves take a claim very seriously when it correctly names one of them.
    this.everyone(a, role, (o) => (this.isWolf(o) ? (this.isWolf(a) ? 1 : accuse && this.isWolf(accuse) ? 40 : 6) : 5))
    // Whoever really holds that card now knows the claimant is lying.
    const real = this.byRole(role)
    if (real && real !== a && this.alive.has(real)) this.scale(real, a, 'werewolf', 8)
    if (accuse) {
      this.said.push([a, 'accuse', accuse])
      this.everyone(accuse, 'werewolf', (o) => 1 + 0.9 * this.P(o, a, role), [a])
    }
  }

  /** One ballot. `votes` maps voter name -> target name. Returns tally and the leaders. */
  vote(round: number, votes: Record<string, string>, ballot: 'main' | 'runoff', allowed?: PlayerId[]) {
    this.begin(round, 'day', ballot === 'main' ? 'vote' : 'runoff')
    const tally: Record<PlayerId, number> = {}
    this.ballots = {}
    for (const [vn, tn] of Object.entries(votes)) {
      const v = this.id(vn), t = this.id(tn)
      const opts = allowed ? allowed.filter((x) => x !== v).map((x): [string, PlayerId] => ['vote', x]) : this.targets(v, 'vote')
      this.decide(v, 'vote', opts, ['vote', t])
      this.ev('vote', v, t, { ballot }, 'all')
      tally[t] = (tally[t] ?? 0) + 1
      this.ballots[v] = t
    }
    // A vote against someone you consider innocent makes the voter look suspicious (and vice versa).
    for (const [v, t] of Object.entries(this.ballots)) {
      this.everyone(v, 'werewolf', (o) => 1 + 0.3 * this.trust(o, t), [t])
      this.everyone(t, 'werewolf', (o) => 1 + 0.08 * this.trust(o, v), [v])
    }
    const max = Math.max(...Object.values(tally))
    const leaders = Object.keys(tally).filter((k) => tally[k] === max)
    return { tally, leaders }
  }
  /** Main vote, plus a runoff between the tied players if needed (one runoff, then nobody dies). */
  dayVote(round: number, votes: Record<string, string>, runoffVotes?: Record<string, string>): PlayerId | null {
    let { tally, leaders } = this.vote(round, votes, 'main')
    if (leaders.length > 1) {
      this.ev('vote_result', null, null, { tally, tied: true, runoff: true, ballot: 'main', eliminated: null }, 'all')
      if (!runoffVotes) throw new Error('tie without runoff votes scripted')
      ;({ tally, leaders } = this.vote(round, runoffVotes, 'runoff', leaders))
      const out = leaders.length === 1 ? leaders[0] : null
      this.ev('vote_result', null, out, { tally, tied: leaders.length > 1, runoff: false, ballot: 'runoff', eliminated: out }, 'all')
      if (out) this.eliminate(round, out)
      return out
    }
    this.ev('vote_result', null, leaders[0], { tally, tied: false, runoff: false, ballot: 'main', eliminated: leaders[0] }, 'all')
    this.eliminate(round, leaders[0])
    return leaders[0]
  }
  private eliminate(round: number, id: PlayerId) {
    this.ev('elimination', null, id, { role: this.byId[id].role }, 'all')
    this.kill(id, round, 'day', 'vote')
    this.reveal(id, true)
  }

  finish(round: number, winner: Team): GameLog {
    this.begin(round, 'end', 'game over')
    this.ev('game_end', null, null, { winner }, 'all')
    this.end()
    return {
      meta: {
        schema_version: '1.0.0', seed: 0, config: { role_counts: this.counts }, timestamp: '', mock: true,
      },
      players: this.players,
      steps: this.steps,
      result: { winner, final_round: round, eliminations: this.elims },
    }
  }
}

// ============================================================================
//  Game 1: 13 players, village wins in 4 rounds.
//  Beats: witch heals night 1 · little girl caught night 2 · seer finds a wolf ·
//  Bastien bluffs "seer" · tied vote → runoff · witch poisons Bastien.
// ============================================================================
function game13(): GameLog {
  const s = new Story([
    ['Amélie', 'seer', 'discreet'],
    ['Bastien', 'werewolf', 'manipulative'],
    ['Camille', 'witch', 'trusting'],
    ['Denis', 'villager', 'aggressive'],
    ['Élise', 'little_girl', 'discreet'],
    ['Fabrice', 'werewolf', 'aggressive'],
    ['Gaëlle', 'villager', 'trusting'],
    ['Hugo', 'villager', 'discreet'],
    ['Inès', 'werewolf', 'discreet'],
    ['Julien', 'villager', 'manipulative'],
    ['Louise', 'villager', 'aggressive'],
    ['Mathis', 'villager', 'trusting'],
    ['Noémie', 'villager', 'discreet'],
  ])
  const $ = (n: string) => s.id(n)
  s.setup()

  // --- Round 1 ---
  s.seer(1, $('Denis'))
  let v = s.wolves(1, $('Gaëlle'), 'nothing')
  s.witch(1, v, true)
  s.dawn(1, [])
  s.begin(1, 'day', 'conversations')
  s.talk($('Amélie'), $('Fabrice'), 'suspicious', 'suspicious', 'who was awake last night')
  s.talk($('Denis'), $('Bastien'), 'convincing', 'convincing', 'the quiet ones')
  s.talk($('Louise'), $('Inès'), 'suspicious', 'convincing', 'alibis')
  s.talk($('Gaëlle'), $('Hugo'), 'convincing', 'convincing')
  s.begin(1, 'day', 'debate')
  s.accuse($('Denis'), $('Hugo'), 'Hugo hasn\'t said a word. That\'s how wolves hide.')
  s.accuse($('Fabrice'), $('Louise'), 'Louise is far too eager to point fingers.')
  s.defend($('Gaëlle'), $('Hugo'), 'I spoke with Hugo, he is honest.')
  s.defend($('Bastien'), $('Denis'), 'Denis makes a fair point.')
  s.quiet($('Amélie'))
  s.accuse($('Louise'), $('Inès'), 'Inès dodged every question I asked her.')
  s.dayVote(1, {
    Amélie: 'Fabrice', Bastien: 'Hugo', Camille: 'Hugo', Denis: 'Hugo', Élise: 'Fabrice', Fabrice: 'Hugo',
    Gaëlle: 'Denis', Hugo: 'Denis', Inès: 'Hugo', Julien: 'Hugo', Louise: 'Inès', Mathis: 'Hugo', Noémie: 'Fabrice',
  })

  // --- Round 2 ---
  s.seer(2, $('Fabrice'))
  v = s.wolves(2, $('Louise'), 'caught')
  s.witch(2, v, false)
  s.kill(v, 2, 'night', 'caught_spying')
  s.dawn(2, [v])
  s.begin(2, 'day', 'conversations')
  s.talk($('Camille'), $('Amélie'), 'convincing', 'convincing', 'last night\'s silence')
  s.talk($('Bastien'), $('Mathis'), 'convincing', 'convincing')
  s.talk($('Noémie'), $('Fabrice'), 'suspicious', 'convincing')
  s.begin(2, 'day', 'debate')
  s.claim($('Amélie'), 'seer', 'I am the Seer. Last night I saw Fabrice\'s card: he is a werewolf.', $('Fabrice'))
  s.claim($('Bastien'), 'seer', 'She is lying. I am the Seer, and Amélie is the wolf.', $('Amélie'))
  s.defend($('Inès'), $('Bastien'), 'Bastien has been calm and fair since the start.')
  s.accuse($('Denis'), $('Fabrice'), 'Fabrice pushed hardest on Hugo, and Hugo was innocent.')
  s.defend($('Julien'), $('Amélie'), 'Amélie never spoke before today. Why lie now?')
  s.quiet($('Mathis'))
  s.dayVote(
    2,
    {
      Amélie: 'Fabrice', Bastien: 'Amélie', Camille: 'Fabrice', Denis: 'Fabrice', Fabrice: 'Amélie',
      Gaëlle: 'Amélie', Inès: 'Amélie', Julien: 'Fabrice', Louise: 'Fabrice', Mathis: 'Amélie', Noémie: 'Julien',
    },
    {
      Amélie: 'Fabrice', Bastien: 'Amélie', Camille: 'Fabrice', Denis: 'Fabrice', Fabrice: 'Amélie',
      Gaëlle: 'Fabrice', Inès: 'Amélie', Julien: 'Fabrice', Louise: 'Fabrice', Mathis: 'Amélie', Noémie: 'Fabrice',
    },
  )

  // --- Round 3 ---
  s.seer(3, $('Bastien'))
  v = s.wolves(3, $('Amélie'))
  s.witch(3, v, false, $('Bastien'))
  s.kill(v, 3, 'night', 'wolves')
  s.kill($('Bastien'), 3, 'night', 'poison')
  s.dawn(3, [v, $('Bastien')])
  s.begin(3, 'day', 'conversations')
  s.talk($('Louise'), $('Inès'), 'suspicious', 'suspicious', 'Bastien\'s defenders')
  s.talk($('Julien'), $('Denis'), 'suspicious', 'suspicious')
  s.talk($('Camille'), $('Mathis'), 'convincing', 'convincing')
  s.begin(3, 'day', 'debate')
  s.accuse($('Louise'), $('Inès'), 'Inès defended Bastien yesterday. Bastien was a wolf.')
  s.accuse($('Inès'), $('Julien'), 'Julien changed his tune every round. Classic wolf.')
  s.accuse($('Denis'), $('Julien'), 'Julien, you are playing both sides.')
  s.defend($('Mathis'), $('Inès'), 'Inès only defended Bastien because he fooled us all.')
  s.quiet($('Noémie'))
  s.dayVote(3, {
    Camille: 'Inès', Denis: 'Julien', Gaëlle: 'Julien', Inès: 'Julien', Julien: 'Denis',
    Louise: 'Inès', Mathis: 'Julien', Noémie: 'Inès',
  })

  // --- Round 4 ---
  v = s.wolves(4, $('Camille'))
  s.kill(v, 4, 'night', 'wolves')
  s.dawn(4, [v])
  s.begin(4, 'day', 'conversations')
  s.talk($('Noémie'), $('Inès'), 'suspicious', 'convincing', 'the last wolf')
  s.talk($('Mathis'), $('Louise'), 'convincing', 'convincing')
  s.begin(4, 'day', 'debate')
  s.accuse($('Louise'), $('Inès'), 'I have suspected Inès since the first day. It ends now.')
  s.accuse($('Inès'), $('Denis'), 'Denis voted for Hugo first. Remember that.')
  s.accuse($('Noémie'), $('Inès'), 'Inès is the only one left who defended Bastien.')
  s.dayVote(4, {
    Denis: 'Inès', Gaëlle: 'Inès', Inès: 'Denis', Louise: 'Inès', Mathis: 'Denis', Noémie: 'Inès',
  })
  const log = s.finish(4, 'village')
  log.meta.seed = 1301
  log.meta.title = 'The Long Night of Thiercelieux'
  log.meta.timestamp = '2026-10-18T20:00:00Z'
  return log
}

// ============================================================================
//  Game 2: 9 players, werewolves win in 3 rounds.
//  Beats: seer killed night 1 (witch keeps her potions) · little girl glimpses
//  Romain and is voted out for saying so · heal + poison used night 2.
// ============================================================================
function game9(): GameLog {
  const s = new Story([
    ['Lucie', 'seer', 'trusting'],
    ['Théo', 'werewolf', 'aggressive'],
    ['Margaux', 'witch', 'discreet'],
    ['Antoine', 'villager', 'trusting'],
    ['Chloé', 'little_girl', 'aggressive'],
    ['Romain', 'werewolf', 'manipulative'],
    ['Sophie', 'villager', 'discreet'],
    ['Victor', 'villager', 'aggressive'],
    ['Zoé', 'villager', 'manipulative'],
  ])
  const $ = (n: string) => s.id(n)
  s.setup()

  s.seer(1, $('Antoine'))
  let v = s.wolves(1, $('Lucie'), { glimpsed: $('Romain') })
  s.witch(1, v, false)
  s.kill(v, 1, 'night', 'wolves')
  s.dawn(1, [v])
  s.begin(1, 'day', 'conversations')
  s.talk($('Chloé'), $('Margaux'), 'convincing', 'convincing', 'what she saw')
  s.talk($('Romain'), $('Zoé'), 'convincing', 'convincing')
  s.talk($('Victor'), $('Sophie'), 'suspicious', 'convincing')
  s.begin(1, 'day', 'debate')
  s.accuse($('Chloé'), $('Romain'), 'I saw Romain with the wolves last night. I swear it.')
  s.accuse($('Romain'), $('Chloé'), 'A child "saw" something in the dark? She wants us to kill an innocent.')
  s.defend($('Zoé'), $('Romain'), 'Romain helped me all day. Chloé is too sure of herself.')
  s.accuse($('Théo'), $('Chloé'), 'Chloé shouts the loudest. That is suspicious.')
  s.quiet($('Sophie'))
  s.dayVote(1, {
    Théo: 'Chloé', Margaux: 'Romain', Antoine: 'Chloé', Chloé: 'Romain', Romain: 'Chloé',
    Sophie: 'Romain', Victor: 'Chloé', Zoé: 'Chloé',
  })

  v = s.wolves(2, $('Sophie'))
  s.witch(2, v, true, $('Victor'))
  s.kill($('Victor'), 2, 'night', 'poison')
  s.dawn(2, [$('Victor')])
  s.begin(2, 'day', 'conversations')
  s.talk($('Margaux'), $('Théo'), 'suspicious', 'suspicious', 'Chloé\'s warning')
  s.talk($('Zoé'), $('Antoine'), 'convincing', 'suspicious')
  s.begin(2, 'day', 'debate')
  s.accuse($('Margaux'), $('Romain'), 'Chloé was the little girl. She told the truth about Romain.')
  s.accuse($('Romain'), $('Zoé'), 'Zoé defended me just to look reasonable. She is playing us.')
  s.accuse($('Antoine'), $('Zoé'), 'Zoé, you voted with the wolves\' side yesterday.')
  s.defend($('Théo'), $('Romain'), 'Romain is with us. Look at Zoé instead.')
  s.dayVote(2, {
    Théo: 'Zoé', Margaux: 'Romain', Antoine: 'Zoé', Romain: 'Zoé', Sophie: 'Zoé', Zoé: 'Romain',
  })

  v = s.wolves(3, $('Margaux'))
  s.kill(v, 3, 'night', 'wolves')
  s.dawn(3, [v])
  const log = s.finish(3, 'werewolves')
  log.meta.seed = 907
  log.meta.title = 'What the Little Girl Saw'
  log.meta.timestamp = '2026-10-18T21:30:00Z'
  return log
}

// ============================================================================
//  Game 3 (short): 8 players, village wins in 2 rounds.
//  Beats: seer finds Lucas night 1 · witch heals Paul · Lucas counter-claims
//  seer (bluff) and is voted out · witch poisons Yanis night 2.
// ============================================================================
function gameShort(): GameLog {
  const s = new Story([
    ['Yanis', 'werewolf', 'discreet'],
    ['Clara', 'seer', 'aggressive'],
    ['Paul', 'villager', 'trusting'],
    ['Manon', 'witch', 'manipulative'],
    ['Lucas', 'werewolf', 'aggressive'],
    ['Jeanne', 'villager', 'discreet'],
    ['Arthur', 'villager', 'trusting'],
    ['Lina', 'villager', 'aggressive'],
  ])
  const $ = (n: string) => s.id(n)
  s.setup()

  s.seer(1, $('Lucas'))
  let v = s.wolves(1, $('Paul'))
  s.witch(1, v, true)
  s.dawn(1, [])
  s.begin(1, 'day', 'conversations')
  s.talk($('Clara'), $('Manon'), 'convincing', 'convincing')
  s.talk($('Yanis'), $('Jeanne'), 'convincing', 'suspicious')
  s.begin(1, 'day', 'debate')
  s.claim($('Clara'), 'seer', 'I am the Seer. Lucas is a werewolf.', $('Lucas'))
  s.claim($('Lucas'), 'seer', 'Nonsense. I am the Seer, and Clara is lying to save her pack.', $('Clara'))
  s.defend($('Yanis'), $('Lucas'), 'Lucas has been straight with me.')
  s.accuse($('Lina'), $('Lucas'), 'Two seers? One of you is a wolf, and Lucas looks nervous.')
  s.dayVote(1, {
    Yanis: 'Clara', Clara: 'Lucas', Paul: 'Lucas', Manon: 'Lucas', Lucas: 'Clara',
    Jeanne: 'Lucas', Arthur: 'Clara', Lina: 'Lucas',
  })

  s.seer(2, $('Yanis'))
  v = s.wolves(2, $('Clara'))
  s.witch(2, v, false, $('Yanis'))
  s.kill(v, 2, 'night', 'wolves')
  s.kill($('Yanis'), 2, 'night', 'poison')
  s.dawn(2, [v, $('Yanis')])
  const log = s.finish(2, 'village')
  log.meta.seed = 802
  log.meta.title = 'Two Seers, One Liar'
  log.meta.timestamp = '2026-10-19T19:15:00Z'
  return log
}

// ============================================================================
//  Fake experiment summary (summary.csv). Random rows from a seeded RNG,
//  plus one row for each mock log above.
// ============================================================================
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const NAMES = ['Adèle', 'Benoît', 'Céline', 'Damien', 'Estelle', 'François', 'Garance', 'Henri', 'Isabelle', 'Jules',
  'Laure', 'Marius', 'Nina', 'Olivier', 'Pauline', 'Quentin', 'Rose', 'Simon', 'Thérèse', 'Valentin']
const PERS: Personality[] = ['aggressive', 'discreet', 'manipulative', 'trusting']

function summaryCsv(logs: [string, GameLog][]): string {
  const rows: string[] = ['game_id,log_file,seed,n_players,winner,rounds,roster']
  const roster = (entries: [string, Role, Personality, boolean][]) =>
    `"${entries.map(([n, r, p, alive]) => `${n}|${r}|${p}|${alive ? 'survived' : 'died'}`).join(';')}"`
  for (const [file, log] of logs) {
    const dead = new Set(log.result.eliminations.map((e) => e.player))
    rows.push([
      `mock-${log.meta.seed}`, file, log.meta.seed, log.players.length, log.result.winner, log.result.final_round,
      roster(log.players.map((p) => [p.name, p.role, p.personality, !dead.has(p.id)])),
    ].join(','))
  }
  const rnd = mulberry32(228)
  for (let g = 0; g < 60; g++) {
    const n = [8, 9, 13, 13, 13][Math.floor(rnd() * 5)]
    const roles: Role[] = n === 13
      ? ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'little_girl', ...Array(7).fill('villager')]
      : n === 9 ? ['werewolf', 'werewolf', 'seer', 'witch', 'little_girl', ...Array(4).fill('villager')]
        : ['werewolf', 'werewolf', 'seer', 'witch', ...Array(4).fill('villager')]
    const names = [...NAMES].sort(() => rnd() - 0.5).slice(0, n)
    const pers = roles.map(() => PERS[Math.floor(rnd() * 4)])
    // Invented bias so the experiments page has something to show: manipulative wolves help, aggressive ones hurt.
    let pWolf = 0.42
    roles.forEach((r, i) => {
      if (r === 'werewolf') pWolf += pers[i] === 'manipulative' ? 0.09 : pers[i] === 'aggressive' ? -0.06 : 0
      if (r === 'seer' && pers[i] === 'discreet') pWolf -= 0.07
    })
    const winner: Team = rnd() < pWolf ? 'werewolves' : 'village'
    const rounds = 2 + Math.floor(rnd() * (n === 13 ? 5 : 3))
    const entries = roles.map((r, i): [string, Role, Personality, boolean] => {
      const onWinning = teamOf(r) === winner
      const survive = r === 'werewolf' ? (winner === 'werewolves' ? rnd() < 0.8 : false) : rnd() < (onWinning ? 0.55 : 0.15)
      return [names[i], r, pers[i], survive]
    })
    rows.push([`sim-${1000 + g}`, '', 5000 + g, n, winner, rounds, roster(entries)].join(','))
  }
  return rows.join('\n') + '\n'
}

// ============================================================================
mkdirSync(LOG_DIR, { recursive: true })
mkdirSync(RESULTS_DIR, { recursive: true })
const games: [string, GameLog][] = [
  ['game_13p.json', game13()],
  ['game_9p.json', game9()],
  ['game_short.json', gameShort()],
]
for (const [file, log] of games) {
  writeFileSync(join(LOG_DIR, file), JSON.stringify(log))
  console.log(`wrote ${file}: ${log.players.length} players, ${log.steps.length} steps, winner=${log.result.winner}`)
}
writeFileSync(
  join(LOG_DIR, 'index.json'),
  JSON.stringify(games.map(([file, log]) => ({
    file, title: log.meta.title, players: log.players.length, rounds: log.result.final_round, winner: log.result.winner, mock: true,
  })), null, 2),
)
writeFileSync(join(RESULTS_DIR, 'summary.csv'), summaryCsv(games))
console.log('wrote index.json and results/summary.csv')
