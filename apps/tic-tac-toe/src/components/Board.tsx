import { useEffect, useRef, useState } from 'react'
import { gameAudio } from '@gujuck/ui'
import type { Board as BoardState, Mark } from '../game/types'
import { BoardAtmosphere, CellBurst, VictoryBurst } from './BoardEffects'
import { Mark as GameMark } from './Mark'

interface Props {
  board: BoardState
  /** 이긴 줄. 하이라이트에 쓴다. */
  winningLine: readonly number[] | null
  /** 다음 수에 사라질 칸. 없으면 null. */
  vanishing: number | null
  disabled: boolean
  onPlace: (index: number) => void
  turn: Mark
  xLabel?: string
  oLabel?: string
}

/**
 * 판.
 *
 * 로컬 대전과 온라인 대전이 같은 컴포넌트를 쓴다. 두 화면은 상태를 얻는
 * 경로가 다를 뿐(직접 계산 vs 서버 수신) 그리는 것은 완전히 같아서, 따로
 * 만들면 한쪽만 고치는 일이 반드시 생긴다.
 */
interface DepartingMark {
  index: number
  mark: Mark
}

interface PlacementImpact {
  index: number
  mark: Mark
}

export function Board({
  board,
  winningLine,
  vanishing,
  disabled,
  onPlace,
  turn,
  xLabel = '플레이어 1',
  oLabel = '플레이어 2',
}: Props) {
  const previousBoard = useRef(board)
  const impactTimer = useRef<number | null>(null)
  const departingTimer = useRef<number | null>(null)
  const [departing, setDeparting] = useState<DepartingMark | null>(null)
  const [impact, setImpact] = useState<PlacementImpact | null>(null)

  useEffect(() => {
    const before = previousBoard.current
    const removedIndex = before.findIndex((cell, index) => cell !== null && board[index] === null)
    const placedIndex = board.findIndex((cell, index) => cell !== null && before[index] === null)
    if (placedIndex >= 0) {
      const mark = board[placedIndex]
      if (mark !== null) {
        setImpact({ index: placedIndex, mark })
        gameAudio.play('ttt-place')
        if (impactTimer.current !== null) window.clearTimeout(impactTimer.current)
        impactTimer.current = window.setTimeout(() => setImpact(null), 720)
      }
    }
    if (removedIndex >= 0) {
      const mark = before[removedIndex]
      if (mark !== null) {
        setDeparting({ index: removedIndex, mark })
        gameAudio.play('ttt-vanish')
        if (departingTimer.current !== null) window.clearTimeout(departingTimer.current)
        departingTimer.current = window.setTimeout(() => setDeparting(null), 620)
      }
    }

    previousBoard.current = board
  }, [board])

  useEffect(
    () => () => {
      if (impactTimer.current !== null) window.clearTimeout(impactTimer.current)
      if (departingTimer.current !== null) window.clearTimeout(departingTimer.current)
    },
    [],
  )

  const victory = winningLine !== null

  return (
    <div className={`ttt-stage ttt-stage--${turn.toLowerCase()} ${victory ? 'is-victory' : ''}`}>
      <BoardAtmosphere turn={turn} victory={victory} />
      <div className="ttt-turn-splash" key={turn} aria-hidden="true">
        <span>{turn}</span> TURN!
      </div>
      <div className="ttt-player-row" aria-label={`현재 ${turn} 차례`}>
        <PlayerChip mark="X" label={xLabel} active={turn === 'X'} />
        <div className="ttt-turn-arrow" aria-hidden="true">VS</div>
        <PlayerChip mark="O" label={oLabel} active={turn === 'O'} />
      </div>
      <div className="ttt-board" role="grid" aria-label="틱택토 판">
        {board.map((cell, index) => {
          const isWin = winningLine?.includes(index) ?? false
          const isVanishing = vanishing === index

          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              className={`ttt-cell ${isWin ? 'is-win' : ''} ${isVanishing ? 'is-vanishing' : ''}`}
              onClick={() => onPlace(index)}
              disabled={disabled || cell !== null}
              aria-label={cellLabel(index, cell, isVanishing)}
            >
              {cell ? <GameMark value={cell} /> : null}
              {impact?.index === index ? <CellBurst mark={impact.mark} /> : null}
              {departing?.index === index ? (
                <span className="ttt-departing" aria-hidden="true">
                  <GameMark value={departing.mark} />
                </span>
              ) : null}
              {isVanishing ? (
                <span className="ttt-vanish-badge" aria-hidden="true">곧</span>
              ) : null}
            </button>
          )
        })}
        <VictoryBurst open={victory} />
      </div>
    </div>
  )
}

function PlayerChip({ mark, label, active }: { mark: Mark; label: string; active: boolean }) {
  return (
    <div className={`ttt-player-chip ttt-player-chip--${mark.toLowerCase()} ${active ? 'is-active' : ''}`}>
      <GameMark value={mark} compact />
      <span>{label}</span>
      {active ? <strong>내 차례!</strong> : null}
    </div>
  )
}

function cellLabel(index: number, cell: Mark | null, vanishing: boolean): string {
  const where = `${index + 1}번 칸`
  if (cell === null) return `${where} 빈 칸`
  return vanishing ? `${where} ${cell}, 다음 수에 사라짐` : `${where} ${cell}`
}
