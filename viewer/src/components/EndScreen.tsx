import type { GameLog } from '../types/log'
import type { Pov, PovTrack } from '../lib/pov'
import { accuracySeries, chanceLevel, sharpestMinds, turningPoints, villageAccuracy } from '../lib/metrics'
import { stepLabel } from '../lib/narrate'
import { PERSONALITY_ICON, ROLE_ICON, ROLE_LABEL } from '../lib/roles'
import { PIN_COLORS_DAY, PIN_COLORS_NIGHT } from '../lib/series'
import { pct } from './village/Token'
import './end.css'

const CAUSE: Record<string, string> = {
  wolves: 'killed by the werewolves',
  vote: 'eliminated by the village',
  poison: 'poisoned by the witch',
  caught_spying: 'caught spying by the werewolves',
  heartbreak: 'died of a broken heart',
}

export function EndScreen({ log, track, pov, night, onClose, onJump }: {
  log: GameLog; track: PovTrack; pov: Pov; night: boolean; onClose: () => void; onJump: (t: number) => void
}) {
  const village = log.result.winner === 'village'
  const names = Object.fromEntries(log.players.map((p) => [p.id, p.name]))
  const me = log.players.find((p) => p.id === pov)
  const meWolf = me?.team === 'werewolves'
  const turning = turningPoints(log, track, pov)
  const minds = sharpestMinds(log)
  const won = me ? me.team === log.result.winner : null

  return (
    <div className="end-overlay" role="dialog" aria-modal="true" aria-label="Game summary" onClick={onClose}>
      <div className={`end-sheet panel ${village ? 'win-village' : 'win-wolves'}`} onClick={(e) => e.stopPropagation()}>
        <button className="btn icon end-close" onClick={onClose} aria-label="Close summary">✕</button>
        <header className="end-hero">
          <div className="end-emblem">{village ? '☀️' : '🐺'}</div>
          <h1>{village ? 'The village wins' : 'The werewolves win'}</h1>
          <p className="story">
            After {log.result.final_round} {log.result.final_round === 1 ? 'round' : 'rounds'}.
            {me && <> {won ? ` ${me.name} is on the winning side.` : ` ${me.name} is on the losing side.`}</>}
          </p>
        </header>

        <div className="end-grid">
          <section className="end-card">
            <h2>Eliminations</h2>
            <ol className="elims">
              {log.result.eliminations.map((e, i) => {
                const p = log.players.find((x) => x.id === e.player)!
                return (
                  <li key={i}>
                    <span className="elim-card" title={ROLE_LABEL[p.role]}>{ROLE_ICON[p.role]}</span>
                    <span>
                      <strong>{p.name}</strong>{p.id === pov ? ' (you)' : ''} <span className="muted">· {ROLE_LABEL[p.role]}</span>
                      <br />
                      <span className="muted">{e.phase === 'night' ? 'Night' : 'Day'} {e.round}, {CAUSE[e.cause] ?? e.cause}</span>
                    </span>
                    {e.t != null && <button className="chip" onClick={() => onJump(e.t!)}>go</button>}
                  </li>
                )
              })}
            </ol>
            <p className="muted end-survivors">
              Survivors: {log.players.filter((p) => !log.result.eliminations.some((e) => e.player === p.id))
                .map((p) => `${ROLE_ICON[p.role]} ${p.name}`).join(' · ') || 'none'}
            </p>
          </section>

          <section className="end-card">
            <h2>Belief accuracy</h2>
            <p className="muted end-note">
              Average P(Werewolf) put on the true werewolves. 1 means every wolf was found.
              {meWolf && ' As a werewolf, the POV always knows the pack, so only the villagers are shown.'}
            </p>
            <AccuracyChart log={log} pov={meWolf ? 'narrator' : pov} night={night} />
          </section>

          <section className="end-card">
            <h2>Turning points</h2>
            <p className="muted end-note">
              The biggest single-step jumps in {pov === 'narrator' ? 'the village consensus' : `${me?.name}'s ${meWolf ? 'P(Seer / Witch / Little Girl)' : 'P(Werewolf)'}`}, card reveals at death excluded.
            </p>
            {turning.length === 0 ? <p className="muted">No big jumps.</p> : (
              <ol className="turning">
                {turning.map((m, i) => (
                  <li key={i}>
                    <button className="turning-btn" onClick={() => onJump(m.t)}>
                      <span className="turning-when">{stepLabel(track.steps[m.t].step)}</span>
                      <span className="num turning-mv" style={{ color: m.to > m.from ? 'var(--blood)' : 'var(--good)' }}>
                        {names[m.target]}{m.role && m.role !== 'werewolf' ? ` P(${ROLE_LABEL[m.role]})` : ''} {pct(m.from)} → {pct(m.to)} {m.to > m.from ? '▲' : '▼'}
                      </span>
                      {m.because && <span className="story">{m.because.icon} {m.because.text}</span>}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="end-card">
            <h2>Sharpest minds</h2>
            <p className="muted end-note">Villagers ranked by mean accuracy while alive.</p>
            <ol className="minds">
              {minds.map((m) => {
                const p = log.players.find((x) => x.id === m.id)!
                return (
                  <li key={m.id} className={m.id === pov ? 'me' : ''}>
                    <span className="mind-name">{ROLE_ICON[p.role]} {p.name} {p.personality !== 'none' && <span title={p.personality}>{PERSONALITY_ICON[p.personality]}</span>}</span>
                    <span className="mind-bar"><span style={{ width: `${m.mean * 100}%` }} /></span>
                    <span className="num">{pct(m.mean)}</span>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}

/** POV accuracy (highlighted), village average, each villager (muted), and the chance level. */
function AccuracyChart({ log, pov, night }: { log: GameLog; pov: Pov; night: boolean }) {
  const W = 460, H = 200, M = { l: 34, r: 84, t: 10, b: 22 }
  const n = log.steps.length
  const x = (s: number) => M.l + (s / Math.max(1, n - 1)) * (W - M.l - M.r)
  const y = (v: number) => M.t + (1 - v) * (H - M.t - M.b)
  const colors = night ? PIN_COLORS_NIGHT : PIN_COLORS_DAY
  const path = (vals: (number | null)[]) => {
    let d = '', pen = false
    vals.forEach((v, s) => {
      if (v == null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(s).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const lastPoint = (vals: (number | null)[]) => {
    for (let s = vals.length - 1; s >= 0; s--) if (vals[s] != null) return { s, v: vals[s]! }
    return null
  }
  const villagers = log.players.filter((p) => p.team === 'village')
  const avg = villageAccuracy(log)
  const mine = pov !== 'narrator' ? accuracySeries(log, pov) : null
  const chance = chanceLevel(log)
  const labels = [
    mine && lastPoint(mine) ? { text: `${log.players.find((p) => p.id === pov)?.name} ${pct(lastPoint(mine)!.v)}`, ...lastPoint(mine)!, color: colors[0] } : null,
    lastPoint(avg) ? { text: `Village ${pct(lastPoint(avg)!.v)}`, ...lastPoint(avg)!, color: 'var(--ink)' } : null,
  ].filter(Boolean) as { text: string; s: number; v: number; color: string }[]
  labels.sort((a, b) => y(a.v) - y(b.v))
  const ly = labels.map((l) => y(l.v))
  for (let i = 1; i < ly.length; i++) if (ly[i] - ly[i - 1] < 13) ly[i] = ly[i - 1] + 13

  return (
    <div>
      <div className="acc-legend">
        {mine && <span><span className="sw" style={{ background: colors[0] }} /> {log.players.find((p) => p.id === pov)?.name}</span>}
        <span><span className="sw" style={{ background: 'var(--ink)' }} /> Village average</span>
        <span><span className="sw thin" /> Each villager</span>
        <span><span className="sw dotted" /> Chance ({pct(chance)})</span>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Belief accuracy over time">
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line className="grid" x1={M.l} x2={W - M.r} y1={y(g)} y2={y(g)} />
            <text className="axis-label" x={M.l - 6} y={y(g)} textAnchor="end" dominantBaseline="central">{g * 100}%</text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={y(chance)} y2={y(chance)} stroke="var(--ink-soft)" strokeDasharray="2 4" strokeWidth={1.5} />
        {villagers.map((p) => p.id !== pov && (
          <path key={p.id} d={path(accuracySeries(log, p.id))} className="line muted" />
        ))}
        <path d={path(avg)} className="line" stroke="var(--ink)" strokeWidth={2} />
        {mine && <path d={path(mine)} className="line" stroke={colors[0]} strokeWidth={2.6} />}
        {labels.map((l, i) => (
          <text key={i} className="end-label" x={x(l.s) + 6} y={ly[i]} dominantBaseline="central">{l.text}</text>
        ))}
        <text className="axis-label" x={M.l} y={H - 6}>start</text>
        <text className="axis-label" x={W - M.r} y={H - 6} textAnchor="end">end</text>
      </svg>
    </div>
  )
}
