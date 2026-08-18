/**
 * React 전용 공통 UI.
 *
 * 이 패키지는 React에 묶여 있으므로, 렌더링 엔진과 무관해야 하는 로직은
 * 절대 여기 두지 않는다(그건 @gujuck/game-core 몫이다).
 */
export { GameShell } from './GameShell'
export type { GameShellProps } from './GameShell'

export { GameCanvas } from './GameCanvas'
export type { GameCanvasProps } from './GameCanvas'

export { ResultOverlay } from './ResultOverlay'
export type { ResultOverlayProps } from './ResultOverlay'
