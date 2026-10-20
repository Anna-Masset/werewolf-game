import type { GameEvent, PlayerId } from '../../types/log'

type Seat = { x: number; y: number }

export interface Ballot {
  voter: PlayerId
  target: PlayerId
}

/** Ballots cast in this step (main vote or runoff), in order. */
export function ballotsOf(events: GameEvent[]): Ballot[] {
  return events
    .filter((e) => e.type === 'vote' && e.actor && e.target)
    .map((e) => ({ voter: e.actor!, target: e.target! }))
}

/** Tally per target, most voted first. */
export function tallyOf(ballots: Ballot[]): { target: PlayerId; voters: PlayerId[] }[] {
  const by = new Map<PlayerId, PlayerId[]>()
  for (const b of ballots) by.set(b.target, [...(by.get(b.target) ?? []), b.voter])
  return [...by.entries()].map(([target, voters]) => ({ target, voters })).sort((a, b) => b.voters.length - a.voters.length)
}

const GAP_FROM = 62 // start just outside the voter's ring
const GAP_TO = 70 // stop before the target's ring, leaving room for the arrowhead

/**
 * Arrows from voter to target, curving toward the fire so they don't run along
 * the circle. Ballots against the leader(s) are drawn in blood red.
 */
export function VoteArrows({
  ballots, pos, leaders, pov, hovered,
}: {
  ballots: Ballot[]
  pos: Record<PlayerId, Seat>
  leaders: Set<PlayerId>
  pov: PlayerId | 'narrator'
  hovered: PlayerId | null
}) {
  return (
    <g className="votes">
      <defs>
        <marker id="arrow-lead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--blood)" />
        </marker>
        <marker id="arrow-other" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--vote-other)" />
        </marker>
      </defs>
      {ballots.map((b, i) => {
        const a = pos[b.voter], t = pos[b.target]
        if (!a || !t) return null
        // Control point: the chord's midpoint, pulled toward the center.
        const cx = (a.x + t.x) * 0.3, cy = (a.y + t.y) * 0.3
        const p0 = toward(a, { x: cx, y: cy }, GAP_FROM)
        const p1 = toward(t, { x: cx, y: cy }, GAP_TO)
        const lead = leaders.has(b.target)
        const mine = b.voter === pov
        const dim = hovered !== null && hovered !== b.voter && hovered !== b.target
        return (
          <path
            key={`${b.voter}-${i}`}
            d={`M${p0.x},${p0.y} Q${cx},${cy} ${p1.x},${p1.y}`}
            pathLength={1}
            className={`vote-arrow ${lead ? 'lead' : 'other'} ${mine ? 'mine' : ''} ${dim ? 'dim' : ''}`}
            markerEnd={`url(#arrow-${lead ? 'lead' : 'other'})`}
            style={{ animationDelay: `${i * 45}ms` }}
          />
        )
      })}
    </g>
  )
}

/** Point at `dist` from `from`, heading toward `to` (approximates the curve's tangent at the end). */
function toward(from: Seat, to: Seat, dist: number): Seat {
  const dx = to.x - from.x, dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist }
}

/** Vote count pill on the inner side of each targeted token. */
export function VoteCounts({ tally, pos, leaders, tied }: {
  tally: { target: PlayerId; voters: PlayerId[] }[]
  pos: Record<PlayerId, Seat>
  leaders: Set<PlayerId>
  tied: boolean
}) {
  return (
    <g className="vote-counts">
      {tally.map(({ target, voters }) => {
        const p = pos[target]
        const r = Math.hypot(p.x, p.y)
        const k = (r - 96) / r
        const lead = leaders.has(target)
        return (
          <g key={target} transform={`translate(${p.x * k},${p.y * k})`}>
            {/* inner group carries the CSS pop animation, which would otherwise override the translate */}
            <g className={`vote-count ${lead ? 'lead' : ''}`}>
            <rect x={-38} y={-16} width={76} height={32} rx={16} />
            <text y={1}>{voters.length} {voters.length === 1 ? 'vote' : 'votes'}</text>
            {lead && tied && <text y={30} className="tie-label">tie</text>}
            </g>
          </g>
        )
      })}
    </g>
  )
}
