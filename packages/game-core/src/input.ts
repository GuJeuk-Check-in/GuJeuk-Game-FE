import type { PointerPoint } from './types'

export interface PointerInputOptions {
  /** 좌표 기준이 되는 요소. 보통 CanvasStage.canvas. */
  target: HTMLElement
  onDown?: (point: PointerPoint, event: PointerEvent) => void
  onMove?: (point: PointerPoint, event: PointerEvent) => void
  onUp?: (point: PointerPoint, event: PointerEvent) => void
}

/**
 * 마우스와 터치를 하나로 묶은 포인터 입력.
 *
 * Pointer Events만 쓰면 마우스/터치/펜을 한 벌의 코드로 처리할 수 있다.
 * 여기서 중요한 건 두 가지다.
 *
 * 1) setPointerCapture: 알까기에서 말을 끌어당기다 손가락이 캔버스 밖으로
 *    나가면, 캡처가 없으면 pointerup을 못 받아 말이 영원히 잡힌 상태가 된다.
 * 2) 좌표 변환: getBoundingClientRect 기준으로 CSS 픽셀로 바꿔서 넘긴다.
 *    CanvasStage가 같은 좌표계로 그리므로 게임 로직은 변환을 신경 쓸 필요가 없다.
 */
export class PointerInput {
  private readonly target: HTMLElement
  private readonly opts: PointerInputOptions

  private activeId: number | null = null

  constructor(options: PointerInputOptions) {
    this.target = options.target
    this.opts = options

    this.target.addEventListener('pointerdown', this.handleDown)
    this.target.addEventListener('pointermove', this.handleMove)
    this.target.addEventListener('pointerup', this.handleUp)
    this.target.addEventListener('pointercancel', this.handleUp)
  }

  /** 현재 눌린 상태인지. */
  get isDown(): boolean {
    return this.activeId !== null
  }

  destroy(): void {
    this.target.removeEventListener('pointerdown', this.handleDown)
    this.target.removeEventListener('pointermove', this.handleMove)
    this.target.removeEventListener('pointerup', this.handleUp)
    this.target.removeEventListener('pointercancel', this.handleUp)
    this.activeId = null
  }

  private toLocal(event: PointerEvent): PointerPoint {
    const rect = this.target.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  private handleDown = (event: PointerEvent): void => {
    // 멀티터치로 두 번째 손가락이 들어와도 첫 포인터만 따라간다.
    if (this.activeId !== null) return
    this.activeId = event.pointerId
    this.target.setPointerCapture(event.pointerId)
    this.opts.onDown?.(this.toLocal(event), event)
  }

  private handleMove = (event: PointerEvent): void => {
    if (this.activeId !== event.pointerId) return
    this.opts.onMove?.(this.toLocal(event), event)
  }

  private handleUp = (event: PointerEvent): void => {
    if (this.activeId !== event.pointerId) return
    this.activeId = null
    if (this.target.hasPointerCapture(event.pointerId)) {
      this.target.releasePointerCapture(event.pointerId)
    }
    this.opts.onUp?.(this.toLocal(event), event)
  }
}
