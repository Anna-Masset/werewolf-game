/** The village fire: original SVG, flames flicker via CSS. Burns higher at night. */
export function Fire({ night }: { night: boolean }) {
  return (
    <g className={`fire ${night ? 'night' : 'day'}`}>
      <circle r={night ? 230 : 160} fill="url(#fireGlow)" className="fire-glow" />
      {/* stones */}
      {Array.from({ length: 11 }, (_, i) => {
        const a = (i / 11) * Math.PI * 2
        return <ellipse key={i} cx={Math.cos(a) * 46} cy={Math.sin(a) * 30 + 22} rx={13} ry={9} className="fire-stone" />
      })}
      {/* logs */}
      <rect x={-42} y={10} width={84} height={13} rx={6} transform="rotate(-14)" className="fire-log" />
      <rect x={-42} y={10} width={84} height={13} rx={6} transform="rotate(16)" className="fire-log" />
      <g className="flames">
        <path className="flame f1" d="M0,18 C-30,-6 -18,-40 0,-78 C18,-40 30,-6 0,18 Z" />
        <path className="flame f2" d="M-14,18 C-34,0 -26,-24 -14,-48 C-2,-24 6,0 -14,18 Z" />
        <path className="flame f3" d="M14,18 C-2,0 4,-26 16,-54 C30,-26 34,0 14,18 Z" />
        <path className="flame core" d="M0,18 C-14,4 -8,-16 0,-36 C8,-16 14,4 0,18 Z" />
      </g>
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} className={`ember e${i}`} cx={(i - 2) * 9} cy={-30} r={2} />
      ))}
    </g>
  )
}
