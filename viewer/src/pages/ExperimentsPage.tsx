import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Role } from '../types/log'
import { loadSummary, survivalByRole, winRateByPersonality, winRateByRole, type GameRow, type Rate } from '../lib/experiments'
import { PERSONALITY_ICON, PERSONALITY_LABEL, ROLE_ICON, ROLE_LABEL } from '../lib/roles'
import { useMood } from '../lib/mood'
import './experiments.css'

const ROLE_ORDER: Role[] = ['werewolf', 'seer', 'witch', 'little_girl', 'cupid', 'villager']
const fmt = (r: Rate) => (r.n ? `${Math.round((r.wins / r.n) * 100)}%` : '—')

export function ExperimentsPage() {
  useMood('night')
  const nav = useNavigate()
  const [rows, setRows] = useState<GameRow[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [size, setSize] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<'id' | 'rounds' | 'winner'>('id')

  useEffect(() => { loadSummary().then(({ rows, errors }) => { setRows(rows); setErrors(errors) }) }, [])

  const sizes = useMemo(() => [...new Set((rows ?? []).map((r) => r.n_players))].sort((a, b) => a - b), [rows])
  const shown = useMemo(() => (rows ?? []).filter((r) => size === 'all' || r.n_players === size), [rows, size])
  const byRole = winRateByRole(shown).sort((a, b) => ROLE_ORDER.indexOf(a.key as Role) - ROLE_ORDER.indexOf(b.key as Role))
  const surv = Object.fromEntries(survivalByRole(shown).map((r) => [r.key, r]))
  const byPers = winRateByPersonality(shown)
  const villageWins = shown.filter((r) => r.winner === 'village').length
  const avgRounds = shown.length ? shown.reduce((a, r) => a + r.rounds, 0) / shown.length : 0
  const sorted = [...shown].sort((a, b) =>
    sort === 'rounds' ? b.rounds - a.rounds : sort === 'winner' ? a.winner.localeCompare(b.winner) : Number(Boolean(b.log_file)) - Number(Boolean(a.log_file)) || a.game_id.localeCompare(b.game_id))

  return (
    <div className="exp">
      <header className="exp-head">
        <Link to="/" className="btn">← Start</Link>
        <div>
          <h1>Experiments</h1>
          <p className="muted">From <code>results/summary.csv</code> · one row per simulated game</p>
        </div>
      </header>

      {errors.length > 0 && (
        <div className="error-box" role="alert">
          <h3>Problems reading summary.csv</h3>
          <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {!rows && <p className="muted story">Reading the village records…</p>}

      {rows && rows.length > 0 && (
        <>
          <div className="exp-filters" role="group" aria-label="Filter by number of players">
            <span className="muted">Players</span>
            <button className={`chip ${size === 'all' ? 'on' : ''}`} onClick={() => setSize('all')}>All</button>
            {sizes.map((s) => (
              <button key={s} className={`chip ${size === s ? 'on' : ''}`} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>

          <div className="kpis">
            <div className="kpi panel"><div className="kpi-v num">{shown.length}</div><div className="kpi-k">games</div></div>
            <div className="kpi panel"><div className="kpi-v num">{shown.length ? Math.round((villageWins / shown.length) * 100) : 0}%</div><div className="kpi-k">☀️ village wins</div></div>
            <div className="kpi panel"><div className="kpi-v num">{shown.length ? Math.round(((shown.length - villageWins) / shown.length) * 100) : 0}%</div><div className="kpi-k">🐺 werewolf wins</div></div>
            <div className="kpi panel"><div className="kpi-v num">{avgRounds.toFixed(1)}</div><div className="kpi-k">rounds on average</div></div>
          </div>

          <div className="exp-grid">
            <section className="panel exp-card">
              <h2>Win rate by role</h2>
              <p className="muted exp-note">Share of players holding the role whose team won. The dashed line marks 50%.</p>
              <div className="bars">
                {byRole.map((r) => (
                  <Bar key={r.key} label={`${ROLE_ICON[r.key as Role]} ${ROLE_LABEL[r.key as Role]}`} rate={r}
                    series={r.key === 'werewolf' ? 'wolves' : 'village'}
                    extra={surv[r.key] ? `survived ${fmt(surv[r.key])}` : undefined} />
                ))}
              </div>
              <Legend />
            </section>

            {byPers.length > 0 && <section className="panel exp-card">
              <h2>Win rate by personality</h2>
              <p className="muted exp-note">For each personality, how often its players won, split by the team they were on.</p>
              <div className="bars">
                {byPers.map((p) => (
                  <div key={p.personality} className="bar-group">
                    <div className="bar-group-label">{PERSONALITY_ICON[p.personality]} {PERSONALITY_LABEL[p.personality]}</div>
                    <Bar label="as villager" rate={p.village} series="village" compact />
                    <Bar label="as werewolf" rate={p.werewolves} series="wolves" compact />
                  </div>
                ))}
              </div>
              <Legend />
            </section>}
          </div>

          <section className="panel exp-card games">
            <div className="games-head">
              <h2>Games</h2>
              <div className="sort" role="group" aria-label="Sort games">
                <span className="muted">Sort</span>
                {(['id', 'rounds', 'winner'] as const).map((k) => (
                  <button key={k} className={`chip ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{k === 'id' ? 'with log first' : k}</button>
                ))}
              </div>
            </div>
            <div className="table-scroll">
              <table className="games-table">
                <thead>
                  <tr><th>game</th><th className="num">players</th><th>winner</th><th className="num">rounds</th><th>survivors</th><th /></tr>
                </thead>
                <tbody>
                  {sorted.map((g) => (
                    <tr key={g.game_id}>
                      <td><code>{g.game_id}</code></td>
                      <td className="num">{g.n_players}</td>
                      <td>{g.winner === 'village' ? '☀️ village' : '🐺 werewolves'}</td>
                      <td className="num">{g.rounds}</td>
                      <td className="survivors">{g.roster.filter((p) => p.survived).map((p) => ROLE_ICON[p.role]).join(' ')}</td>
                      <td>
                        {g.log_file
                          ? <button className="btn open" onClick={() => nav(`/game?log=${encodeURIComponent(g.log_file)}&pov=narrator`)}>Open ▶</button>
                          : <span className="muted">no log</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Bar({ label, rate, series, extra, compact }: { label: string; rate: Rate; series: 'village' | 'wolves'; extra?: string; compact?: boolean }) {
  const p = rate.n ? rate.wins / rate.n : 0
  return (
    <div className={`bar-row ${compact ? 'compact' : ''}`} title={`${label}: ${rate.wins} of ${rate.n} won (${fmt(rate)})`}>
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className={`bar-fill ${series}`} style={{ width: `${p * 100}%` }} />
        <span className="bar-half" />
      </span>
      <span className="bar-val num">{fmt(rate)}</span>
      <span className="bar-n muted num">n={rate.n}{extra ? ` · ${extra}` : ''}</span>
    </div>
  )
}

function Legend() {
  return (
    <div className="exp-legend muted">
      <span><span className="sw village" /> village team</span>
      <span><span className="sw wolves" /> werewolf team</span>
    </div>
  )
}
