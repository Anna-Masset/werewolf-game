/**
 * Rebuild public/logs/index.json (the list on the start screen) from the .json
 * files in public/logs. Run after dropping new simulator logs in that folder:
 *
 *   npm run index-logs
 *
 * Invalid files are listed with a warning and still indexed, so the viewer can
 * show their validation errors.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateLog } from '../src/lib/validate'

const LOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'logs')
const entries = readdirSync(LOG_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort()
  .map((file) => {
    try {
      const log = JSON.parse(readFileSync(join(LOG_DIR, file), 'utf8'))
      if (!validateLog(log).ok) console.warn(`warning: ${file} does not match the schema`)
      return {
        file,
        title: log.meta?.title,
        players: log.players?.length,
        rounds: log.result?.final_round,
        winner: log.result?.winner,
        mock: Boolean(log.meta?.mock),
      }
    } catch {
      console.warn(`warning: ${file} is not valid JSON`)
      return { file }
    }
  })
writeFileSync(join(LOG_DIR, 'index.json'), JSON.stringify(entries, null, 2) + '\n')
console.log(`indexed ${entries.length} log(s)`)
