import { useState } from 'react'
import type { Decision, GameLog, PlayerId } from '../types/log'
import type { Pov, PovTrack } from '../lib/pov'
import { KIND_QUESTION, actionLabel, biggestMoves, drivingRole, previousDecisionT } from '../lib/decisions'
import { stepLabel } from '../lib/narrate'
import { ROLE_COLOR, ROLE_LABEL } from '../lib/roles'
import { pct } from './village/Token'
import './decision.css'

const SHOWN = 6

/**
 * One POV decision, laid out as the POMDP view of it:
 *   observations o since the last decision -> belief b -> U(b, a) for each a in A -> π(b) = argmax.
 */
export function DecisionCard({ log, track, pov, t, decision }: {
  log: GameLog; track: PovTrack; pov: Pov; t: number; decision: Decision
}) {
  const [all, setAll] = useState(false)
  const names = Object.fromEntries(log.players.map((p) => [p.id, p.name]))
  const me = log.players.find((p) => p.id === decision.player)!
  const role = drivingRole(me.team, decision.kind)
  // The decision is taken on the belief held *before* this step's own events.
  const b = track.steps[Math.max(0, t - 1)].beliefs
  const prevT = previousDecisionT(track, pov, t)
  // Include the previous decision's own step: its events come after that decision.
  const movers = biggestMoves(log, track, pov, Math.max(0, prevT - 1), t - 1, role)

  const ranked = decision.options.map((o, i) => ({ o, i })).sort((x, y) => y.o.value - x.o.value)
  const best = ranked[0]
  const chosen = decision.options[decision.chosen]
  const isArgmax = chosen.value >= best.o.value - 1e-9
  const runnerUp = ranked.find((r) => r.i !== decision.chosen)
  const margin = runnerUp ? chosen.value - runnerUp.o.value : null
  const lo = Math.min(0, ...decision.options.map((o) => o.value))
  const hi = Math.max(...decision.options.map((o) => o.value), lo + 1e-6)
  const shown = all ? ranked : ranked.slice(0, SHOWN)
  if (!all && !shown.some((r) => r.i === decision.chosen)) shown.push(ranked.find((r) => r.i === decision.chosen)!)

  return (
    <div className="panel decision fade-up">
      <div className="dc-head">
        <span className="dc-brain">🧠</span>
        <div>
          <h3>Decision · {stepLabel(track.steps[t].step)}</h3>
          <div className="story dc-question">{KIND_QUESTION[decision.kind]}</div>
        </div>
      </div>

      <section className="dc-sec">
        <div className="dc-sec-title"><span className="dc-n">1</span><span>Observations <i>o</i> since the last decision</span></div>
        {movers.length === 0 ? (
          <p className="muted dc-empty">Nothing moved {me.name}'s P({ROLE_LABEL[role]}) by more than 3 points.</p>
        ) : (
          <ul className="dc-movers">
            {movers.map((m, i) => (
              <li key={i}>
                <span className="dc-mv num" style={{ color: m.to > m.from ? 'var(--blood)' : 'var(--good)' }}>
                  {names[m.target]} {pct(m.from)} → {pct(m.to)} {m.to > m.from ? '▲' : '▼'}
                </span>
                {m.because && <span className="story dc-because">{m.because.icon} {m.because.text}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dc-sec">
        <div className="dc-sec-title">
          <span className="dc-n">2</span><span>Actions <i>a</i> ∈ <i>A</i>, belief <i>b</i>, and value <i>U</i>(<i>b</i>, <i>a</i>)</span>
        </div>
        <table className="dc-table">
          <thead>
            <tr>
              <th>action</th>
              <th className="num" title={`${me.name}'s belief before deciding`}>b: P({ROLE_LABEL[role]})</th>
              <th>U(b, a)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ o, i }) => {
              const p = o.target && b ? b[o.target as PlayerId]?.[role] : undefined
              const w = ((o.value - lo) / (hi - lo)) * 100
              const isChosen = i === decision.chosen
              return (
                <tr key={i} className={isChosen ? 'chosen' : ''}>
                  <td className="dc-act">{isChosen ? '✓ ' : ''}{actionLabel(o, names)}</td>
                  <td className="num dc-p" style={{ color: p != null ? ROLE_COLOR[role] : undefined }}>{p != null ? pct(p) : '—'}</td>
                  <td className="dc-u">
                    <span className="dc-bar"><span style={{ width: `${Math.max(2, w)}%` }} /></span>
                    <span className="num">{o.value.toFixed(2)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {decision.options.length > SHOWN && (
          <button className="chip dc-more" onClick={() => setAll(!all)}>
            {all ? 'show fewer' : `show all ${decision.options.length} actions`}
          </button>
        )}
      </section>

      <section className="dc-sec">
        <div className="dc-sec-title"><span className="dc-n">3</span><span>Policy π(<i>b</i>) = argmax<sub><i>a</i></sub> <i>U</i>(<i>b</i>, <i>a</i>)</span></div>
        <p className="dc-policy">
          <strong>{actionLabel(chosen, names)}</strong>
          {isArgmax ? (
            margin != null && <span className="muted"> · beats the runner-up ({actionLabel(runnerUp!.o, names)}) by <span className="num">{margin.toFixed(2)}</span></span>
          ) : (
            <span className="dc-warn"> · not the argmax: {actionLabel(best.o, names)} scored higher ({best.o.value.toFixed(2)})</span>
          )}
        </p>
      </section>
    </div>
  )
}
