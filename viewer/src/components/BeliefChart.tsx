import type React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { GameLog, PlayerId, Role } from '../types/log'
import type { PovTrack } from '../lib/pov'
import { valueAt, MAX_PINS, PIN_COLORS_DAY, PIN_COLORS_NIGHT } from '../lib/series'
import { stepLabel } from '../lib/narrate'
import { GROUP_ICON, ROLE_LABEL, type EventGroup } from '../lib/roles'
import { pct } from './village/Token'
import './panels.css'

const M = { left: 36, right: 92, top: 10, bottom: 24 }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const MARKER_OF = (type: string): EventGroup | null =>
  type === 'death_announced' || type === 'elimination' ? 'death'
    : type === 'inspect' ? 'inspect' : type === 'potion' ? 'potion' : type === 'vote_result' ? 'vote' : null

/**
 * One line per player: the POV's P(focus) over time (village consensus for the Narrator).
 * Lines are muted by default; pin up to four players to give them a fixed color and a label.
 * Only steps up to the current one are drawn, so the chart never spoils the future.
 */
export function BeliefChart({ log, track, t, focus, showTruth, night, height, onJump }: {
  log: GameLog; track: PovTrack; t: number; focus: Role; showTruth: boolean; night: boolean; height: number
  onJump: (t: number) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [pins, setPins] = useState<(PlayerId | null)[]>(Array(MAX_PINS).fill(null))
  const [hot, setHot] = useState<PlayerId | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const narrator = track.pov === 'narrator'
  const role: Role = narrator ? 'werewolf' : focus
  const truth = narrator || showTruth
  const colors = night ? PIN_COLORS_NIGHT : PIN_COLORS_DAY
  const n = track.steps.length
  const W = Math.max(320, width)
  const H = height
  const x = (s: number) => M.left + (s / Math.max(1, n - 1)) * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - v) * (H - M.top - M.bottom)
  const players = log.players.filter((p) => p.id !== track.pov)
  const slot = (id: PlayerId) => pins.indexOf(id)

  const togglePin = (id: PlayerId) => setPins((prev) => {
    const i = prev.indexOf(id)
    const next = [...prev]
    if (i >= 0) next[i] = null
    else {
      const free = next.indexOf(null)
      if (free < 0) return prev
      next[free] = id
    }
    return next
  })

  // Series up to the current step; a line stops at the step its player's death is announced.
  const series = players.map((p) => {
    const pts: { s: number; v: number }[] = []
    let deadAt: number | null = null
    for (let s = 0; s <= t; s++) {
      const v = valueAt(track, s, p.id, role)
      if (v != null) pts.push({ s, v })
      if (track.steps[s].dead.has(p.id)) { deadAt = s; break }
    }
    return { p, pts, deadAt }
  })

  // Direct labels: pinned lines, plus the hot one; nudged apart vertically.
  const labeled = series
    .filter((sr) => sr.pts.length && (slot(sr.p.id) >= 0 || sr.p.id === hot))
    .map((sr) => { const last = sr.pts[sr.pts.length - 1]; return { sr, x: x(last.s), y: y(last.v), v: last.v } })
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < labeled.length; i++) if (labeled[i].y - labeled[i - 1].y < 13) labeled[i].y = labeled[i - 1].y + 13

  const hs = hover != null ? Math.min(hover, t) : null
  const tipRows = hs != null
    ? series.map((sr) => ({ sr, v: valueAt(track, hs, sr.p.id, role), dead: sr.deadAt != null && sr.deadAt < hs }))
      .filter((r) => r.v != null && !r.dead)
      .sort((a, b) => (slot(b.sr.p.id) >= 0 ? 1 : 0) - (slot(a.sr.p.id) >= 0 ? 1 : 0) || (b.v! - a.v!))
      .slice(0, 7)
    : []

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const s = Math.round(((px - M.left) / (W - M.left - M.right)) * (n - 1))
    setHover(s >= 0 && s < n ? s : null)
  }

  return (
    <div className="panel chart-wrap" ref={ref}>
      <div className="chart-head">
        <h3>Belief history · {narrator ? 'village P(Werewolf)' : `P(${ROLE_LABEL[role]})`}</h3>
        <div className="chart-legend" role="group" aria-label="Pin players">
          {players.map((p) => {
            const i = slot(p.id)
            const wolf = truth && p.role === 'werewolf'
            return (
              <button
                key={p.id}
                className={`chip ${i >= 0 ? 'on' : ''}`}
                style={i >= 0 ? { borderColor: colors[i], color: 'var(--ink)' } : undefined}
                onClick={() => togglePin(p.id)}
                onMouseEnter={() => setHot(p.id)}
                onMouseLeave={() => setHot(null)}
                title={i >= 0 ? 'Unpin' : pins.includes(null) ? 'Pin this line' : `Up to ${MAX_PINS} pins`}
                aria-pressed={i >= 0}
              >
                <span className={`swatch ${wolf ? 'dashed' : ''}`} style={{ background: i >= 0 ? colors[i] : 'var(--ink-soft)', color: i >= 0 ? colors[i] : 'var(--ink-soft)' }} />
                {p.name}
              </button>
            )
          })}
        </div>
      </div>

      <svg
        className="chart-svg"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={() => hs != null && onJump(hs)}
        role="img"
        aria-label={`Belief history up to ${stepLabel(track.steps[t].step)}`}
      >
        {track.steps.map((fr, s) => (fr.step.phase === 'night' || fr.step.phase === 'setup') && (
          <rect key={s} className="band-night" x={x(s) - (x(1) - x(0)) / 2} width={x(1) - x(0)} y={M.top} height={H - M.top - M.bottom} />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line className="grid" x1={M.left} x2={W - M.right} y1={y(g)} y2={y(g)} />
            <text className="axis-label" x={M.left - 6} y={y(g)} textAnchor="end" dominantBaseline="central">{g * 100}%</text>
          </g>
        ))}

        {/* event markers along the bottom, POV-visible only */}
        {track.steps.slice(0, t + 1).map((fr, s) => {
          const groups = [...new Set(fr.events.map((e) => MARKER_OF(e.type)).filter(Boolean))] as EventGroup[]
          return groups.slice(0, 2).map((g, k) => (
            <text key={`${s}-${g}`} className="ev-marker" x={x(s) + (k - (groups.length - 1) / 2) * 12} y={H - 9}>{GROUP_ICON[g]}</text>
          ))
        })}

        <line className="now-line" x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} />

        {/* muted lines first, pinned on top */}
        {[...series].sort((a, b) => slot(a.p.id) - slot(b.p.id)).map(({ p, pts, deadAt }) => {
          if (pts.length === 0) return null
          const i = slot(p.id)
          const d = pts.map((q, k) => `${k ? 'L' : 'M'}${x(q.s).toFixed(1)},${y(q.v).toFixed(1)}`).join('')
          const cls = i >= 0 ? 'pinned' : 'muted'
          const isHot = hot === p.id
          const faded = hot !== null && !isHot
          const last = pts[pts.length - 1]
          return (
            <g key={p.id}>
              <path
                d={d}
                className={`line ${cls} ${isHot ? 'hot' : ''} ${faded ? 'faded' : ''}`}
                stroke={i >= 0 ? colors[i] : isHot ? 'var(--ink)' : undefined}
                strokeDasharray={truth && p.role === 'werewolf' ? '6 4' : undefined}
              />
              {deadAt != null && (
                <circle className="death-dot" cx={x(last.s)} cy={y(last.v)} r={4} fill={i >= 0 ? colors[i] : 'var(--ink-soft)'} />
              )}
            </g>
          )
        })}

        {labeled.map(({ sr, x: lx, y: ly, v }) => (
          <text key={sr.p.id} className="end-label" x={lx + 8} y={ly} dominantBaseline="central">
            {sr.p.name} {pct(v)}
          </text>
        ))}

        {hs != null && <line className="crosshair" x1={x(hs)} x2={x(hs)} y1={M.top} y2={H - M.bottom} />}
        {hs != null && tipRows.map(({ sr, v }) => (
          <circle key={sr.p.id} cx={x(hs)} cy={y(v!)} r={3.5} fill={slot(sr.p.id) >= 0 ? colors[slot(sr.p.id)] : 'var(--ink-soft)'} stroke="var(--panel)" strokeWidth={2} />
        ))}
      </svg>

      {hs != null && (
        <div
          className="chart-tip"
          style={{ left: Math.min(x(hs) + 26, W - 150), top: 34 }}
        >
          <h4>{stepLabel(track.steps[hs].step)}{track.steps[hs].step.subphase ? ` · ${track.steps[hs].step.subphase}` : ''}</h4>
          <ul>
            {tipRows.map(({ sr, v }) => (
              <li key={sr.p.id}>
                <span className="k">
                  <span className="sw" style={slot(sr.p.id) >= 0 ? { background: colors[slot(sr.p.id)] } : undefined} />
                  {sr.p.name}
                </span>
                <span className="num">{pct(v!)}</span>
              </li>
            ))}
          </ul>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>click to jump here</div>
        </div>
      )}
    </div>
  )
}
