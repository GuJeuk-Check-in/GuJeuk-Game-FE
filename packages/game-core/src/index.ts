/**
 * 엔진 중립 게임 코어.
 *
 * 이 패키지에는 React도, matter.js도, 특정 렌더러도 들어오면 안 된다.
 * 여기에 의존성이 새어들어가는 순간 그 의존성은 모든 게임 앱에 전파된다.
 * 프레임워크에 묶인 코드는 @gujuck/ui(React)로, 물리 엔진에 묶인 코드는
 * 각 게임 앱 안으로 보낸다.
 */
export { GameLoop } from './loop'
export type { GameLoopOptions } from './loop'

export { CanvasStage } from './stage'
export type { CanvasStageOptions } from './stage'

export { PointerInput } from './input'
export type { PointerInputOptions } from './input'

export { clamp, lerp, distance, normalizeAngle } from './math'

export type { StageSize, GameResult, PointerPoint } from './types'
