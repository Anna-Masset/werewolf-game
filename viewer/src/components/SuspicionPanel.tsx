import type { GameLog, Role } from '../types/log'
import type { PovTrack } from '../lib/pov'
import { valueAt } from '../lib/series'
import { PERSONALITY_ICON, ROLE_COLOR, ROLE_ICON, ROLE_LABEL } from '../lib/roles'
import { pct } from './village/Token'
import './panels.css'

/** POV's P(focus) for every player as sorted bars, with the change since the previous step. */
export function SuspicionPanel({ log, track, t, focus, showTruth }: {
  log: GameLog; track: PovTrack; t: number; focus: Role; showTruth: boolean
}) {
  const narrator = track.pov === 'narrator'
  const role: Role = narrator ? 'werewolf' : focus
  const frame = track.steps[t]
  const rows = log.players
    .filter((p) => p.id !== track.pov)
    .map((p) => {
      const v = valueAt(track, t, p.id, role)
      const prev = t > 0 ? valueAt(track, t - 1, p.id, role) : null
      return { p, v, delta: v != null && prev != null ? v - prev : 0, dead: frame.dead.has(p.id) }
    })
    .sort((a, b) => Number(a.dead) - Number(b.dead) || (b.v ?? -1) - (a.v ?? -1))

  return (
    <div className="suspicion">
      <p className="muted panel-note">
        {narrator
          ? 'Village consensus P(Werewolf): the average over living villagers.'
          : <>{track.steps[t].ghost ? 'Frozen at death. ' : ''}{log.players.find((p) => p.id === track.pov)?.name}'s P({ROLE_LABEL[role]}) for each player.</>}
        {' '}▲▼ = change since the previous step.
      </p>
      <ul className="susp-list">
        {rows.map(({ p, v, delta, dead }) => {
          const known = frame.known[p.id]
          const truth = narrator || showTruth ? p.role : undefined
          return (
            <li key={p.id} className={`susp-row ${dead ? 'dead' : ''}`}>
              <span className="susp-name">
                <span className="susp-role" title={known ? ROLE_LABEL[known] : truth ? `true: ${ROLE_LABEL[truth]}` : 'unknown'}>
                  {known ? ROLE_ICON[known] : truth ? <span className="truth">{ROLE_ICON[truth]}</span> : '?'}
                </span>
                {p.name}
                <span className="susp-pers" title={p.personality}>{PERSONALITY_ICON[p.personality]}</span>
                {dead && <span className="muted"> ✝</span>}
              </span>
              <span className="susp-bar">
                <span style={{ width: `${(v ?? 0) * 100}%`, background: narrator ? 'var(--consensus)' : ROLE_COLOR[role] }} />
              </span>
              <span className="susp-val num">{v != null ? pct(v) : '—'}</span>
              <span className={`susp-delta num ${delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : ''}`}>
                {delta > 0.005 ? `▲${Math.round(delta * 100)}` : delta < -0.005 ? `▼${Math.round(-delta * 100)}` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
