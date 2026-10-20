import type { Player, Role, RoleDist } from '../../types/log'
import { PERSONALITY_ICON, PERSONALITY_LABEL, ROLE_COLOR, ROLE_ICON, ROLE_LABEL } from '../../lib/roles'

export interface TokenProps {
  player: Player
  x: number
  y: number
  /** Seat angle (radians); labels are placed radially outside the circle. */
  angle: number
  isPov: boolean
  dead: boolean
  /** Role shown on the card ("?" if undefined). */
  knownRole?: Role
  /** True role overlay (show truth / narrator). */
  truthRole?: Role
  /** POV's probability for the focus role (inner ring); null = no ring. */
  pFocus: number | null
  focus: Role
  /** Village consensus P(werewolf) (outer ring). */
  pVillage: number | null
  /** Full distribution, for the tooltip. */
  dist?: RoleDist
  marks: string[]
  dimmed?: boolean
  onClick?: () => void
  scale?: number
}

const R_INNER = 45
const R_OUTER = 54
const C_INNER = 2 * Math.PI * R_INNER
const C_OUTER = 2 * Math.PI * R_OUTER

/** Name + numbers sit outside the ring, on the side facing away from the fire. */
function labelPlacement(angle: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const c = Math.cos(angle), s = Math.sin(angle)
  if (s < -0.985) return { x: 0, y: -92, anchor: 'middle' } // top
  if (s > 0.985) return { x: 0, y: 80, anchor: 'middle' } // bottom
  const anchor = c > 0 ? 'start' : 'end'
  const x = (c > 0 ? 1 : -1) * 64
  // Lean the block up or down with the seat so it clears the neighbours.
  return { x, y: s < 0 ? -18 + s * 22 : 4 + s * 26, anchor }
}

export const pct = (p: number) => `${Math.round(p * 100)}%`

export function Token(props: TokenProps) {
  const { player, x, y, isPov, dead, knownRole, truthRole, pFocus, focus, pVillage, dist, marks } = props
  const shownRole = knownRole ?? truthRole
  const tip = [
    `${player.name} (${PERSONALITY_LABEL[player.personality]})`,
    knownRole ? `Known role: ${ROLE_LABEL[knownRole]}` : truthRole ? `True role: ${ROLE_LABEL[truthRole]}` : 'Role unknown',
    dead ? 'Dead' : 'Alive',
    pVillage != null ? `Village P(werewolf): ${pct(pVillage)}` : null,
    dist ? 'Your beliefs: ' + Object.entries(dist).filter(([, v]) => (v ?? 0) > 0.005)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([r, v]) => `${ROLE_LABEL[r as Role]} ${pct(v ?? 0)}`).join(', ') : null,
  ].filter(Boolean).join('\n')

  const label = labelPlacement(props.angle)

  return (
    <g
      className={`token ${dead ? 'dead' : ''} ${isPov ? 'pov' : ''} ${props.dimmed ? 'dimmed' : ''}`}
      transform={`translate(${x},${y}) scale(${props.scale ?? 1})`}
      onClick={props.onClick}
      role="img"
      aria-label={tip.replace(/\n/g, '. ')}
    >
      <title>{tip}</title>
      {isPov && <circle r={64} className="pov-halo" />}

      {/* outer ring: village consensus P(werewolf) */}
      {pVillage != null && (
        <>
          <circle r={R_OUTER} className="ring-track thin" />
          <circle
            r={R_OUTER}
            className="ring-arc thin"
            stroke="var(--consensus)"
            strokeDasharray={`${pVillage * C_OUTER} ${C_OUTER}`}
            transform="rotate(-90)"
          />
        </>
      )}
      {/* inner ring: POV's belief for the focus role */}
      {pFocus != null && (
        <>
          <circle r={R_INNER} className="ring-track" />
          <circle
            r={R_INNER}
            className="ring-arc"
            stroke={ROLE_COLOR[focus]}
            strokeDasharray={`${pFocus * C_INNER} ${C_INNER}`}
            transform="rotate(-90)"
          />
        </>
      )}

      <circle r={37} className="token-disc" />
      {dead ? (
        <g className="card">
          <rect x={-21} y={-28} width={42} height={56} rx={6} className="card-face" />
          <text className="card-icon" y={4}>{shownRole ? ROLE_ICON[shownRole] : '?'}</text>
          <text className="card-label" y={22}>{shownRole ? ROLE_LABEL[shownRole] : '?'}</text>
        </g>
      ) : shownRole ? (
        <text className={`role-icon ${!knownRole ? 'truth' : ''}`} y={2}>{ROLE_ICON[shownRole]}</text>
      ) : (
        <text className="role-unknown" y={2}>?</text>
      )}
      {truthRole && !knownRole && !dead && <circle r={37} className="truth-edge" />}

      <g transform="translate(-32,-32)" className="persona">
        <circle r={13} />
        <text y={1}>{PERSONALITY_ICON[player.personality]}</text>
      </g>
      {dead && <text className="skull" x={30} y={-28}>✝</text>}

      {marks.length > 0 && (
        <g className="marks" transform="translate(34,-34)">
          {marks.map((m, i) => (
            <g key={i} transform={`translate(${i * 22},0)`} className="mark">
              <circle r={12} />
              <text y={1}>{m}</text>
            </g>
          ))}
        </g>
      )}

      <text className="token-name" x={label.x} y={label.y} textAnchor={label.anchor}>{player.name}{isPov ? ' (you)' : ''}</text>
      {!dead && <text className="token-nums num" x={label.x} y={label.y + 19} textAnchor={label.anchor}>
        {pFocus != null && (
          <tspan className="n-pov" fill={ROLE_COLOR[focus]}>{ROLE_ICON[focus]} {pct(pFocus)}</tspan>
        )}
        {pFocus != null && pVillage != null && <tspan className="n-sep"> · </tspan>}
        {pVillage != null && <tspan className="n-village">village {pct(pVillage)}</tspan>}
      </text>}
    </g>
  )
}
