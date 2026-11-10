import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchIndex, loadLog, registerUpload, type LoadResult, type LogIndexEntry } from '../lib/loader'
import { PERSONALITY_ICON, PERSONALITY_LABEL, ROLE_ICON, ROLE_LABEL } from '../lib/roles'
import type { Pov } from '../lib/pov'
import { useMood } from '../lib/mood'
import { ErrorBox } from '../components/ErrorBox'
import './start.css'

export function StartPage() {
  useMood('night')
  const nav = useNavigate()
  const [index, setIndex] = useState<LogIndexEntry[] | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [result, setResult] = useState<LoadResult | null>(null)
  const [pov, setPov] = useState<Pov | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchIndex().then(setIndex).catch((e) => setIndexError(String(e.message ?? e)))
  }, [])

  useEffect(() => {
    if (!source) return
    setResult(null)
    setPov(null)
    loadLog(source).then(setResult)
  }, [source])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setSource(await registerUpload(f))
  }

  const enter = () => {
    if (!source || !pov) return
    nav(`/game?log=${encodeURIComponent(source)}&pov=${encodeURIComponent(pov)}`)
  }

  const log = result?.ok ? result.log : null

  return (
    <div className="start">
      <header className="start-hero">
        <div className="moon" aria-hidden>
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /><circle cx="66" cy="40" r="36" className="bite" /></svg>
        </div>
        <h1>How a Village Acts with Fear</h1>
        <p className="story subtitle">Replay a game of Werewolf through the eyes of one villager, or watch it all as the Narrator.</p>
      </header>

      <main className="start-grid">
        <section className="panel start-col">
          <h2>1 · Choose a game</h2>
          {indexError && <p className="muted">No bundled list found ({indexError}). You can still open a file.</p>}
          <ul className="game-list">
            {index?.map((g) => (
              <li key={g.file}>
                <button className={`game-card ${source === g.file ? 'on' : ''}`} onClick={() => setSource(g.file)}>
                  <span className="game-title">{g.title ?? g.file}</span>
                  <span className="game-meta">
                    {g.players != null && <span className="badge">👥 {g.players} players</span>}
                    {g.mock && <span className="badge mock">mock data</span>}
                    <span className="badge">{g.file}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="file-open">
            <button className="btn" onClick={() => fileInput.current?.click()}>📂 Open a log file…</button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            {source?.startsWith('upload:') && <span className="muted"> {source.slice(7)}</span>}
          </div>
        </section>

        <section className="panel start-col">
          <h2>2 · Whose eyes?</h2>
          {!source && <p className="muted story">Pick a game first.</p>}
          {source && !result && <p className="muted">Loading…</p>}
          {result && !result.ok && <ErrorBox source={result.source} errors={result.errors} />}
          {log && (
            <>
              <p className="muted">
                {log.players.length} players · {log.steps.length} steps
                {result?.ok && result.warnings.length > 0 && ` · ${result.warnings.length} warning(s)`}
              </p>
              <div className="pov-grid">
                <button className={`pov-card narrator ${pov === 'narrator' ? 'on' : ''}`} onClick={() => setPov('narrator')}>
                  <span className="pov-icon">👁️</span>
                  <span className="pov-name">Narrator</span>
                  <span className="pov-sub">sees every card</span>
                </button>
                {log.players.map((p) => (
                  <button key={p.id} className={`pov-card ${pov === p.id ? 'on' : ''}`} onClick={() => setPov(p.id)}>
                    <span className="pov-icon">{pov === 'narrator' ? ROLE_ICON[p.role] : '?'}</span>
                    <span className="pov-name">{p.name}</span>
                    <span className="pov-sub">
                      {p.personality !== 'none' && <>{PERSONALITY_ICON[p.personality]} {PERSONALITY_LABEL[p.personality]}</>}
                      {pov === 'narrator' && <>{p.personality !== 'none' && ' · '}{ROLE_LABEL[p.role]}</>}
                    </span>
                  </button>
                ))}
              </div>
              <div className="enter-row">
                <button className="btn primary" disabled={!pov} onClick={enter}>Enter the village →</button>
                {!pov && <span className="muted">Choose a point of view.</span>}
              </div>
            </>
          )}
        </section>
      </main>
      <div className="start-exp">
        <Link to="/experiments" className="btn">📊 Experiments: win rates by role and personality →</Link>
      </div>
      <footer className="start-foot muted">AA228/CS238 · Werewolf belief viewer · logs follow <code>schema/game_log.schema.json</code></footer>
    </div>
  )
}
