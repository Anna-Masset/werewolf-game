// The probability shown for a player at a step, from the current POV:
// the POV's own P(focus role), or the village consensus P(werewolf) for the Narrator.
import type { PlayerId, Role } from '../types/log'
import type { PovTrack } from './pov'

export function valueAt(track: PovTrack, t: number, id: PlayerId, focus: Role): number | null {
  const s = track.steps[t]
  if (!s) return null
  if (track.pov === 'narrator') return s.consensus[id] ?? null
  if (id === track.pov) return null
  return s.beliefs?.[id]?.[focus] ?? null
}

/** Categorical slots for pinned players (validated against both night and day panels). */
export const PIN_COLORS_NIGHT = ['#3987e5', '#d95926', '#199e70', '#c98500']
export const PIN_COLORS_DAY = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100']
export const MAX_PINS = 4
