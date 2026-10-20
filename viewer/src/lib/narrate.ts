// Turns events into sentences, as the POV player experienced them.
import type { GameEvent, GameLog, PlayerId, Role, Step } from '../types/log'
import type { Pov } from './pov'
import { EVENT_GROUP, GROUP_ICON, ROLE_LABEL, type EventGroup } from './roles'

export interface Narration {
  text: string
  group: EventGroup
  icon: string
  /** Extra emphasis, e.g. a death or a bluff the POV can see through. */
  tone?: 'grim' | 'good' | 'secret' | 'bluff'
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function stepLabel(step: Step): string {
  if (step.phase === 'setup') return 'Setup'
  if (step.phase === 'end') return 'Game over'
  return `${step.phase === 'night' ? 'Night' : 'Day'} ${step.round}`
}

export function narrate(
  e: GameEvent,
  log: GameLog,
  pov: Pov,
  known: Record<PlayerId, Role>,
): Narration {
  const names = Object.fromEntries(log.players.map((p) => [p.id, p.name]))
  const me = (id: PlayerId | null) => id !== null && id === pov
  const who = (id: PlayerId | null) => (id === null ? 'someone' : me(id) ? 'you' : names[id] ?? id)
  const Who = (id: PlayerId | null) => cap(who(id))
  const role = (r: Role) => ROLE_LABEL[r] ?? r
  const article = (r: Role) => (/^[AEIOU]/.test(role(r)) ? 'an' : 'a')
  const group = EVENT_GROUP[e.type]
  const base = { group, icon: GROUP_ICON[group] }
  const p = e.payload

  switch (e.type) {
    case 'role_assigned':
      return { ...base, icon: '🃏', text: me(e.actor) ? `You are the ${role(p.role)}.` : `${Who(e.actor)} is the ${role(p.role)}.` }
    case 'pack_revealed': {
      const members = (p.members as PlayerId[]).filter((m) => !me(m)).map(who)
      return { ...base, icon: '🐺', tone: 'secret', text: pov !== 'narrator' && (p.members as PlayerId[]).includes(pov)
        ? `Your pack: ${members.join(', ')}.` : `The werewolves are ${members.join(', ')}.` }
    }
    case 'spy':
      if (p.outcome === 'caught') {
        return { ...base, tone: 'grim', text: me(e.actor) ? 'You were caught spying on the werewolves!'
          : `${Who(e.actor)} was caught spying: the Little Girl!` }
      }
      if (p.outcome === 'glimpsed') {
        return { ...base, tone: 'secret', text: me(e.actor) ? `You peeked and glimpsed ${who(p.glimpsed)} among the werewolves!`
          : `${Who(e.actor)} peeked and glimpsed ${who(p.glimpsed)} among the werewolves.` }
      }
      return { ...base, text: me(e.actor) ? 'You peeked at the werewolves but saw nothing.' : `${Who(e.actor)} peeked but saw nothing.` }
    case 'wolf_target': {
      const wolfPov = pov !== 'narrator' && known[pov] === 'werewolf'
      return { ...base, tone: 'grim', text: wolfPov ? `The pack chose ${who(e.target)} as tonight's victim.`
        : pov === 'narrator' ? `The werewolves chose ${who(e.target)}.` : `The werewolves attacked ${who(e.target)} tonight.` }
    }
    case 'inspect':
      return { ...base, tone: 'secret', text: `${me(e.actor) ? 'You' : Who(e.actor)} inspected ${who(e.target)}: ${role(p.role).toLowerCase()}.` }
    case 'potion':
      return p.kind === 'heal'
        ? { ...base, tone: 'good', text: `${Who(e.actor)} used the healing potion on ${who(e.target)}.` }
        : { ...base, tone: 'grim', text: `${Who(e.actor)} poisoned ${who(e.target)}.` }
    case 'dawn': {
      const n = (p.deaths as PlayerId[]).length
      return { ...base, icon: '🌅', text: n === 0 ? 'Dawn: nobody died during the night.'
        : `Dawn: the village wakes to ${n === 1 ? 'one death' : `${n} deaths`}.` }
    }
    case 'death_announced':
      return { ...base, tone: 'grim', text: me(e.target) ? `You did not survive the night. Your card: ${role(p.role)}.`
        : `${Who(e.target)} was found dead. Card revealed: ${role(p.role)}.` }
    case 'conversation':
      return { ...base, text: me(e.actor) || me(e.target)
        ? `You spoke privately with ${who(me(e.actor) ? e.target : e.actor)}${p.topic ? ` about ${p.topic}` : ''}.`
        : `${Who(e.actor)} and ${who(e.target)} spoke privately${p.topic ? ` about ${p.topic}` : ''}.` }
    case 'impression':
      return { ...base, icon: p.verdict === 'suspicious' ? '🤨' : '🙂', tone: 'secret',
        text: `${Who(e.actor)} found ${who(e.target)} ${p.verdict}.` }
    case 'statement': {
      const quote = p.text ? ` “${p.text}”` : ''
      switch (p.kind) {
        case 'accuse': return { ...base, icon: '☝️', text: `${Who(e.actor)} accused ${who(e.target)}.${quote}` }
        case 'defend': return { ...base, icon: '🛡️', text: `${Who(e.actor)} defended ${who(e.target)}.${quote}` }
        case 'quiet': return { ...base, icon: '🤐', text: `${Who(e.actor)} stayed quiet.` }
        case 'claim_role': {
          const truth = e.actor ? known[e.actor] : undefined
          const bluff = truth !== undefined && truth !== p.claimed_role && !me(e.actor)
          const own = me(e.actor) && truth !== p.claimed_role
          return { ...base, icon: '📣', tone: bluff || own ? 'bluff' : undefined,
            text: `${Who(e.actor)} claimed to be the ${role(p.claimed_role)}${bluff ? ' (a lie!)' : own ? ' (a bluff)' : ''}.${quote}` }
        }
      }
      return { ...base, text: `${Who(e.actor)} spoke.` }
    }
    case 'vote':
      return { ...base, text: `${Who(e.actor)} voted against ${who(e.target)}${p.ballot === 'runoff' ? ' in the runoff' : ''}.` }
    case 'vote_result': {
      const tally = Object.entries(p.tally as Record<PlayerId, number>).sort((a, b) => b[1] - a[1])
      const top = tally.filter(([, n]) => n === tally[0][1])
      if (p.tied) {
        return { ...base, icon: '⚖️', text: `Tie between ${top.map(([id]) => who(id)).join(' and ')} (${top[0][1]} votes each).${p.runoff ? ' A runoff follows.' : ' Nobody is eliminated.'}` }
      }
      return { ...base, icon: '⚖️', text: `${Who(p.eliminated)} received the most votes (${top[0][1]}).` }
    }
    case 'elimination':
      return { ...base, tone: 'grim', icon: '🪓', text: me(e.target) ? `The village eliminated you. Your card: ${role(p.role)}.`
        : `${Who(e.target)} was eliminated by the village. Card revealed: ${article(p.role)} ${role(p.role)}.` }
    case 'game_end':
      return { ...base, icon: p.winner === 'village' ? '☀️' : '🐺', tone: 'good',
        text: p.winner === 'village' ? 'The village is free of werewolves. The village wins!' : 'The werewolves overrun the village. The werewolves win!' }
    case 'lovers_bound':
      return { ...base, icon: '💘', text: `${Who(e.actor)} and ${who(e.target)} are bound as lovers.` }
    case 'captain_elected':
      return { ...base, icon: '🎖️', text: `${Who(e.target)} was elected captain.` }
  }
}
