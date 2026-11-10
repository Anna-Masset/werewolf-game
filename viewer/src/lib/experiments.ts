// Parsing and aggregating results/summary.csv (one row per simulated game).
//
// Columns: game_id, log_file, seed, n_players, winner, rounds, roster
// roster = "name|role|personality|survived;name|role|personality|died;..."
import Papa from 'papaparse'
import type { Personality, Role, Team } from '../types/log'

export interface RosterEntry {
  name: string
  role: Role
  personality: Personality
  survived: boolean
}

export interface GameRow {
  game_id: string
  log_file: string
  seed: number
  n_players: number
  winner: Team
  rounds: number
  roster: RosterEntry[]
}

export const REQUIRED_COLUMNS = ['game_id', 'log_file', 'seed', 'n_players', 'winner', 'rounds', 'roster']

export async function loadSummary(): Promise<{ rows: GameRow[]; errors: string[] }> {
  const res = await fetch('results/summary.csv')
  if (!res.ok) return { rows: [], errors: [`Could not fetch results/summary.csv (HTTP ${res.status}).`] }
  return parseSummary(await res.text())
}

export function parseSummary(text: string): { rows: GameRow[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const errors = parsed.errors.slice(0, 5).map((e) => `CSV row ${e.row ?? '?'}: ${e.message}`)
  const cols = parsed.meta.fields ?? []
  const missing = REQUIRED_COLUMNS.filter((c) => !cols.includes(c))
  if (missing.length) return { rows: [], errors: [`summary.csv is missing column(s): ${missing.join(', ')}`, ...errors] }

  const rows: GameRow[] = []
  parsed.data.forEach((r, i) => {
    const roster = (r.roster ?? '').split(';').filter(Boolean).map((cell) => {
      const [name, role, personality, fate] = cell.split('|')
      return { name, role: role as Role, personality: personality as Personality, survived: fate === 'survived' }
    })
    if (r.winner !== 'village' && r.winner !== 'werewolves') {
      errors.push(`row ${i + 2}: winner must be "village" or "werewolves" (got "${r.winner}")`)
      return
    }
    rows.push({
      game_id: r.game_id,
      log_file: r.log_file ?? '',
      seed: Number(r.seed),
      n_players: Number(r.n_players),
      winner: r.winner,
      rounds: Number(r.rounds),
      roster,
    })
  })
  return { rows, errors }
}

export const teamOfRole = (r: Role): Team => (r === 'werewolf' ? 'werewolves' : 'village')

export interface Rate {
  key: string
  wins: number
  n: number
}

/** For each role: how often a player holding it ended on the winning team. */
export function winRateByRole(rows: GameRow[]): Rate[] {
  const m = new Map<string, Rate>()
  for (const g of rows) for (const p of g.roster) {
    const r = m.get(p.role) ?? { key: p.role, wins: 0, n: 0 }
    r.n++
    if (teamOfRole(p.role) === g.winner) r.wins++
    m.set(p.role, r)
  }
  return [...m.values()]
}

/** For each personality and team: how often such a player ended on the winning team. Empty if no player has one. */
export function winRateByPersonality(rows: GameRow[]): { personality: Personality; village: Rate; werewolves: Rate }[] {
  const pers: Personality[] = ['aggressive', 'discreet', 'manipulative', 'trusting']
  if (!rows.some((g) => g.roster.some((p) => p.personality !== 'none'))) return []
  return pers.map((personality) => {
    const village = { key: 'village', wins: 0, n: 0 }, werewolves = { key: 'werewolves', wins: 0, n: 0 }
    for (const g of rows) for (const p of g.roster) {
      if (p.personality !== personality) continue
      const team = teamOfRole(p.role)
      const r = team === 'village' ? village : werewolves
      r.n++
      if (team === g.winner) r.wins++
    }
    return { personality, village, werewolves }
  })
}

/** Survival rate per role. */
export function survivalByRole(rows: GameRow[]): Rate[] {
  const m = new Map<string, Rate>()
  for (const g of rows) for (const p of g.roster) {
    const r = m.get(p.role) ?? { key: p.role, wins: 0, n: 0 }
    r.n++
    if (p.survived) r.wins++
    m.set(p.role, r)
  }
  return [...m.values()]
}
