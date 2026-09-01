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
import type { Stage } from '../types'

export interface MinigameHost {
  stage: CanvasStage
  sprites: SpriteSet
  /**
   * 지금 펫의 성장 단계. 세 게임 모두 이 단계의 스프라이트로 펫을 그린다.
   *
   * **거실에서는 어른인데 미니게임에서는 아기면 같은 펫으로 보이지 않는다.**
   * 레벨을 넘기지 않고 이미 정해진 단계를 넘기는 것은, 레벨 → 단계 판정이
   * economy.ts 의 stageForLevel 한 곳에만 있어야 하기 때문이다(명세 §6).
   *
   * 이름이 petStage 인 것은 위의 stage 가 캔버스라서다. 한 객체에 stage 가 둘이면
   * 부르는 쪽에서 어느 쪽인지 매번 확인하게 된다.
   */
  petStage: Stage
  /**
   * 기분이 0 인가(§4). **얼굴을 방과 맞추기 위한 값이다.**
   *
   * 이것이 없으면 세 게임은 "게임 안에서 무슨 일이 났는가"만 보고 얼굴을 고르게
   * 되고, 기분 0 인 펫이 거실에서는 시무룩한데 놀이터에 들어가는 순간 멀쩡한
   * 얼굴로 바뀐다 — 기분은 그대로인데 얼굴만 바뀌는 것이라 무엇이 달라졌는지
   * 읽히지 않는다. 판단의 우선순위는 face.ts 가 적어 둔 그대로 쓴다.
   *
   * petStage 와 같은 이유로 판이 시작할 때의 값으로 고정한다 — 한 판이 1분이라
   * 그 사이에 얼굴이 바뀌면 무엇 때문에 바뀌었는지가 게임 화면에서는 안 보인다.
   */
  moodZero: boolean
  /** 판이 끝났을 때 최종 점수와 함께 부른다. 한 판에 정확히 한 번만 부른다. */
  onEnd: (score: number) => void
  /** 진행 중 점수가 바뀔 때. 화면 상단 표시용. 없어도 된다. */
  onScore?: (score: number) => void
}
