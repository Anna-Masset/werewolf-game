import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameLog } from '../types/log'
import type { PovTrack } from '../lib/pov'
import { narrate, stepLabel } from '../lib/narrate'
import { EVENT_GROUP, GROUP_ICON, GROUP_LABEL, type EventGroup } from '../lib/roles'
import './panels.css'

const GROUPS: EventGroup[] = ['death', 'night', 'inspect', 'potion', 'talk', 'vote', 'setup']

/** Everything the POV experienced up to the current step, newest last. Click a line to jump there. */
export function EventFeed({ log, track, t, onJump }: {
  log: GameLog; track: PovTrack; t: number; onJump: (t: number) => void
}) {
  const [off, setOff] = useState<Set<EventGroup>>(new Set())
  const end = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => {
    const out: { t: number; label: string; sub?: string; items: ReturnType<typeof narrate>[] }[] = []
    for (let s = 0; s <= t; s++) {
      const fr = track.steps[s]
      const items = fr.events.filter((e) => !off.has(EVENT_GROUP[e.type])).map((e) => narrate(e, log, track.pov, fr.known))
      if (items.length) out.push({ t: s, label: stepLabel(fr.step), sub: fr.step.subphase, items })
    }
    return out
  }, [log, track, t, off])

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [t, entries.length])

  const toggle = (g: EventGroup) => setOff((prev) => {
    const n = new Set(prev)
    if (n.has(g)) n.delete(g)
    else n.add(g)
    return n
  })

  return (
    <div className="feed">
      <div className="feed-filters" role="group" aria-label="Filter events">
        {GROUPS.map((g) => (
          <button key={g} className={`chip ${off.has(g) ? '' : 'on'}`} onClick={() => toggle(g)} aria-pressed={!off.has(g)}>
            {GROUP_ICON[g]} {GROUP_LABEL[g]}
          </button>
        ))}
      </div>
      <div className="feed-list">
        {entries.length === 0 && <p className="muted story">Nothing to show yet.</p>}
        {entries.map((en) => (
          <section key={en.t} className={`feed-step ${en.t === t ? 'current' : ''}`}>
            <button className="feed-head" onClick={() => onJump(en.t)} title="Jump to this step">
              <span className="feed-when">{en.label}</span>
              {en.sub && <span className="muted"> · {en.sub}</span>}
            </button>
            <ul>
              {en.items.map((it, i) => (
                <li key={i} className={`story tone-${it.tone ?? 'plain'}`}>
                  <span className="line-icon">{it.icon}</span> {it.text}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div ref={end} />
      </div>
    </div>
  )
}
