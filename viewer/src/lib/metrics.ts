// End-of-game metrics: belief accuracy over time and turning points.
import type { GameLog, PlayerId, Role } from '../types/log'
import type { Pov, PovTrack } from './pov'
import { biggestMoves, type Mover } from './decisions'
import { narrate } from './narrate'

/**
 * Accuracy of one observer at one step: the average probability they put on
 * "werewolf" for the true werewolves (other than themselves). 1 = all wolves found.
 * Null if the observer has no beliefs at that step (dead).
 */
export function accuracyAt(log: GameLog, t: number, obs: PlayerId): number | null {
  const row = log.steps[t].beliefs[obs]
  if (!row) return null
  const wolves = log.players.filter((p) => p.role === 'werewolf' && p.id !== obs)
  if (!wolves.length) return null
  return wolves.reduce((a, w) => a + (row[w.id]?.werewolf ?? 0), 0) / wolves.length
}

export function accuracySeries(log: GameLog, obs: PlayerId): (number | null)[] {
  return log.steps.map((_, t) => accuracyAt(log, t, obs))
}

/** Mean accuracy over living village-team players at each step. */
export function villageAccuracy(log: GameLog): (number | null)[] {
  const village = log.players.filter((p) => p.team === 'village')
  return log.steps.map((_, t) => {
    const xs = village.map((p) => accuracyAt(log, t, p.id)).filter((v): v is number => v != null)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  })
}

/** What a villager would believe with no information at all: wolves / (others). */
export function chanceLevel(log: GameLog): number {
  const wolves = log.players.filter((p) => p.role === 'werewolf').length
  return wolves / Math.max(1, log.players.length - 1)
}

export interface Ranked {
  id: PlayerId
  mean: number
  final: number
}

/** Village-team players ranked by mean accuracy over the steps they were alive. */
export function sharpestMinds(log: GameLog): Ranked[] {
  return log.players
    .filter((p) => p.team === 'village')
    .map((p) => {
      const xs = accuracySeries(log, p.id).filter((v): v is number => v != null)
      return { id: p.id, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0, final: xs[xs.length - 1] ?? 0 }
    })
    .sort((a, b) => b.mean - a.mean)
}

/** Biggest single-step belief jumps over the whole game, for the POV (consensus for the Narrator). */
export function turningPoints(log: GameLog, track: PovTrack, pov: Pov, limit = 5): Mover[] {
  if (pov !== 'narrator') {
    const team = log.players.find((p) => p.id === pov)?.team
    // Wolves hunt every power role; villagers hunt wolves.
    const roles: Role[] = (team === 'werewolves' ? ['seer', 'witch', 'little_girl', 'cupid'] as Role[] : ['werewolf' as Role])
      .filter((r) => log.players.some((p) => p.role === r))
    // Death reveals are excluded: a card turned face up is not something the player figured out.
    return roles.flatMap((role) => biggestMoves(log, track, pov, 0, track.steps.length - 1, role, 50).map((m) => ({ ...m, role })))
      .sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from))
      .filter((m) => !(track.steps[m.t].dead.has(m.target) && !track.steps[m.t - 1].dead.has(m.target)))
      // ...nor are its side effects (e.g. once the seer's card is shown, nobody else can be the seer).
      .filter((m) => m.cause !== 'dawn' && m.cause !== 'death_announced' && m.cause !== 'elimination')
      .slice(0, limit)
  }
  const out: Mover[] = []
  for (let t = 1; t < track.steps.length; t++) {
    const prev = track.steps[t - 1].consensus, cur = track.steps[t].consensus
    for (const p of log.players) {
      const a = prev[p.id], b = cur[p.id]
      if (a == null || b == null || Math.abs(b - a) < 0.03) continue
      // A death reveal is not a "turning point" in what the village figured out.
      if (track.steps[t].dead.has(p.id) && !track.steps[t - 1].dead.has(p.id)) continue
      const evs = track.steps[t].events
      const ev = evs.find((e) => e.target === p.id || e.actor === p.id) ?? evs[0]
      out.push({ target: p.id, from: a, to: b, t, because: ev ? narrate(ev, log, pov, track.steps[t].known) : null })
    }
  }
  return out.sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from)).slice(0, limit)
}
