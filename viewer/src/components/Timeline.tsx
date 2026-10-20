import type React from 'react'
import type { PovTrack } from '../lib/pov'
import { stepLabel } from '../lib/narrate'
import { GROUP_ICON, GROUP_LABEL, type EventGroup } from '../lib/roles'
import { SPEEDS, type Playback } from '../state/playback'
import './timeline.css'

/** Event groups that get a marker on the timeline (only if visible to the POV). */
const MARKED: { group: EventGroup; test: (type: string, payload: Record<string, unknown>) => boolean }[] = [
  { group: 'death', test: (t) => t === 'death_announced' || t === 'elimination' },
  { group: 'inspect', test: (t) => t === 'inspect' },
  { group: 'potion', test: (t) => t === 'potion' },
  { group: 'vote', test: (t) => t === 'vote_result' },
]

export function Timeline({ track, pb }: { track: PovTrack; pb: Playback }) {
  const steps = track.steps
  const n = steps.length
  const cur = steps[pb.t].step

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.floor(((e.clientX - box.left) / box.width) * n)
    if (i !== pb.t) pb.setT(i)
  }

  // Group consecutive steps of the same round+phase for the labels.
  const bands: { from: number; to: number; label: string; phase: string }[] = []
  steps.forEach(({ step }, i) => {
    const label = stepLabel(step)
    const last = bands[bands.length - 1]
    if (last && last.label === label) last.to = i
    else bands.push({ from: i, to: i, label, phase: step.phase })
  })

  return (
    <div className="timeline panel">
      <div className="tl-controls">
        <button className="btn icon" onClick={() => pb.setT(0)} title="First step (Home)" aria-label="First step">⏮</button>
        <button className="btn icon" onClick={() => pb.step(-1)} title="Previous step (←)" aria-label="Previous step">◀</button>
        <button className="btn icon play" onClick={pb.toggle} title="Play / pause (space)" aria-label={pb.playing ? 'Pause' : 'Play'}>
          {pb.playing ? '⏸' : '▶'}
        </button>
        <button className="btn icon" onClick={() => pb.step(1)} title="Next step (→)" aria-label="Next step">▶</button>
        <button className="btn icon" onClick={() => pb.setT(n - 1)} title="Last step (End)" aria-label="Last step">⏭</button>
        <div className="tl-speed" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button key={s} className={`chip ${pb.speed === s ? 'on' : ''}`} onClick={() => pb.setSpeed(s)}>{s}×</button>
          ))}
        </div>
        <div className="tl-now">
          <span className="tl-now-label">{stepLabel(cur)}</span>
          {cur.subphase && <span className="muted"> · {cur.subphase}</span>}
          <span className="muted num"> · step {pb.t + 1}/{n}</span>
        </div>
        <div className="tl-keys muted">← → step · space play</div>
      </div>

      <div
        className="tl-track-wrap"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e) }}
        onPointerMove={(e) => { if (e.buttons & 1) scrub(e) }}
      >
        <div className="tl-bands" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {bands.map((b) => (
            <div
              key={b.from}
              className={`tl-band ${b.phase}`}
              style={{ gridColumn: `${b.from + 1} / ${b.to + 2}` }}
              title={b.label}
            >
              <span>{b.label.replace('Night ', 'N').replace('Day ', 'D')}</span>
            </div>
          ))}
        </div>
        <div className="tl-cells" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {steps.map((s, i) => {
            const groups = MARKED.filter((m) => s.events.some((e) => m.test(e.type, e.payload))).map((m) => m.group)
            const decides = track.pov !== 'narrator' && s.step.decisions.some((d) => d.player === track.pov)
            return (
              <div key={i} className={`tl-cell ${s.step.phase} ${i <= pb.t ? 'past' : ''} ${i === pb.t ? 'current' : ''}`}>
                <div className="tl-markers">
                  {decides && <span className="tl-marker" title="Your decision">🧠</span>}
                  {groups.map((g) => (
                    <span key={g} className={`tl-marker ${g}`} title={GROUP_LABEL[g]}>{GROUP_ICON[g]}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <input
          className="tl-range"
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={pb.t}
          onChange={(e) => pb.setT(Number(e.target.value))}
          aria-label="Timeline"
          aria-valuetext={`${stepLabel(cur)} ${cur.subphase ?? ''}`}
        />
      </div>
      <div className="tl-legend muted">
        {track.pov !== 'narrator' && <span>🧠 Your decisions</span>}
        {MARKED.map((m) => <span key={m.group}>{GROUP_ICON[m.group]} {GROUP_LABEL[m.group]}</span>)}
      </div>
    </div>
  )
}
