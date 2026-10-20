// Log validation: JSON Schema first (structure), then consistency checks the
// schema can't express (ids that exist, probabilities that sum to 1, ...).
// Used both by the viewer on load and by `npm run validate-logs`.
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import schema from '../../../schema/game_log.schema.json'
import type { GameLog } from '../types/log'

export interface ValidationResult {
  ok: boolean
  /** Problems that make the file unusable. */
  errors: string[]
  /** Suspicious but displayable (e.g. probabilities summing to 0.97). */
  warnings: string[]
}

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validateSchema = ajv.compile(schema)

const MAX_MESSAGES = 25

export function validateLog(data: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!validateSchema(data)) {
    for (const e of validateSchema.errors ?? []) {
      // if/then branches produce a noisy "must match then schema" duplicate; skip it.
      if (e.keyword === 'if') continue
      const where = e.instancePath || '(root)'
      const extra = e.keyword === 'enum' ? ` (allowed: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(', ')})`
        : e.keyword === 'const' ? ` ${JSON.stringify((e.params as { allowedValue: unknown }).allowedValue)}`
        : e.keyword === 'additionalProperties' ? ` ("${(e.params as { additionalProperty: string }).additionalProperty}")`
          : ''
      errors.push(`${where}: ${e.message}${extra}`)
    }
    return { ok: false, errors: dedupe(errors).slice(0, MAX_MESSAGES), warnings }
  }

  const log = data as unknown as GameLog
  const ids = new Set(log.players.map((p) => p.id))
  const check = (cond: boolean, msg: string, list = errors) => { if (!cond) list.push(msg) }

  check(ids.size === log.players.length, 'players: duplicate player ids')
  const known = (id: string | null | undefined, where: string) => {
    if (id != null && !ids.has(id)) errors.push(`${where}: unknown player id "${id}"`)
  }

  log.steps.forEach((s, i) => {
    const at = `steps[${i}]`
    check(s.t === i, `${at}: t is ${s.t}, expected ${i} (steps must be ordered and contiguous)`)
    if (i > 0) check(s.round >= log.steps[i - 1].round, `${at}: round goes backwards`)
    s.events.forEach((e, j) => {
      known(e.actor, `${at}.events[${j}].actor`)
      known(e.target, `${at}.events[${j}].target`)
      if (Array.isArray(e.visible_to)) e.visible_to.forEach((v) => known(v, `${at}.events[${j}].visible_to`))
    })
    s.decisions.forEach((d, j) => {
      known(d.player, `${at}.decisions[${j}].player`)
      check(d.chosen < d.options.length, `${at}.decisions[${j}]: chosen index ${d.chosen} out of range`)
    })
    for (const [obs, row] of Object.entries(s.beliefs)) {
      known(obs, `${at}.beliefs`)
      for (const [tgt, dist] of Object.entries(row)) {
        known(tgt, `${at}.beliefs.${obs}`)
        if (tgt === obs) warnings.push(`${at}.beliefs.${obs}: contains a belief about itself`)
        const sum = Object.values(dist).reduce((a, b) => a + (b ?? 0), 0)
        if (Math.abs(sum - 1) > 0.02) warnings.push(`${at}.beliefs.${obs}.${tgt}: probabilities sum to ${sum.toFixed(3)}`)
      }
    }
  })
  log.result.eliminations.forEach((e, i) => known(e.player, `result.eliminations[${i}].player`))

  // Story sanity: wolves shouldn't target a fellow wolf.
  const role = Object.fromEntries(log.players.map((p) => [p.id, p.role]))
  log.steps.forEach((s, i) => s.events.forEach((e) => {
    if (e.type === 'wolf_target' && e.target && role[e.target] === 'werewolf') {
      warnings.push(`steps[${i}]: werewolves targeted a fellow werewolf (${e.target})`)
    }
    if (e.type === 'inspect' && e.target && e.payload.role !== role[e.target]) {
      warnings.push(`steps[${i}]: inspection of ${e.target} returned ${e.payload.role}, but their role is ${role[e.target]}`)
    }
  }))

  return { ok: errors.length === 0, errors: dedupe(errors).slice(0, MAX_MESSAGES), warnings: dedupe(warnings).slice(0, MAX_MESSAGES) }
}

function dedupe(xs: string[]) { return [...new Set(xs)] }
