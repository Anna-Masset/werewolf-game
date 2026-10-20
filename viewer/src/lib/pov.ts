// Point-of-view logic. Everything the UI shows for a POV goes through here, so
// the visibility rules live in one place:
//   * a player sees events whose visible_to is "all" or contains their id;
//   * the Narrator sees everything;
//   * a player knows a role if they hold the card, were shown it (pack, inspection,
//     glimpse, catching the little girl), or saw it revealed at death;
//   * once the POV dies they become a "ghost": beliefs freeze, and only public
//     events are shown after that.
import type { GameEvent, GameLog, Player, PlayerId, Role, RoleDist, Step } from '../types/log'

export type Pov = 'narrator' | PlayerId

export interface PovStep {
  step: Step
  /** Events of this step visible to the POV. */
  events: GameEvent[]
  /** Roles the POV knows for certain at the end of this step. */
  known: Record<PlayerId, Role>
  /** Players publicly dead by the end of this step. */
  dead: Set<PlayerId>
  /** The POV's belief row (target -> role dist), possibly frozen; null for the Narrator. */
  beliefs: Record<PlayerId, RoleDist> | null
  /** True if the POV is dead at this step (beliefs frozen). */
  ghost: boolean
  /** Village consensus P(werewolf) per player: mean over living village-team observers. */
  consensus: Record<PlayerId, number | null>
}

export interface PovTrack {
  pov: Pov
  steps: PovStep[]
}

export function canSee(e: GameEvent, pov: Pov): boolean {
  if (pov === 'narrator' || e.visible_to === 'all') return true
  return e.visible_to.includes(pov)
}

export function playerById(log: GameLog): Record<PlayerId, Player> {
  return Object.fromEntries(log.players.map((p) => [p.id, p]))
}

/** Village consensus for one step: mean P(werewolf) over living village-team observers. */
export function consensusAt(log: GameLog, step: Step): Record<PlayerId, number | null> {
  const byId = playerById(log)
  const out: Record<PlayerId, number | null> = {}
  for (const target of log.players) {
    let sum = 0, n = 0
    for (const [obs, row] of Object.entries(step.beliefs)) {
      if (obs === target.id || byId[obs]?.team !== 'village') continue
      const p = row[target.id]?.werewolf
      if (p == null) continue
      sum += p; n++
    }
    out[target.id] = n ? sum / n : null
  }
  return out
}

export function buildTrack(log: GameLog, pov: Pov): PovTrack {
  const known: Record<PlayerId, Role> = {}
  const dead = new Set<PlayerId>()
  if (pov === 'narrator') for (const p of log.players) known[p.id] = p.role
  let lastBeliefs: Record<PlayerId, RoleDist> | null = null
  const steps: PovStep[] = []

  for (const step of log.steps) {
    const ghostBefore = pov !== 'narrator' && dead.has(pov)
    const events = step.events.filter((e) => canSee(e, pov) && (!ghostBefore || e.visible_to === 'all'))

    for (const e of events) {
      switch (e.type) {
        case 'role_assigned':
          if (e.actor) known[e.actor] = e.payload.role
          break
        case 'pack_revealed':
          for (const m of e.payload.members as PlayerId[]) known[m] = 'werewolf'
          break
        case 'inspect':
          if (e.target) known[e.target] = e.payload.role
          break
        case 'spy':
          if (e.payload.outcome === 'glimpsed' && e.payload.glimpsed) known[e.payload.glimpsed] = 'werewolf'
          if (e.payload.outcome === 'caught' && e.actor) known[e.actor] = 'little_girl'
          break
        case 'death_announced':
        case 'elimination':
          if (e.target) { known[e.target] = e.payload.role; dead.add(e.target) }
          break
      }
    }
    // Deaths are public, so mark them even if (as a ghost) we filtered something.
    for (const e of step.events) {
      if ((e.type === 'death_announced' || e.type === 'elimination') && e.target) dead.add(e.target)
    }

    if (pov !== 'narrator' && step.beliefs[pov]) lastBeliefs = step.beliefs[pov]
    steps.push({
      step,
      events,
      known: { ...known },
      dead: new Set(dead),
      beliefs: pov === 'narrator' ? null : lastBeliefs,
      ghost: pov !== 'narrator' && dead.has(pov),
      consensus: consensusAt(log, step),
    })
  }
  return { pov, steps }
}

/** Roles a POV hunts for, in priority order. */
function focusPriority(log: GameLog, pov: Pov): Role[] {
  const wolf = pov !== 'narrator' && log.players.find((p) => p.id === pov)?.team === 'werewolves'
  const order: Role[] = wolf ? ['seer', 'witch', 'little_girl', 'cupid'] : ['werewolf']
  return order.filter((r) => log.players.some((p) => p.role === r))
}

/**
 * Automatic focus: the first role in the POV's priority list that is still hidden from them,
 * i.e. not every holder of that card is known yet. Falls back to the last role in the list.
 */
export function autoFocus(log: GameLog, pov: Pov, frame: PovStep): Role {
  const order = focusPriority(log, pov)
  if (order.length === 0) return 'werewolf'
  for (const r of order) {
    const total = log.players.filter((p) => p.role === r && p.id !== pov).length
    const known = Object.entries(frame.known).filter(([id, role]) => role === r && id !== pov).length
    if (known < total) return r
  }
  return order[order.length - 1]
}

export function povName(log: GameLog, pov: Pov): string {
  return pov === 'narrator' ? 'Narrator' : (log.players.find((p) => p.id === pov)?.name ?? pov)
}
