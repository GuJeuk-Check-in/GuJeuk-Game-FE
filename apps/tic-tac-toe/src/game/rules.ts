import type { Board, Cell, GameState, History, Mark, Outcome } from './types'

/**
 * 게임 규칙. 순수 함수만 둔다.
 *
 * ─── 이 파일이 지켜야 하는 것 ────────────────────────────────────────────
 * · React를 import 하지 않는다. 상태 관리는 useGame.ts가 맡는다.
 * · DOM을 만지지 않는다. 화면은 App.tsx가 맡는다.
 * · 부수효과를 만들지 않는다. 같은 입력이면 항상 같은 출력이어야 한다.
 *
 * 이렇게 두면 규칙만 따로 테스트할 수 있고, 서버가 같은 판정을 해야 할 때
 * (온라인 대전에서 클라를 믿을 수 없으므로 반드시 필요하다) 그대로 옮길 수 있다.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─── 이 게임의 규칙 ──────────────────────────────────────────────────────
 * 한쪽이 판에 올릴 수 있는 말은 MARKS_PER_PLAYER개까지다. 그 상태에서 또
 * 놓으면 자기 말 중 가장 오래된 것이 사라진다. 그래서 판이 꽉 차지 않고
 * 무승부도 없다 — 누군가 세 칸을 이을 때까지 계속된다.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * 한쪽이 판에 동시에 올릴 수 있는 말의 수.
 *
 * 3인 이유는 이기려면 세 칸을 이어야 하기 때문이다. 이 값이 3이면 "이기려면
 * 지금 놓인 말을 전부 써야 하는" 팽팽한 상태가 되고, 새 말을 놓는 순간 가장
 * 오래된 말이 빠지므로 다 이어놓고도 스스로 무너뜨리는 상황이 생긴다.
 * 4 이상으로 올리면 여유가 생겨 긴장이 크게 떨어진다.
 */
export const MARKS_PER_PLAYER = 3

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

const EMPTY_BOARD: Board = Object.freeze(Array<Cell>(9).fill(null))

export function createInitialState(): GameState {
  return {
    board: EMPTY_BOARD,
    history: { X: [], O: [] },
    turn: 'X',
  }
}

export function nextMark(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X'
}

/**
 * 판 상태를 판정한다.
 *
 * 무승부 검사가 없다. 이 게임은 판이 꽉 차지 않으므로 "둘 곳이 없어서 끝"이
 * 성립하지 않는다.
 */
export function evaluate(board: Board): Outcome {
  for (const line of LINES) {
    const [a, b, c] = line
    const mark = board[a]
    if (mark !== null && mark === board[b] && mark === board[c]) {
      return { winner: mark, line }
    }
  }

  return { winner: null, line: null }
}

/** 지금 둘 수 있는 칸. 빈 칸이 곧 둘 수 있는 칸이다. */
export function legalMoves(board: Board): number[] {
  const moves: number[] = []
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === null) moves.push(i)
  }
  return moves
}

/**
 * mark가 지금 한 수를 두면 사라질 칸. 아직 한도에 안 찼으면 null.
 *
 * 화면에서 이 칸을 흐리게 보여주기 위한 값이다. 예고 없이 말이 사라지면
 * 규칙을 모르는 사람은 버그로 받아들인다.
 */
export function vanishingCell(history: History, mark: Mark): number | null {
  const placed = history[mark]
  return placed.length >= MARKS_PER_PLAYER ? placed[0] : null
}

/**
 * 한 수를 둔 뒤의 상태를 돌려준다. 둘 수 없는 칸이면 받은 상태를 그대로 준다.
 *
 * 순서가 중요하다. **놓고 나서 걷어낸다.**
 * 넘치는 말을 먼저 걷어내면 방금 놓은 수가 이미 빠진 자리와 줄을 이룰 수 있어
 * 규칙이 헐거워진다. 놓은 뒤에 걷어내야 "다 이어놨는데 내 가장 오래된 말이
 * 그 줄에 있어서 스스로 무너뜨린다"는 이 게임의 핵심 긴장이 살아난다.
 */
export function applyMove(state: GameState, index: number): GameState {
  if (state.board[index] !== null) return state

  const mark = state.turn
  const board = state.board.slice()
  board[index] = mark

  const placed = [...state.history[mark], index]
  if (placed.length > MARKS_PER_PLAYER) {
    const oldest = placed.shift() as number
    board[oldest] = null
  }

  return {
    board,
    history: { ...state.history, [mark]: placed },
    turn: nextMark(mark),
  }
}

/**
 * 탐색 깊이 상한.
 *
 * 이 게임은 끝나지 않을 수 있어서(무승부가 없고 말이 계속 돈다) 완전 탐색이
 * 불가능하다. 표준 틱택토라면 9!보다 적은 경우의 수를 전부 볼 수 있지만
 * 여기서는 같은 판이 다시 나타나므로 깊이로 끊어야 한다.
 *
 * 6이면 서로 세 수씩 앞을 본다. 실측으로 한 수당 수 ms 수준이라 사람이
 * 기다림을 느끼지 않고, 이 정도만 봐도 눈앞의 승리와 상대의 승리를 놓치지 않는다.
 */
const MAX_DEPTH = 6

/**
 * AI가 둘 칸의 인덱스를 고른다. 둘 곳이 없으면 -1.
 *
 * 깊이 제한 미니맥스다. 깊이를 점수에 반영해 이길 거면 빨리, 질 거면 최대한
 * 늦게 두게 한다. 이게 없으면 같은 점수라 지금 막을 수 있는데 안 막는 수를 둔다.
 */
export function bestMove(state: GameState, me: Mark): number {
  let bestScore = -Infinity
  let move = -1

  for (const index of legalMoves(state.board)) {
    const score = search(applyMove(state, index), me, 1)
    if (score > bestScore) {
      bestScore = score
      move = index
    }
  }

  return move
}

function search(state: GameState, me: Mark, depth: number): number {
  const { winner } = evaluate(state.board)
  if (winner === me) return 10 - depth
  if (winner !== null) return depth - 10

  // 깊이 상한에 닿으면 판단을 유보한다. 이 게임은 무승부가 없으므로 0은
  // "무승부"가 아니라 "여기까지 봐서는 모르겠다"는 뜻이다.
  if (depth >= MAX_DEPTH) return 0

  const maximizing = state.turn === me
  let best = maximizing ? -Infinity : Infinity

  for (const index of legalMoves(state.board)) {
    const score = search(applyMove(state, index), me, depth + 1)
    best = maximizing ? Math.max(best, score) : Math.min(best, score)
  }

  return best
}
