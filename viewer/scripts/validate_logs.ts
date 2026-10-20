/**
 * Validate game logs against schema/game_log.schema.json plus consistency checks.
 *
 *   npm run validate-logs                 # every .json in public/logs (except index.json)
 *   npm run validate-logs -- path/a.json  # specific files (e.g. simulator output)
 *
 * Exits with code 1 if any file has errors.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateLog } from '../src/lib/validate'

const LOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'logs')
const args = process.argv.slice(2)
const files = args.length
  ? args
  : readdirSync(LOG_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => join(LOG_DIR, f))

let failed = 0
for (const f of files) {
  let data: unknown
  try {
    data = JSON.parse(readFileSync(f, 'utf8'))
  } catch (e) {
    console.log(`✗ ${f}\n    not valid JSON: ${(e as Error).message}`)
    failed++
    continue
  }
  const r = validateLog(data)
  console.log(`${r.ok ? '✓' : '✗'} ${f}`)
  for (const e of r.errors) console.log(`    error:   ${e}`)
  for (const w of r.warnings) console.log(`    warning: ${w}`)
  if (!r.ok) failed++
}
console.log(failed ? `\n${failed} file(s) failed.` : `\nAll ${files.length} file(s) valid.`)
process.exit(failed ? 1 : 0)
