// 미니게임 세 개가 바깥과 주고받는 것 전부. **계약은 여기 한 벌만 둔다.**
//
// 전에는 같은 모양의 MinigameHost 가 CatchGame · EchoGame · HopGame 에 각각
// export 되어 있었고, 화면(MinigameScreen)은 그중 어느 것도 import 하지 않은 채
// 타입 표기 없는 객체 리터럴을 세 생성자에 넘겼다. 그러면 한 게임이 자기 사본에
// 필드를 더하거나 콜백 모양을 바꿔도 나머지 두 사본은 그대로 남고, 구조적 타이핑
// 때문에 세 호출이 전부 계속 통과한다 — 어긋남이 컴파일에 걸리지 않는다.
//
// CONVENTIONS.md 의 계층 표가 `types.ts ← 타입 계약` 을 한 곳에 두라고 정한 것도,
// palette.ts·economy.ts 가 "유일한 출처"를 못 박아 둔 것도 같은 이유다.

import type { CanvasStage } from '@gujuck/game-core'
import type { SpriteSet } from '../sprites'

export interface MinigameHost {
  stage: CanvasStage
  sprites: SpriteSet
  /** 판이 끝났을 때 최종 점수와 함께 부른다. 한 판에 정확히 한 번만 부른다. */
  onEnd: (score: number) => void
  /** 진행 중 점수가 바뀔 때. 화면 상단 표시용. 없어도 된다. */
  onScore?: (score: number) => void
}
