export interface GameLoopOptions {
  /** 고정 간격으로 호출되는 물리/로직 갱신. dt는 항상 fixedStepSec와 같다. */
  update: (dtSec: number) => void
  /**
   * 매 프레임 호출되는 그리기.
   * alpha는 마지막 update 이후 남은 시간의 비율(0~1)로, 보간 렌더에 쓴다.
   */
  render: (alpha: number) => void
  /** 로직 갱신 간격(초). 기본 1/60. */
  fixedStepSec?: number
  /**
   * 한 프레임에 흡수할 최대 시간(초). 기본 0.25.
   * 탭이 백그라운드에 오래 있다 돌아오면 delta가 수십 초로 튀는데, 이걸
   * 그대로 accumulator에 넣으면 update가 수천 번 돌면서 프레임이 멈춘다
   * (death spiral). 그래서 상한을 두고 나머지는 그냥 버린다.
   */
  maxFrameSec?: number
  /** 문서가 숨겨지면 자동으로 멈춘다. 기본 true. */
  autoPauseOnHidden?: boolean
}

/**
 * 고정 타임스텝 게임 루프.
 *
 * 렌더링 엔진과 무관하다. 알까기는 matter.js를, 양궁은 자체 포물선 계산을
 * update 안에서 돌리면 되고, 이 클래스는 "언제 얼마만큼 갱신할지"만 책임진다.
 * 물리 갱신을 프레임 시간에 직접 묶으면 120Hz 기기와 60Hz 기기에서 결과가
 * 달라지므로(알까기 같은 충돌 게임에서는 치명적) 반드시 고정 스텝으로 돈다.
 */
export class GameLoop {
  private readonly opts: Required<Omit<GameLoopOptions, 'update' | 'render'>> &
    Pick<GameLoopOptions, 'update' | 'render'>

  private rafId = 0
  private lastTs = 0
  private accumulator = 0
  private running = false
  private disposed = false

  constructor(options: GameLoopOptions) {
    this.opts = {
      fixedStepSec: 1 / 60,
      maxFrameSec: 0.25,
      autoPauseOnHidden: true,
      ...options,
    }

    if (this.opts.autoPauseOnHidden) {
      document.addEventListener('visibilitychange', this.handleVisibility)
    }
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.disposed || this.running) return
    this.running = true
    // lastTs를 0으로 두면 첫 프레임의 delta가 performance.now() 전체가 되어
    // 곧바로 maxFrameSec에 걸린다. tick 안에서 0을 보고 초기화한다.
    this.lastTs = 0
    this.accumulator = 0
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  /** 리스너까지 정리한다. 이후 start()는 무시된다. */
  destroy(): void {
    this.stop()
    this.disposed = true
    document.removeEventListener('visibilitychange', this.handleVisibility)
  }

  private handleVisibility = (): void => {
    if (document.hidden) this.stop()
    else this.start()
  }

  private tick = (ts: number): void => {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this.tick)

    if (this.lastTs === 0) {
      this.lastTs = ts
      return
    }

    const frameSec = Math.min((ts - this.lastTs) / 1000, this.opts.maxFrameSec)
    this.lastTs = ts
    this.accumulator += frameSec

    const step = this.opts.fixedStepSec
    while (this.accumulator >= step) {
      this.opts.update(step)
      this.accumulator -= step
    }

    this.opts.render(this.accumulator / step)
  }
}
