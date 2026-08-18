export type Mark = 'X' | 'O'
export type Cell = Mark | null
export type Board = readonly Cell[]

export const EMPTY_BOARD: Board = Object.freeze(Array<Cell>(9).fill(null))

const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export interface Outcome {
  winner: Mark | null
  /** 이긴 줄의 인덱스. 승자가 없으면 null. 하이라이트에 쓴다. */
  line: readonly number[] | null
  draw: boolean
}

/**
 * 판 상태를 판정한다.
 *
 * 렌더링과 완전히 분리된 순수 함수다. 틱택토는 React로 만들지만 규칙은
 * React를 몰라야 한다 — 알까기·양궁이 물리를 캔버스와 분리하는 것과 같은 이유로,
 * 규칙만 따로 두면 그대로 테스트하거나 서버 검증에 재사용할 수 있다.
 */
export function evaluate(board: Board): Outcome {
  for (const line of LINES) {
    const [a, b, c] = line
    const mark = board[a]
    if (mark !== null && mark === board[b] && mark === board[c]) {
      return { winner: mark, line, draw: false }
    }
  }

  const full = board.every((cell) => cell !== null)
  return { winner: null, line: null, draw: full }
}

export function nextMark(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X'
}

/**
 * 미니맥스로 최선의 수를 찾는다.
 *
 * 3x3은 전체 경우의 수가 9! 미만이라 가지치기 없이 완전 탐색해도 즉시 끝난다.
 * depth를 점수에 반영해 "이길 거면 빨리, 질 거면 최대한 늦게" 두게 만든다.
 * 이 AI는 지지 않으므로 사람은 잘해야 무승부다.
 */
export function bestMove(board: Board, me: Mark): number {
  let bestScore = -Infinity
  let move = -1

  for (let i = 0; i < 9; i += 1) {
    if (board[i] !== null) continue
    const next = board.slice()
    next[i] = me
    const score = minimax(next, nextMark(me), me, 1)
    if (score > bestScore) {
      bestScore = score
      move = i
    }
  }

  return move
}

function minimax(board: Cell[], turn: Mark, me: Mark, depth: number): number {
  const outcome = evaluate(board)
  if (outcome.winner === me) return 10 - depth
  if (outcome.winner !== null) return depth - 10
  if (outcome.draw) return 0

  const maximizing = turn === me
  let best = maximizing ? -Infinity : Infinity

  for (let i = 0; i < 9; i += 1) {
    if (board[i] !== null) continue
    const next = board.slice()
    next[i] = turn
    const score = minimax(next, nextMark(turn), me, depth + 1)
    best = maximizing ? Math.max(best, score) : Math.min(best, score)
  }

  return best
}
