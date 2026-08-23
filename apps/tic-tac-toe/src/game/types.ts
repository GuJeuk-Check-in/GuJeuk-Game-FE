/**
 * 게임의 타입 계약.
 *
 * 규칙(rules.ts)과 화면(App.tsx)이 공유하는 어휘를 여기 모은다.
 * 이 파일에는 React도 브라우저 API도 등장하지 않는다 — 타입만 있다.
 */

export type Mark = 'X' | 'O'

export type Cell = Mark | null

/** 길이 9의 판. 인덱스는 왼쪽 위부터 오른쪽 아래로 0~8. */
export type Board = readonly Cell[]

/** 대전 방식. */
export type Mode = 'solo' | 'duo'

/**
 * 각자 놓은 칸을 놓은 순서대로 담는다. 배열 맨 앞이 가장 오래된 수다.
 *
 * 이 게임은 판에 올릴 수 있는 개수가 정해져 있어서, 넘치면 가장 오래된 수를
 * 걷어낸다. 그래서 "어디에 뒀는가"만으로는 부족하고 "언제 뒀는가"가 필요하다.
 */
export type History = Readonly<Record<Mark, readonly number[]>>

/** 한 판의 상태 전부. 이 값만 있으면 화면을 그릴 수 있다. */
export interface GameState {
  board: Board
  history: History
  turn: Mark
}

/**
 * 판정 결과.
 *
 * 무승부가 없다. 판이 꽉 차지 않으므로(각자 최대 3개, 합쳐도 6개) 누군가
 * 세 칸을 이을 때까지 계속된다.
 */
export interface Outcome {
  winner: Mark | null
  /** 이긴 줄의 인덱스. 하이라이트에 쓴다. 승자가 없으면 null. */
  line: readonly number[] | null
}
