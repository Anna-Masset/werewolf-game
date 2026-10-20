import type { EventType, Personality, Role } from '../types/log'

export const ROLE_LABEL: Record<Role, string> = {
  werewolf: 'Werewolf',
  seer: 'Seer',
  witch: 'Witch',
  little_girl: 'Little Girl',
  villager: 'Villager',
  cupid: 'Cupid',
}

export const ROLE_ICON: Record<Role, string> = {
  werewolf: '🐺',
  seer: '🔮',
  witch: '🧪',
  little_girl: '👧',
  villager: '🌾',
  cupid: '💘',
}

/** Ring / bar color per focus role. Always paired with a printed number. */
export const ROLE_COLOR: Record<Role, string> = {
  werewolf: '#c8323c',
  seer: '#8a63d2',
  witch: '#2f9e6e',
  little_girl: '#d4709b',
  villager: '#b58b3a',
  cupid: '#e0567a',
}

export const PERSONALITY_ICON: Record<Personality, string> = {
  aggressive: '⚔️',
  discreet: '🤫',
  manipulative: '🎭',
  trusting: '🤝',
}

export const PERSONALITY_LABEL: Record<Personality, string> = {
  aggressive: 'Aggressive',
  discreet: 'Discreet',
  manipulative: 'Manipulative',
  trusting: 'Trusting',
}

/** Groups used for timeline markers and feed filters. */
export type EventGroup = 'death' | 'inspect' | 'potion' | 'vote' | 'night' | 'talk' | 'setup'

export const EVENT_GROUP: Record<EventType, EventGroup> = {
  role_assigned: 'setup',
  pack_revealed: 'setup',
  lovers_bound: 'setup',
  captain_elected: 'vote',
  spy: 'night',
  wolf_target: 'night',
  inspect: 'inspect',
  potion: 'potion',
  dawn: 'death',
  death_announced: 'death',
  elimination: 'death',
  conversation: 'talk',
  impression: 'talk',
  statement: 'talk',
  vote: 'vote',
  vote_result: 'vote',
  game_end: 'death',
}

export const GROUP_LABEL: Record<EventGroup, string> = {
  death: 'Deaths',
  inspect: 'Inspections',
  potion: 'Potions',
  vote: 'Votes',
  night: 'Night actions',
  talk: 'Talk',
  setup: 'Setup',
}

export const GROUP_ICON: Record<EventGroup, string> = {
  death: '💀',
  inspect: '🔮',
  potion: '🧪',
  vote: '🗳️',
  night: '🌙',
  talk: '💬',
  setup: '🃏',
}
