import { useState } from 'react'
import type { GameLog, PlayerId, Role } from '../../types/log'
import type { Pov, PovStep } from '../../lib/pov'
import { Fire } from './Fire'
import { Token } from './Token'
import { VoteArrows, VoteCounts, ballotsOf, tallyOf } from './VoteArrows'
import './village.css'

export interface VillageProps {
  log: GameLog
  pov: Pov
  frame: PovStep
  focus: Role
  showTruth: boolean
  night: boolean
  onPick?: (id: PlayerId) => void
}

/** Seats on an ellipse (wider than tall, to fit laptop screens), starting at the top, clockwise. */
export function seatPositions(n: number) {
  const [rx, ry] = n > 10 ? [370, 300] : [310, 265]
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
    return { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry, angle }
  })
}

/** Small icons pinned to tokens for what happened in the current step. */
function marksFor(frame: PovStep): Record<PlayerId, string[]> {
  const m: Record<PlayerId, string[]> = {}
  const add = (id: PlayerId | null | undefined, icon: string) => {
    if (!id) return
    ;(m[id] ??= []).includes(icon) || m[id].push(icon)
  }
  for (const e of frame.events) {
    switch (e.type) {
      case 'wolf_target': add(e.target, '🐾'); break
      case 'inspect': add(e.target, '🔮'); break
      case 'potion': add(e.target, e.payload.kind === 'heal' ? '💚' : '☠️'); break
      case 'spy': add(e.actor, '👀'); if (e.payload.glimpsed) add(e.payload.glimpsed, '🐺'); break
      case 'statement':
        if (e.payload.kind === 'accuse') add(e.target, '☝️')
        if (e.payload.kind === 'defend') add(e.target, '🛡️')
        if (e.payload.kind === 'claim_role') add(e.actor, '📣')
        break
      case 'impression': add(e.target, e.payload.verdict === 'suspicious' ? '🤨' : '🙂'); break
    }
  }
  for (const id of Object.keys(m)) m[id] = m[id].slice(0, 3)
  return m
}

export function Village({ log, pov, frame, focus, showTruth, night, onPick }: VillageProps) {
  const seats = seatPositions(log.players.length)
  const pos = Object.fromEntries(log.players.map((p, i) => [p.id, seats[i]]))
  const marks = marksFor(frame)
  if (pov !== 'narrator' && frame.step.decisions.some((d) => d.player === pov)) (marks[pov] ??= []).unshift('🧠')
  const narrator = pov === 'narrator'
  const talks = frame.events.filter((e) => e.type === 'conversation' && e.actor && e.target)
  const [hovered, setHovered] = useState<PlayerId | null>(null)
  const ballots = ballotsOf(frame.events)
  const tally = tallyOf(ballots)
  const top = tally[0]?.voters.length ?? 0
  const leaders = new Set(tally.filter((x) => x.voters.length === top).map((x) => x.target))
  const tied = leaders.size > 1
  const rx = Math.max(...seats.map((s) => s.x)), ry = -seats[0].y

  return (
    <svg className="village" viewBox="-650 -430 1300 860" role="group" aria-label="Village square">
      <defs>
        <radialGradient id="fireGlow">
          <stop offset="0%" stopColor="#ffb347" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#ff7a1a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ground">
          <stop offset="0%" stopColor="var(--ground)" stopOpacity="1" />
          <stop offset="85%" stopColor="var(--ground)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--ground)" stopOpacity="0" />
        </radialGradient>
        <pattern id="cobbles" width="38" height="30" patternUnits="userSpaceOnUse">
          <path d="M2,8 q8,-7 16,0 q-2,8 -8,9 q-7,-1 -8,-9 Z M20,22 q8,-7 16,0 q-2,8 -8,8 q-7,0 -8,-8 Z" className="cobble" />
        </pattern>
      </defs>

      {/* the square */}
      <ellipse rx={rx + 130} ry={ry + 120} fill="url(#ground)" />
      <ellipse rx={rx - 80} ry={ry - 80} fill="url(#cobbles)" className="cobbles" />
      <ellipse rx={rx} ry={ry} className="path-ring" />

      <Fire night={night} />

      {talks.map((e, i) => {
        const a = pos[e.actor!], b = pos[e.target!]
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="talk-line" />
      })}

      <VoteArrows ballots={ballots} pos={pos} leaders={leaders} pov={pov} hovered={hovered} />

      {log.players.map((p) => {
        const isPov = p.id === pov
        const dist = frame.beliefs?.[p.id]
        const dead = frame.dead.has(p.id)
        return (
          <Token
            key={p.id}
            player={p}
            {...pos[p.id]}
            scale={log.players.length > 10 ? 1.12 : 1.25}
            isPov={isPov}
            dead={dead}
            knownRole={frame.known[p.id]}
            truthRole={narrator || showTruth || isPov ? p.role : undefined}
            focus={focus}
            pFocus={narrator || isPov || !dist ? null : dist[focus] ?? 0}
            pVillage={isPov && !narrator ? null : frame.consensus[p.id]}
            dist={dist}
            marks={marks[p.id] ?? []}
            dimmed={frame.ghost && !isPov}
            onClick={onPick ? () => onPick(p.id) : undefined}
            onHover={(on) => setHovered(on ? p.id : null)}
          />
        )
      })}

      <VoteCounts tally={tally} pos={pos} leaders={leaders} tied={tied} />
    </svg>
  )
}
