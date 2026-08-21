import type { Board as BoardState, Mark } from '../game/types'

interface Props {
  board: BoardState
  /** 이긴 줄. 하이라이트에 쓴다. */
  winningLine: readonly number[] | null
  /** 다음 수에 사라질 칸. 없으면 null. */
  vanishing: number | null
  disabled: boolean
  onPlace: (index: number) => void
}

/**
 * 판.
 *
 * 로컬 대전과 온라인 대전이 같은 컴포넌트를 쓴다. 두 화면은 상태를 얻는
 * 경로가 다를 뿐(직접 계산 vs 서버 수신) 그리는 것은 완전히 같아서, 따로
 * 만들면 한쪽만 고치는 일이 반드시 생긴다.
 */
export function Board({ board, winningLine, vanishing, disabled, onPlace }: Props) {
  return (
    <div className="ttt-stage">
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
              {cell}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function cellLabel(index: number, cell: Mark | null, vanishing: boolean): string {
  const where = `${index + 1}번 칸`
  if (cell === null) return `${where} 빈 칸`
  return vanishing ? `${where} ${cell}, 다음 수에 사라짐` : `${where} ${cell}`
}
