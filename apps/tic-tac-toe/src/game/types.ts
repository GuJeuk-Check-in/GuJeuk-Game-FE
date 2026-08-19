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

/** 대전 방식. 게임마다 모드가 다르면 이 자리에 정의한다. */
export type Mode = 'solo' | 'duo'

/** 판정 결과. 화면은 이 값만 보고 무엇을 보여줄지 정한다. */
export interface Outcome {
  winner: Mark | null
  /** 이긴 줄의 인덱스. 하이라이트에 쓴다. 승자가 없으면 null. */
  line: readonly number[] | null
  draw: boolean
}
