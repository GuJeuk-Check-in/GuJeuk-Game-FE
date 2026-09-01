import { GameLoop, PointerInput } from '@gujuck/game-core'
import type { CanvasStage } from '@gujuck/game-core'

/**
 * 펫타운.
 *
 * 물리·렌더링 엔진에 의존하는 코드는 이 파일 아래에만 둔다.
 * @gujuck/game-core 로는 절대 올리지 않는다 — 그 엔진을 쓰지 않는 게임까지
 * 번들에 끌고 가게 되고, lint가 막는다.
 */
export class PetGame {
  private readonly stage: CanvasStage
  private readonly loop: GameLoop
  private readonly input: PointerInput

  constructor(stage: CanvasStage) {
    this.stage = stage

    this.input = new PointerInput({
      target: stage.canvas,
      onDown: () => {},
    })

    this.loop = new GameLoop({
      update: () => this.update(),
      render: () => this.render(),
    })
    this.loop.start()
  }

  /** 생성한 루프·리스너는 반드시 여기서 전부 정리한다. */
  destroy(): void {
    this.loop.destroy()
    this.input.destroy()
  }

  private update(): void {
    // 고정 타임스텝으로 호출된다. 물리·로직은 여기에.
  }

  private render(): void {
    this.stage.fill('#0f1420')
  }
}
