import type { Board, Cell, Mark, Outcome } from './types'

/**
 * 게임 규칙. 순수 함수만 둔다.
 *
 * ─── 이 파일이 지켜야 하는 것 ────────────────────────────────────────────
 * · React를 import 하지 않는다. 상태 관리는 useGame.ts가 맡는다.
 * · DOM을 만지지 않는다. 화면은 App.tsx가 맡는다.
 * · 부수효과를 만들지 않는다. 같은 입력이면 항상 같은 출력이어야 한다.
 *
 * 이렇게 두면 규칙만 따로 테스트할 수 있고, 나중에 서버에서 같은 판정을
 * 해야 할 때 이 파일을 그대로 옮길 수 있다.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 지금은 골격만 있다. 아래 TODO를 채우면 게임이 동작한다.
 */

export const EMPTY_BOARD: Board = Object.freeze(Array<Cell>(9).fill(null))

/** 승리 판정에 쓰는 8개 줄(가로 3, 세로 3, 대각 2). */
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export function nextMark(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X'
}

/** 판이 꽉 찼는지. 승자가 없을 때만 무승부 판정에 쓴다. */
function isFull(board: Board): boolean {
  return board.every((cell) => cell !== null)
}

/**
 * 판 상태를 판정한다.
 *
 * 승자를 먼저 보고 무승부를 나중에 본다. 순서가 바뀌면 마지막 수로 이겼는데
 * 판이 꽉 찼다는 이유로 무승부가 되어버린다.
 */
export function evaluate(board: Board): Outcome {
  for (const line of LINES) {
    const [a, b, c] = line
    const mark = board[a]
    if (mark !== null && mark === board[b] && mark === board[c]) {
      return { winner: mark, line, draw: false }
    }
  }

  return { winner: null, line: null, draw: isFull(board) }
}

/**
 * AI가 둘 칸의 인덱스를 고른다. 둘 곳이 없으면 -1.
 *
 * 3x3은 첫 수 기준 경우의 수가 9! = 362,880보다 적어 가지치기 없이 완전
 * 탐색해도 즉시 끝난다. 알파베타를 넣을 이유가 없어서 읽기 쉬운 쪽을 택했다.
 *
 * 이 AI는 지지 않는다. 틱택토는 양쪽이 최선을 두면 반드시 무승부인 게임이라,
 * 사람이 실수하지 않는 한 결과는 무승부다.
 */
export function bestMove(board: Board, me: Mark): number {
  let bestScore = -Infinity
  let move = -1

  for (let i = 0; i < board.length; i += 1) {
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

/**
 * @param turn  지금 둘 차례인 마크
 * @param me    점수를 매기는 기준이 되는 마크(= AI 자신)
 * @param depth 루트에서 몇 수 내려왔는지
 *
 * depth를 점수에 반영하는 이유: 이기는 수가 여러 개일 때 가장 빨리 이기는
 * 쪽을, 지는 게 확정이면 가장 늦게 지는 쪽을 고르게 된다. 이게 없으면 어차피
 * 같은 점수라 "지금 막을 수 있는데 안 막는" 이상한 수를 두기도 한다.
 */
function minimax(board: Cell[], turn: Mark, me: Mark, depth: number): number {
  const outcome = evaluate(board)
  if (outcome.winner === me) return 10 - depth
  if (outcome.winner !== null) return depth - 10
  if (outcome.draw) return 0

  const maximizing = turn === me
  let best = maximizing ? -Infinity : Infinity

  for (let i = 0; i < board.length; i += 1) {
    if (board[i] !== null) continue

    const next = board.slice()
    next[i] = turn

    const score = minimax(next, nextMark(turn), me, depth + 1)
    best = maximizing ? Math.max(best, score) : Math.min(best, score)
  }

  return best
}
