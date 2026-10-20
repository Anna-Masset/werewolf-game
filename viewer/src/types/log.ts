// TypeScript mirror of schema/game_log.schema.json (v1.0.0).
// Keep the two in sync: the schema is the contract, these types are a convenience.

export type PlayerId = string
export type Role = 'werewolf' | 'seer' | 'witch' | 'little_girl' | 'villager' | 'cupid'
export type Team = 'village' | 'werewolves' | 'lovers'
export type Personality = 'aggressive' | 'discreet' | 'manipulative' | 'trusting'
export type Phase = 'setup' | 'night' | 'day' | 'end'
export type Visibility = 'all' | PlayerId[]

export type EventType =
  | 'role_assigned'
  | 'pack_revealed'
  | 'spy'
  | 'wolf_target'
  | 'inspect'
  | 'potion'
  | 'dawn'
  | 'death_announced'
  | 'conversation'
  | 'impression'
  | 'statement'
  | 'vote'
  | 'vote_result'
  | 'elimination'
  | 'game_end'
  | 'lovers_bound'
  | 'captain_elected'

export interface GameEvent {
  type: EventType
  actor: PlayerId | null
  target: PlayerId | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
  visible_to: Visibility
}

export type RoleDist = Partial<Record<Role, number>>
/** observer -> target -> role -> probability */
export type Beliefs = Record<PlayerId, Record<PlayerId, RoleDist>>

export type DecisionKind = 'wolf_target' | 'spy' | 'inspect' | 'potion' | 'talk_to' | 'statement' | 'vote'

export interface DecisionOption {
  action: string
  target?: PlayerId | null
  value: number
  label?: string
}

export interface Decision {
  player: PlayerId
  kind: DecisionKind
  options: DecisionOption[]
  chosen: number
}

export interface Step {
  t: number
  round: number
  phase: Phase
  subphase?: string
  events: GameEvent[]
  beliefs: Beliefs
  decisions: Decision[]
}

export interface Player {
  id: PlayerId
  name: string
  role: Role
  team: Team
  personality: Personality
}

export type DeathCause = 'wolves' | 'vote' | 'poison' | 'caught_spying' | 'heartbreak'

export interface Elimination {
  player: PlayerId
  round: number
  phase: Phase
  t?: number
  cause: DeathCause
}

export interface GameLog {
  meta: {
    schema_version: '1.0.0'
    seed: number
    config: { role_counts?: Partial<Record<Role, number>>; [k: string]: unknown }
    timestamp: string
    title?: string
    mock?: boolean
    [k: string]: unknown
  }
  players: Player[]
  steps: Step[]
  result: {
    winner: Team
    final_round: number
    eliminations: Elimination[]
  }
}

export const ROLES: Role[] = ['werewolf', 'seer', 'witch', 'little_girl', 'villager', 'cupid']
