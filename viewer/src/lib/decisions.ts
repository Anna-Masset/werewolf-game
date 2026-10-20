// Helpers for explaining a POV decision: which quantity matters, readable
// action labels, and which observations moved the belief since the last decision.
import type { Decision, DecisionOption, GameLog, PlayerId, Role, RoleDist } from '../types/log'
import type { Pov, PovTrack } from './pov'
import { narrate, type Narration } from './narrate'
import { ROLE_LABEL } from './roles'

export const KIND_QUESTION: Record<Decision['kind'], string> = {
  vote: 'Whom do I vote against?',
  wolf_target: 'Whom does the pack attack tonight?',
  inspect: 'Whose card do I look at?',
  potion: 'Do I use a potion, and on whom?',
  spy: 'Do I peek at the werewolves?',
  talk_to: 'Whom do I talk to in private?',
  statement: 'What do I say in public?',
}

export function actionLabel(o: DecisionOption, names: Record<PlayerId, string>): string {
  const who = o.target ? names[o.target] ?? o.target : ''
  if (o.label) return o.label
  if (o.action.startsWith('claim_')) {
    const role = o.action.slice(6) as Role
    return `claim ${ROLE_LABEL[role] ?? role}${who ? `, accuse ${who}` : ''}`
  }
  const verb: Record<string, string> = {
    vote: 'vote', wolf_target: 'attack', inspect: 'inspect', heal: 'heal', poison: 'poison', pass: 'do nothing',
    accuse: 'accuse', defend: 'defend', quiet: 'stay quiet', talk_to: 'talk to', spy: 'spy', stay_in_bed: 'stay in bed',
  }
  return `${verb[o.action] ?? o.action.replace(/_/g, ' ')}${who ? ` ${who}` : ''}`
}

/** The role probability that drives this decision, from the decider's side. */
export function drivingRole(team: string, kind: Decision['kind']): Role {
  if (team === 'werewolves' && (kind === 'wolf_target' || kind === 'vote' || kind === 'statement')) return 'seer'
  return 'werewolf'
}

export interface Mover {
  target: PlayerId
  from: number
  to: number
  t: number
  because: Narration | null
}

/**
 * The biggest single-step changes in P(role) for the POV between two steps
 * (exclusive start, inclusive end), each tied to the visible event that most
 * plausibly caused it (one involving that player, else the step's first event).
 */
export function biggestMoves(
  log: GameLog, track: PovTrack, pov: Pov, fromT: number, toT: number, role: Role, limit = 3,
): Mover[] {
  if (pov === 'narrator') return []
  const out: Mover[] = []
  for (let t = Math.max(1, fromT + 1); t <= toT; t++) {
    const prev: Record<PlayerId, RoleDist> | null = track.steps[t - 1].beliefs
    const cur = track.steps[t].beliefs
    if (!prev || !cur || prev === cur) continue
    for (const target of Object.keys(cur)) {
      const a = prev[target]?.[role] ?? 0, b = cur[target]?.[role] ?? 0
      if (Math.abs(b - a) < 0.03) continue
      const evs = track.steps[t].events
      const ev = evs.find((e) => e.target === target || e.actor === target || e.payload?.glimpsed === target) ?? evs[0]
      out.push({ target, from: a, to: b, t, because: ev ? narrate(ev, log, pov, track.steps[t].known) : null })
    }
  }
  return out.sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from)).slice(0, limit)
}

/** Step index of the POV's previous decision before t (or 0). */
export function previousDecisionT(track: PovTrack, pov: Pov, t: number): number {
  for (let s = t - 1; s >= 0; s--) if (track.steps[s].step.decisions.some((d) => d.player === pov)) return s
  return 0
}
