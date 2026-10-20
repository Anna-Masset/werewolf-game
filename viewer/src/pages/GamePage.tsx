import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { GameLog, Role } from '../types/log'
import { loadLog, type LoadResult } from '../lib/loader'
import { buildTrack, defaultFocus, type Pov } from '../lib/pov'
import { narrate, stepLabel } from '../lib/narrate'
import { ROLE_COLOR, ROLE_ICON, ROLE_LABEL } from '../lib/roles'
import { useMood } from '../lib/mood'
import { usePlayback } from '../state/playback'
import { Village } from '../components/village/Village'
import { Timeline } from '../components/Timeline'
import { ErrorBox } from '../components/ErrorBox'
import './game.css'

const FOCUS_ROLES: Role[] = ['werewolf', 'seer', 'witch', 'little_girl', 'cupid']

export function GamePage() {
  const [params, setParams] = useSearchParams()
  const source = params.get('log') ?? ''
  const [result, setResult] = useState<LoadResult | null>(null)

  useEffect(() => { setResult(null); loadLog(source).then(setResult) }, [source])

  if (!result) return <div className="game-loading story">Lighting the fire…</div>
  if (!result.ok) {
    return (
      <div className="game-error">
        <ErrorBox source={result.source} errors={result.errors} />
        <Link className="btn" to="/">← Back to the start screen</Link>
      </div>
    )
  }
  const povParam = params.get('pov') ?? 'narrator'
  const pov: Pov = povParam === 'narrator' || result.log.players.some((p) => p.id === povParam) ? povParam : 'narrator'
  return (
    <Game
      key={source}
      log={result.log}
      warnings={result.warnings}
      pov={pov}
      setPov={(p) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('pov', p); return n }, { replace: true })}
    />
  )
}

function Game({ log, warnings, pov, setPov }: { log: GameLog; warnings: string[]; pov: Pov; setPov: (p: Pov) => void }) {
  const track = useMemo(() => buildTrack(log, pov), [log, pov])
  const pb = usePlayback(log.steps.length)
  const [focus, setFocus] = useState<Role>(() => defaultFocus(log, pov))
  const [showTruth, setShowTruth] = useState(false)
  const [warnOpen, setWarnOpen] = useState(warnings.length > 0)
  useEffect(() => setFocus(defaultFocus(log, pov)), [log, pov])

  const frame = track.steps[pb.t]
  const step = frame.step
  const night = step.phase === 'night' || step.phase === 'setup' || (step.phase === 'end' && log.result.winner !== 'village')
  useMood(night ? 'night' : 'day')

  const rolesInGame = FOCUS_ROLES.filter((r) => log.players.some((p) => p.role === r))
  const narrator = pov === 'narrator'
  const me = log.players.find((p) => p.id === pov)
  const lines = frame.events.map((e) => narrate(e, log, pov, frame.known))
  const deathStep = me ? track.steps.find((s) => s.dead.has(me.id))?.step : undefined

  return (
    <div className="game">
      <header className="game-head">
        <Link to="/" className="btn" title="Back to start">← Start</Link>
        <div className="game-titles">
          <h1>{log.meta.title ?? 'Untitled game'}</h1>
          <div className="muted">
            {log.players.length} players {log.meta.mock && <span className="badge mock">mock data</span>}
          </div>
        </div>

        <label className="pov-switch">
          <span className="muted">Point of view</span>
          <select value={pov} onChange={(e) => setPov(e.target.value)}>
            <option value="narrator">👁️ Narrator (all roles)</option>
            {log.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        {!narrator && (
          <div className="focus-switch" role="group" aria-label="Focus role">
            <span className="muted">Watching for</span>
            {rolesInGame.map((r) => (
              <button
                key={r}
                className={`chip ${focus === r ? 'on' : ''}`}
                style={focus === r ? { borderColor: ROLE_COLOR[r], boxShadow: `0 0 0 1px ${ROLE_COLOR[r]} inset` } : undefined}
                onClick={() => setFocus(r)}
              >
                {ROLE_ICON[r]} {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        )}
        {!narrator && (
          <label className="truth-toggle chip">
            <input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} /> Show truth
          </label>
        )}
      </header>

      {warnOpen && (
        <div className="warn-box game-warn">
          <strong>This log loaded with {warnings.length} warning(s).</strong> {warnings[0]}
          {warnings.length > 1 && ` (+${warnings.length - 1} more)`}
          <button className="chip" onClick={() => setWarnOpen(false)}>dismiss</button>
        </div>
      )}

      <main className="game-main">
        <section className="village-wrap">
          <div className={`phase-banner ${night ? 'night' : 'day'}`} key={`${step.phase}-${step.round}`}>
            <span className="phase-icon">{step.phase === 'end' ? (log.result.winner === 'village' ? '☀️' : '🐺') : night ? '🌙' : '☀️'}</span>
            <span className="phase-name">{stepLabel(step)}</span>
            {step.subphase && <span className="phase-sub">{step.subphase}</span>}
          </div>
          {frame.ghost && deathStep && (
            <div className="ghost-banner story">
              👻 You died ({stepLabel(deathStep)}). You watch as a ghost: your beliefs are frozen and you only see public events.
            </div>
          )}
          <Village log={log} pov={pov} frame={frame} focus={focus} showTruth={showTruth} night={night} />
        </section>

        <aside className="side">
          <div className="panel side-card">
            <h3>{narrator ? 'What happened' : `What ${me?.name} saw`}</h3>
            <p className="muted side-sub">{stepLabel(step)}{step.subphase ? ` · ${step.subphase}` : ''}</p>
            {lines.length === 0 ? (
              <p className="story muted">{narrator ? 'Nothing happens in this step.' : 'You see nothing of what happens now.'}</p>
            ) : (
              <ul className="step-lines">
                {lines.map((l, i) => (
                  <li key={`${pb.t}-${i}`} className={`fade-up story tone-${l.tone ?? 'plain'}`} style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="line-icon">{l.icon}</span> {l.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel side-card legend">
            <h3>Reading the village</h3>
            <ul>
              {!narrator && (
                <li>
                  <svg width="26" height="26" viewBox="-13 -13 26 26"><circle r="10" fill="none" stroke={ROLE_COLOR[focus]} strokeWidth="4" strokeDasharray="44 63" transform="rotate(-90)" /></svg>
                  Thick ring: {me?.name}'s P({ROLE_LABEL[focus]}) for that player.
                </li>
              )}
              <li>
                <svg width="26" height="26" viewBox="-13 -13 26 26"><circle r="11" fill="none" stroke="var(--consensus)" strokeWidth="2.5" strokeDasharray="30 69" transform="rotate(-90)" /></svg>
                Thin gold ring: village consensus P(Werewolf), averaged over living villagers.
              </li>
              <li><span className="legend-q">?</span> Role unknown to {narrator ? 'nobody' : me?.name}. Dead players show their revealed card.</li>
              <li>⚔️ aggressive · 🤫 discreet · 🎭 manipulative · 🤝 trusting</li>
            </ul>
          </div>
        </aside>
      </main>

      <Timeline track={track} pb={pb} />
    </div>
  )
}
