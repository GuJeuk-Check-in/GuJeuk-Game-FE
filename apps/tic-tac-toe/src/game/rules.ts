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

/**
 * 판 상태를 판정한다.
 *
 * TODO: 구현한다.
 *   1. LINES를 돌며 세 칸이 모두 같은 마크로 채워진 줄을 찾는다.
 *      찾으면 { winner: 그 마크, line: 그 줄, draw: false }.
 *   2. 승자가 없고 빈 칸도 없으면 { winner: null, line: null, draw: true }.
 *   3. 그 외에는 진행 중이므로 아래 기본값 그대로 돌려준다.
 *
 * 지금은 항상 "진행 중"을 돌려주므로 판이 끝나지 않는다.
 */
export function evaluate(board: Board): Outcome {
  void board
  return { winner: null, line: null, draw: false }
}

/**
 * AI가 둘 칸의 인덱스를 고른다. 둘 곳이 없으면 -1.
 *
 * TODO: 구현한다.
 *   3x3은 전체 경우의 수가 작아 가지치기 없는 미니맥스 완전 탐색으로 충분하다.
 *   깊이를 점수에 반영하면 "이길 거면 빨리, 질 거면 최대한 늦게" 두게 된다.
 *
 * 지금은 첫 번째 빈 칸을 고른다. 게임은 돌아가지만 AI는 생각하지 않는다.
 */
export function bestMove(board: Board, me: Mark): number {
  void me
  return board.findIndex((cell) => cell === null)
}
