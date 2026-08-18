import type { StageSize } from './types'

export interface CanvasStageOptions {
  /** 캔버스를 채워 넣을 컨테이너. 크기는 이 요소를 따라간다. */
  host: HTMLElement
  /** 크기가 바뀔 때마다 호출. 초기 마운트 직후에도 한 번 호출된다. */
  onResize?: (size: StageSize) => void
  /** 투명 배경이 필요 없으면 false로 두는 편이 합성 비용이 싸다. 기본 false. */
  alpha?: boolean
  /** devicePixelRatio 상한. 기본 2. 저사양 기기에서 4K 캔버스를 만들지 않기 위함. */
  maxDpr?: number
}

/**
 * DPR을 고려해 캔버스를 컨테이너 크기에 맞춰 유지한다.
 *
 * 핵심은 "그리는 코드는 항상 CSS 픽셀만 쓴다"는 것. 백버퍼는 dpr배로 잡고
 * ctx에 setTransform(dpr, ...)을 걸어두므로, 게임 로직은 dpr을 몰라도 되고
 * 레티나에서도 선이 뭉개지지 않는다. dpr을 무시하면 모바일에서 캔버스가
 * 흐릿하게 보이고, 반대로 로직에까지 dpr을 섞으면 좌표 계산이 전부 오염된다.
 */
export class CanvasStage {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  private readonly host: HTMLElement
  private readonly maxDpr: number
  private readonly onResize?: (size: StageSize) => void
  private readonly observer: ResizeObserver

  private cssWidth = 0
  private cssHeight = 0
  private currentDpr = 1

  constructor(options: CanvasStageOptions) {
    const { host, onResize, alpha = false, maxDpr = 2 } = options

    this.host = host
    this.onResize = onResize
    this.maxDpr = maxDpr

    this.canvas = document.createElement('canvas')
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    // 터치로 조준/당기기를 하는 게임에서 브라우저가 스크롤·핀치줌을 가로채면
    // 드래그가 끊긴다. 캔버스 위에서는 제스처를 전부 게임이 가져간다.
    this.canvas.style.touchAction = 'none'

    const ctx = this.canvas.getContext('2d', { alpha })
    if (!ctx) throw new Error('[CanvasStage] 2D 컨텍스트를 만들 수 없습니다.')
    this.ctx = ctx

    host.appendChild(this.canvas)

    this.observer = new ResizeObserver(() => this.sync())
    this.observer.observe(host)
    this.sync()
  }

  get width(): number {
    return this.cssWidth
  }

  get height(): number {
    return this.cssHeight
  }

  get dpr(): number {
    return this.currentDpr
  }

  get size(): StageSize {
    return { width: this.cssWidth, height: this.cssHeight, dpr: this.currentDpr }
  }

  /** 화면 전체를 지운다. CSS 픽셀 좌표계 기준. */
  clear(): void {
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)
  }

  /** 배경색으로 화면을 채운다. */
  fill(color: string): void {
    this.ctx.fillStyle = color
    this.ctx.fillRect(0, 0, this.cssWidth, this.cssHeight)
  }

  destroy(): void {
    this.observer.disconnect()
    this.canvas.remove()
  }

  private sync(): void {
    const rect = this.host.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr)
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))

    if (width === this.cssWidth && height === this.cssHeight && dpr === this.currentDpr) {
      return
    }

    this.cssWidth = width
    this.cssHeight = height
    this.currentDpr = dpr

    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    // 백버퍼 크기를 바꾸면 컨텍스트 상태가 초기화되므로 변환을 다시 건다.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    this.onResize?.(this.size)
  }
}
