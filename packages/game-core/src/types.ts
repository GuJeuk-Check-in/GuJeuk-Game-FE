/** 캔버스의 논리 크기. width/height는 CSS 픽셀, dpr은 물리 픽셀 배율. */
export interface StageSize {
  width: number
  height: number
  dpr: number
}

/** 게임 한 판이 끝났을 때 셸(React)로 넘기는 결과. 게임마다 meta로 확장한다. */
export interface GameResult {
  score: number
  durationMs: number
  meta?: Record<string, unknown>
}

/** 스테이지 좌표계(CSS 픽셀) 기준 포인터 위치. */
export interface PointerPoint {
  x: number
  y: number
}
