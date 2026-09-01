import { GameLoop } from '@gujuck/game-core'
import type { CanvasStage } from '@gujuck/game-core'
import { PALETTE_DARKEST, PALETTE_LIGHTEST } from './palette'
import { PET_SPRITE, loadSprites } from './sprites'
import type { SpriteSet } from './sprites'

/**
 * 논리 해상도. 방 배경 에셋이 정확히 이 크기로 그려져 있다.
 *
 * 화면 크기가 바뀌어도 이 값은 변하지 않는다. 좌표를 화면 크기에 맞춰 다시
 * 계산하면 리사이즈할 때마다 배치가 흔들린다 — 세계는 고정하고 그리기만 확대한다.
 */
export const LOGICAL_WIDTH = 360
export const LOGICAL_HEIGHT = 640

/**
 * 펫이 서는 바닥선(논리 y). 발바닥이 이 줄에 닿는다.
 *
 * 거실 배경의 러그는 x=180 열에서 y 384~517 이다(에셋을 픽셀 단위로 읽어 잰
 * 값이다). 러그의 아래쪽 테두리에 발을 붙이면 펫이 러그 위에 서 있는 것으로
 * 읽히고, 위쪽 소파와도 겹치지 않는다. 방 에셋을 바꾸면 이 값도 다시 잡는다.
 */
const FLOOR_BASELINE_Y = 512

/** 펫이 서는 가로 위치(논리 x). 방 한가운데다. */
const FLOOR_CENTER_X = 180

/** 펫 스프라이트를 그릴 왼쪽 위 좌표. 불투명 영역 기준으로 맞춘다(sprites.ts 참조). */
const PET_DRAW_X = FLOOR_CENTER_X - PET_SPRITE.centerX
const PET_DRAW_Y = FLOOR_BASELINE_Y - PET_SPRITE.feetY

/**
 * idle 애니메이션. sin 파로 위아래로만 움직인다.
 *
 * 진폭은 **정수 픽셀로 반올림해서** 쓴다. 소수 좌표로 그리면 도트가 흐려지는데,
 * 1px 흐려진 도트는 "왜인지 모르게 화질이 나쁜" 화면이 된다.
 *
 * 눈 깜빡임은 넣지 않는다. 표정 오버레이 에셋이 아직 없다(M5). 없는 에셋을
 * 가정한 코드를 미리 써 두면 에셋이 나올 때쯤 아무도 그 코드를 믿지 않는다.
 */
const IDLE_BOB_PX = 2
const IDLE_BOB_PERIOD_SEC = 2.6

/**
 * 레터박스 색.
 *
 * 팔레트에서 가져온다. 여기에 색을 직접 적으면 팔레트가 두 벌로 갈리고,
 * 나중에 팔레트를 바꿀 때 이 한 곳만 예전 색으로 남는다.
 */
const LETTERBOX_CSS = `#${PALETTE_DARKEST}`
const ERROR_TEXT_CSS = `#${PALETTE_LIGHTEST}`

interface Viewport {
  /** 논리 픽셀 하나가 장치 픽셀 몇 개인지. 반드시 정수다. */
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * 펫타운.
 *
 * 물리·렌더링 엔진에 의존하는 코드는 이 파일 아래에만 둔다.
 * @gujuck/game-core 로는 절대 올리지 않는다 — 그 엔진을 쓰지 않는 게임까지
 * 번들에 끌고 가게 되고, lint가 막는다.
 *
 * 이 클래스는 **규칙을 모른다.** 스탯도 세이브도 여기 없다(game/pet/* 가 갖는다).
 * M1 에서 여기가 하는 일은 방을 깔고 그 위에 펫을 세워 숨 쉬게 하는 것뿐이다.
 */
export class PetGame {
  private readonly stage: CanvasStage
  private readonly loop: GameLoop

  private sprites: SpriteSet | null = null
  private loadError: Error | null = null

  /**
   * destroy() 가 불린 뒤인지.
   *
   * 스프라이트 로딩은 비동기라 언마운트 뒤에 도착할 수 있다. StrictMode 의
   * 마운트 → 언마운트 → 재마운트에서 첫 번째 게임의 콜백이 살아 돌아와 죽은
   * 인스턴스의 상태를 채우는 것을 막는다.
   */
  private disposed = false

  /** idle 파형의 위상. 벽시계가 아니라 누적된 갱신 시간이다(탭이 숨으면 멈춘다). */
  private elapsedSec = 0

  constructor(stage: CanvasStage) {
    this.stage = stage

    this.loop = new GameLoop({
      update: (dtSec) => this.update(dtSec),
      render: () => this.render(),
    })

    // 로딩을 기다리지 않고 루프를 먼저 돌린다. 스프라이트가 도착하기 전에는
    // 배경색만 그려지고, 도착한 프레임부터 방이 나타난다.
    loadSprites().then(
      (sprites) => {
        if (!this.disposed) this.sprites = sprites
      },
      (error: unknown) => {
        if (this.disposed) return

        this.loadError = error instanceof Error ? error : new Error(String(error))
        // 조용히 빈 화면으로 두지 않는다. 화면에는 사람이 읽을 문구를, 콘솔에는
        // 어느 파일이 실패했는지를 남긴다.
        console.error(this.loadError)
      },
    )

    this.loop.start()
  }

  /** 생성한 루프·리스너는 반드시 여기서 전부 정리한다. */
  destroy(): void {
    // 늦게 도착하는 로딩 콜백보다 먼저 세운다. 순서가 바뀌면 정리된 게임이
    // 다시 상태를 갖는다.
    this.disposed = true
    this.loop.destroy()
  }

  private update(dtSec: number): void {
    this.elapsedSec += dtSec
  }

  /**
   * 화면 확대 배율과 레터박스 여백.
   *
   * **CSS 픽셀이 아니라 장치 픽셀을 기준으로 정수배를 잡는다.** CanvasStage 는
   * ctx 에 setTransform(dpr) 을 걸어 두므로 보통은 CSS 픽셀만 쓰면 되지만,
   * dpr 이 1.25 · 1.5 인 기기(윈도우 배율 조정)에서는 CSS 픽셀의 정수 좌표가
   * 장치 픽셀의 정수 좌표가 아니다. 그러면 도트 격자가 장치 픽셀에 어긋나
   * 어떤 줄은 두 배로, 어떤 줄은 한 배로 그려진다. 장치 픽셀로 배율을 잡으면
   * 그런 일이 없고, 덤으로 dpr 2 기기에서는 0.5 CSS 픽셀 단위의 더 촘촘한
   * 배율 단계를 쓸 수 있다.
   */
  private viewport(): Viewport {
    const { canvas } = this.stage
    const raw = Math.min(canvas.width / LOGICAL_WIDTH, canvas.height / LOGICAL_HEIGHT)

    // 화면이 논리 해상도보다 작으면 배율이 0 이 되어 아무것도 안 보인다.
    // 1.5배 같은 소수 배율은 도트를 뭉개므로, 그 경우에는 ×1 로 그리고 넘치는
    // 만큼 잘리게 둔다. 뭉갠 화면보다 잘린 화면이 낫다.
    const scale = Math.max(1, Math.floor(raw))

    return {
      scale,
      offsetX: Math.floor((canvas.width - LOGICAL_WIDTH * scale) / 2),
      offsetY: Math.floor((canvas.height - LOGICAL_HEIGHT * scale) / 2),
    }
  }

  private render(): void {
    const { ctx, canvas } = this.stage
    const { scale, offsetX, offsetY } = this.viewport()

    // 캔버스 백버퍼 크기가 바뀌면 컨텍스트 상태가 통째로 초기화된다. 리사이즈
    // 시점을 따로 잡지 않고 매 프레임 다시 거는 편이 빠뜨릴 곳이 없다.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false

    ctx.fillStyle = LETTERBOX_CSS
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 배율과 여백이 모두 정수(장치 픽셀)이므로, 논리 좌표의 정수는 장치 픽셀의
    // 정수로 그대로 떨어진다. 여기서부터는 360×640 좌표로만 생각하면 된다.
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY)

    if (this.loadError !== null) {
      this.renderLoadError(ctx)
      return
    }

    const sprites = this.sprites
    if (sprites === null) return

    // 자연 크기로 그린다. 폭·높이를 지정해 늘리면 에셋이 360×640 이 아닐 때
    // 소수 배율로 늘어나 도트가 뭉개진다. 어긋나면 잘리는 편이 눈에 띈다.
    ctx.drawImage(sprites.roomLiving, 0, 0)

    const phase = (this.elapsedSec / IDLE_BOB_PERIOD_SEC) * Math.PI * 2
    const bob = Math.round(Math.sin(phase) * IDLE_BOB_PX)
    ctx.drawImage(sprites.pet, PET_DRAW_X, PET_DRAW_Y + bob)
  }

  /**
   * 에셋을 못 불러왔을 때.
   *
   * 도트가 아니라 시스템 폰트로 그린다. 이 화면은 사용자가 아니라 개발자를
   * 향한 것이고, 읽히는 것이 예쁜 것보다 중요하다.
   */
  private renderLoadError(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = ERROR_TEXT_CSS
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('그림을 불러오지 못했어요', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 12)

    ctx.font = '11px sans-serif'
    ctx.fillText(
      '콘솔에 어느 파일이 실패했는지 남겼습니다',
      LOGICAL_WIDTH / 2,
      LOGICAL_HEIGHT / 2 + 12,
    )
  }
}
