import type { Mark } from '../game/types'

const BURST_PARTICLES = Array.from({ length: 8 }, (_, index) => index)
const CONFETTI_PIECES = Array.from({ length: 16 }, (_, index) => index)

export function BoardAtmosphere({ turn, victory }: { turn: Mark; victory: boolean }) {
  return (
    <div className={`ttt-atmosphere ttt-atmosphere--${turn.toLowerCase()} ${victory ? 'is-victory' : ''}`} aria-hidden="true">
      <span className="ttt-atmosphere__rays" />
      <span className="ttt-atmosphere__orb ttt-atmosphere__orb--one" />
      <span className="ttt-atmosphere__orb ttt-atmosphere__orb--two" />
    </div>
  )
}

export function CellBurst({ mark }: { mark: Mark }) {
  return (
    <span className={`ttt-impact ttt-impact--${mark.toLowerCase()}`} aria-hidden="true">
      <span className="ttt-impact__ring" />
      {BURST_PARTICLES.map((particle) => (
        <span key={particle} className="ttt-impact__particle" />
      ))}
    </span>
  )
}

export function VictoryBurst({ open }: { open: boolean }) {
  if (!open) return null

  return (
    <div className="ttt-victory-burst" aria-hidden="true">
      <span className="ttt-victory-burst__halo" />
      {CONFETTI_PIECES.map((piece) => (
        <span key={piece} className="ttt-victory-burst__piece" />
      ))}
    </div>
  )
}
