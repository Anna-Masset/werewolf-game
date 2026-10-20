// Loading logs: bundled files from public/logs, or a file the user picked.
import type { GameLog } from '../types/log'
import { validateLog, type ValidationResult } from './validate'

export interface LogIndexEntry {
  file: string
  title?: string
  players?: number
  rounds?: number
  winner?: string
  mock?: boolean
}

export type LoadResult =
  | { ok: true; log: GameLog; warnings: string[]; source: string }
  | { ok: false; source: string; errors: string[] }

/** Logs picked from disk live here for the session (keyed "upload:<name>"). */
const uploads = new Map<string, unknown>()

export async function fetchIndex(): Promise<LogIndexEntry[]> {
  const res = await fetch('logs/index.json')
  if (!res.ok) throw new Error(`Could not load logs/index.json (${res.status})`)
  return res.json()
}

export async function registerUpload(file: File): Promise<string> {
  const key = `upload:${file.name}`
  const text = await file.text()
  try {
    uploads.set(key, JSON.parse(text))
  } catch (e) {
    uploads.set(key, { __parseError: (e as Error).message })
  }
  return key
}

const cache = new Map<string, LoadResult>()

export async function loadLog(source: string): Promise<LoadResult> {
  const hit = cache.get(source)
  if (hit) return hit
  let data: unknown
  if (source.startsWith('upload:')) {
    if (!uploads.has(source)) {
      return { ok: false, source, errors: ['This uploaded file is no longer in memory (the page was reloaded). Pick it again from the start screen.'] }
    }
    data = uploads.get(source)
  } else {
    const res = await fetch(`logs/${encodeURIComponent(source)}`)
    if (!res.ok) return { ok: false, source, errors: [`Could not fetch logs/${source} (HTTP ${res.status}).`] }
    try {
      data = await res.json()
    } catch (e) {
      return { ok: false, source, errors: [`logs/${source} is not valid JSON: ${(e as Error).message}`] }
    }
  }
  if (data && typeof data === 'object' && '__parseError' in data) {
    return { ok: false, source, errors: [`Not valid JSON: ${(data as { __parseError: string }).__parseError}`] }
  }
  const v: ValidationResult = validateLog(data)
  const result: LoadResult = v.ok
    ? { ok: true, log: data as GameLog, warnings: v.warnings, source }
    : { ok: false, source, errors: v.errors }
  cache.set(source, result)
  return result
}
