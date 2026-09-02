// 미니게임 세 개가 공유하는 그리기 바닥.
//
// 세 게임이 각자 정수배 스케일과 레터박스를 다시 짜면 같은 코드가 세 벌로 갈리고,
// 한 곳만 고쳤을 때 그 게임만 도트가 어긋난다. 배율 계산은 여기 한 번만 둔다.
//
// PetGame 과 규칙이 같다: **장치 픽셀 기준 정수 배율**만 쓴다. dpr 이 1.25·1.5 인
// 기기에서는 CSS 픽셀의 정수가 장치 픽셀의 정수가 아니라 도트 격자가 어긋난다.

import type { CanvasStage } from '@gujuck/game-core'

/** 미니게임도 방과 같은 논리 해상도를 쓴다. 같은 화면 안에서 크기가 튀지 않게. */
export const GAME_WIDTH = 360
export const GAME_HEIGHT = 640

export class PixelStage {
  private readonly stage: CanvasStage
  private scale = 1
  private originX = 0
  private originY = 0

  constructor(stage: CanvasStage) {
    this.stage = stage
  }

  get ctx(): CanvasRenderingContext2D {
    return this.stage.ctx
  }

  /**
   * 한 프레임을 시작한다. 배율을 다시 재고 화면을 배경색으로 채운다.
   *
   * 매 프레임 다시 재는 이유는 화면 회전·창 크기 변경이 언제 올지 모르기
   * 때문이다. 계산이 몇 번의 나눗셈이라 아낄 이유가 없다.
   */
  begin(background: string): void {
    const canvas = this.stage.canvas
    const ctx = this.stage.ctx

    // CanvasStage 가 걸어 둔 dpr 변환을 쓰지 않고 직접 잡는다(위 주석의 이유).
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false

    const fit = Math.min(canvas.width / GAME_WIDTH, canvas.height / GAME_HEIGHT)
    // 배율 0 이면 아무것도 안 보인다. 화면이 논리 크기보다 작으면 1 로 그리고 자른다.
    this.scale = Math.max(1, Math.floor(fit))
    this.originX = Math.round((canvas.width - GAME_WIDTH * this.scale) / 2)
    this.originY = Math.round((canvas.height - GAME_HEIGHT * this.scale) / 2)

    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  /** 논리 좌표의 사각형을 채운다. 좌표는 정수로 반올림된다. */
  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    const ctx = this.stage.ctx
    ctx.fillStyle = color
    ctx.fillRect(
      this.originX + Math.round(x) * this.scale,
      this.originY + Math.round(y) * this.scale,
      Math.round(w) * this.scale,
      Math.round(h) * this.scale,
    )
  }

  /** 논리 좌표 (x, y) 를 왼쪽 위로 두고 스프라이트를 그린다. */
  drawSprite(image: HTMLImageElement, x: number, y: number): void {
    this.stage.ctx.drawImage(
      image,
      this.originX + Math.round(x) * this.scale,
      this.originY + Math.round(y) * this.scale,
      image.width * this.scale,
      image.height * this.scale,
    )
  }

  /**
   * 논리 좌표계에서 글자를 그린다.
   *
   * 글자는 도트가 아니라 브라우저 폰트다. 여기에만 소수 배율이 허용된다 —
   * 점수 표시까지 도트 폰트로 찍으려면 글꼴 에셋이 필요한데 M3 의 범위가 아니다.
   */
  fillText(text: string, x: number, y: number, color: string, sizePx: number): void {
    const ctx = this.stage.ctx
    ctx.fillStyle = color
    ctx.font = `700 ${sizePx * this.scale}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, this.originX + x * this.scale, this.originY + y * this.scale)
  }

  /** 화면 좌표(포인터 이벤트)를 논리 좌표로 되돌린다. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.stage.canvas.getBoundingClientRect()
    // getBoundingClientRect 는 CSS 픽셀이고 origin/scale 은 장치 픽셀 기준이라
    // 여기서 한 번 맞춰 준다. 이 변환을 빠뜨리면 dpr 2 기기에서 터치가 절반만 간다.
    const dpr = this.stage.canvas.width / rect.width
    return {
      x: ((clientX - rect.left) * dpr - this.originX) / this.scale,
      y: ((clientY - rect.top) * dpr - this.originY) / this.scale,
    }
  }
}
