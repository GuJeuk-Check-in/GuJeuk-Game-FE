import { Bodies, Body, Composite, Engine } from 'matter-js'
import { GameLoop, PointerInput, clamp } from '@gujuck/game-core'
import type { CanvasStage, PointerPoint } from '@gujuck/game-core'

/** 물리 세계의 논리 크기. 화면 비율과 무관하게 고정한다. */
const WORLD_W = 900
const WORLD_H = 500
const GROUND_Y = 440

const ARCHER_X = 110
const ARCHER_Y = GROUND_Y - 40

const TARGET_X = 790
const TARGET_Y = 250
/** 안쪽부터 바깥쪽 순서. [반지름, 점수] */
const RINGS: readonly (readonly [number, number])[] = [
  [18, 10],
  [40, 8],
  [64, 5],
  [88, 2],
]

const MAX_PULL = 150
/**
 * 최대로 당겼을 때의 화살 초기 속도(스텝당 이동 픽셀).
 *
 * 실측 기준: 속도 20에 30도로 쏘면 과녁 중심(y=250)에 거의 정확히 꽂힌다.
 * 상한을 26으로 둬서 만개하면 넘어가게 만들었다 — 항상 최대로 당기면 되는
 * 게임은 재미가 없다. 값을 더 키우면 한 스텝 이동 거리가 과녁 링 두께를
 * 넘어서 명중 판정이 거칠어진다.
 */
const MAX_ARROW_SPEED = 26
/** 바람 세기 1.0당 매 스텝 가해지는 수평 힘 계수. */
const WIND_FORCE = 0.0002
const ARROWS_PER_ROUND = 5

export interface ArcherySnapshot {
  score: number
  /** 남은 화살 수. */
  arrowsLeft: number
  /** 양수면 오른쪽 바람. HUD 표시용. */
  wind: number
  /** 마지막 발의 획득 점수. 아직 안 쐈으면 null. */
  lastHit: number | null
  finished: boolean
}

export interface ArcheryGameOptions {
  stage: CanvasStage
  onChange: (snapshot: ArcherySnapshot) => void
}

/**
 * 양궁.
 *
 * 알까기와 같은 물리 엔진을 쓰지만 세팅은 정반대다 — 여기는 옆에서 보는
 * 시점이라 중력이 켜져 있고, 바람이 수평 방향 상수력으로 매 스텝 더해진다.
 * 두 게임이 같은 엔진을 공유해도 서로의 설정에 영향을 주지 않는다는 점이
 * 중요하다. 각자 자기 Engine 인스턴스를 갖기 때문이다.
 */
export class ArcheryGame {
  private readonly stage: CanvasStage
  private readonly onChange: (snapshot: ArcherySnapshot) => void
  private readonly engine: Engine
  private readonly loop: GameLoop
  private readonly input: PointerInput

  private arrow: Body | null = null
  private trail: PointerPoint[] = []

  private score = 0
  private arrowsLeft = ARROWS_PER_ROUND
  private wind = 0
  private lastHit: number | null = null

  private aiming = false
  private aimPoint: PointerPoint | null = null

  constructor(options: ArcheryGameOptions) {
    this.stage = options.stage
    this.onChange = options.onChange

    this.engine = Engine.create()
    this.engine.gravity.y = 1

    this.reset()

    this.input = new PointerInput({
      target: this.stage.canvas,
      onDown: (point) => this.handleDown(point),
      onMove: (point) => this.handleMove(point),
      onUp: () => this.handleUp(),
    })

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    })
    this.loop.start()
  }

  reset(): void {
    this.clearArrow()
    this.score = 0
    this.arrowsLeft = ARROWS_PER_ROUND
    this.lastHit = null
    this.aiming = false
    this.aimPoint = null
    this.rollWind()
    this.emit()
  }

  destroy(): void {
    this.loop.destroy()
    this.input.destroy()
    Composite.clear(this.engine.world, false)
    Engine.clear(this.engine)
  }

  private get finished(): boolean {
    return this.arrowsLeft === 0 && this.arrow === null
  }

  private rollWind(): void {
    // -1 ~ 1. 매 발마다 바뀌므로 같은 조준이 계속 통하지 않는다.
    this.wind = Math.round((Math.random() * 2 - 1) * 10) / 10
  }

  private clearArrow(): void {
    if (this.arrow) Composite.remove(this.engine.world, this.arrow)
    this.arrow = null
    this.trail = []
  }

  private emit(): void {
    this.onChange({
      score: this.score,
      arrowsLeft: this.arrowsLeft,
      wind: this.wind,
      lastHit: this.lastHit,
      finished: this.finished,
    })
  }

  private update(dtSec: number): void {
    const arrow = this.arrow
    if (arrow) {
      // 바람은 매 스텝 더해지는 수평 상수력이다. 한 번만 주면 초속만 바뀌고
      // 비행 중 휘어지는 느낌이 안 난다.
      //
      // 계수는 실측으로 정했다. 0.0002면 같은 조준이라도 맞바람 최대에서
      // 과녁 중심 기준 약 23px 아래, 뒷바람에서는 거의 정중앙에 꽂힌다 —
      // 10점 링(18)을 넘나드는 폭이라 바람을 읽을 이유가 생긴다.
      // 더 작으면 있으나 마나 하고, 더 키우면 조준 자체가 무의미해진다.
      Body.applyForce(arrow, arrow.position, { x: this.wind * WIND_FORCE * arrow.mass, y: 0 })
    }

    Engine.update(this.engine, dtSec * 1000)

    if (!arrow) return

    this.trail.push({ x: arrow.position.x, y: arrow.position.y })
    if (this.trail.length > 60) this.trail.shift()

    // 화살은 진행 방향을 향하게 돌려준다. 물리적으로는 필요 없지만
    // 이게 없으면 화살이 옆으로 누운 채 날아가 어색하다.
    Body.setAngle(arrow, Math.atan2(arrow.velocity.y, arrow.velocity.x))

    const { x, y } = arrow.position
    const hitTargetPlane = x >= TARGET_X
    const hitGround = y >= GROUND_Y
    const offScreen = x > WORLD_W + 80 || y > WORLD_H + 200

    if (hitTargetPlane || hitGround || offScreen) {
      this.resolveShot(hitTargetPlane ? y : null)
    }
  }

  private resolveShot(hitY: number | null): void {
    const gained = hitY === null ? 0 : scoreFor(Math.abs(hitY - TARGET_Y))
    this.score += gained
    this.lastHit = gained
    this.clearArrow()
    this.rollWind()
    this.emit()
  }

  // ---- 입력 -------------------------------------------------------------

  private handleDown(point: PointerPoint): void {
    if (this.finished || this.arrow !== null || this.arrowsLeft === 0) return
    this.aiming = true
    this.aimPoint = this.toWorld(point)
  }

  private handleMove(point: PointerPoint): void {
    if (!this.aiming) return
    this.aimPoint = this.toWorld(point)
  }

  private handleUp(): void {
    if (!this.aiming || !this.aimPoint) {
      this.aiming = false
      return
    }

    // 활을 당기듯 뒤로 끌었다 놓는다. 당긴 반대 방향으로 날아간다.
    const dx = ARCHER_X - this.aimPoint.x
    const dy = ARCHER_Y - this.aimPoint.y
    const pulled = Math.hypot(dx, dy)

    this.aiming = false
    this.aimPoint = null
    if (pulled < 10) return

    const speed = (clamp(pulled, 0, MAX_PULL) / MAX_PULL) * MAX_ARROW_SPEED

    const arrow = Bodies.rectangle(ARCHER_X, ARCHER_Y, 34, 4, {
      frictionAir: 0.004,
      density: 0.002,
    })
    Composite.add(this.engine.world, arrow)
    Body.setVelocity(arrow, { x: (dx / pulled) * speed, y: (dy / pulled) * speed })

    this.arrow = arrow
    this.trail = []
    this.arrowsLeft -= 1
    this.lastHit = null
    this.emit()
  }

  // ---- 좌표 변환 --------------------------------------------------------

  private toWorld(point: PointerPoint): PointerPoint {
    const { scale, offsetX, offsetY } = this.viewport()
    return { x: (point.x - offsetX) / scale, y: (point.y - offsetY) / scale }
  }

  private viewport(): { scale: number; offsetX: number; offsetY: number } {
    const { width, height } = this.stage
    // contain 방식: 세계 전체가 항상 보이도록 작은 쪽 배율을 택한다.
    const scale = Math.min(width / WORLD_W, height / WORLD_H)
    return {
      scale,
      offsetX: (width - WORLD_W * scale) / 2,
      offsetY: (height - WORLD_H * scale) / 2,
    }
  }

  // ---- 렌더 -------------------------------------------------------------

  private render(): void {
    const { ctx } = this.stage
    const { scale, offsetX, offsetY } = this.viewport()

    this.stage.fill('#0f1420')

    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)

    ctx.fillStyle = '#16203a'
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)

    ctx.fillStyle = '#2c4a30'
    ctx.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y)

    this.drawTarget(ctx)
    this.drawArcher(ctx)
    this.drawTrail(ctx)
    this.drawArrow(ctx)
    this.drawAim(ctx)

    ctx.restore()
  }

  private drawTarget(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#8a6a3a'
    ctx.fillRect(TARGET_X + 8, TARGET_Y - 4, 10, GROUND_Y - TARGET_Y + 4)

    const colors = ['#f2c14e', '#e8604c', '#4d8dff', '#e9edf5']
    for (let i = RINGS.length - 1; i >= 0; i -= 1) {
      const ring = RINGS[i]
      ctx.beginPath()
      ctx.ellipse(TARGET_X, TARGET_Y, 12, ring[0], 0, 0, Math.PI * 2)
      ctx.fillStyle = colors[i] ?? '#ffffff'
      ctx.fill()
    }
  }

  private drawArcher(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#e9edf5'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(ARCHER_X, ARCHER_Y, 26, -Math.PI / 2.4, Math.PI / 2.4)
    ctx.stroke()

    ctx.fillStyle = '#e9edf5'
    ctx.beginPath()
    ctx.arc(ARCHER_X - 18, ARCHER_Y, 9, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawTrail(ctx: CanvasRenderingContext2D): void {
    if (this.trail.length < 2) return
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    const first = this.trail[0]
    if (!first) return
    ctx.moveTo(first.x, first.y)
    for (const point of this.trail) ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawArrow(ctx: CanvasRenderingContext2D): void {
    const arrow = this.arrow
    if (!arrow) return
    ctx.save()
    ctx.translate(arrow.position.x, arrow.position.y)
    ctx.rotate(arrow.angle)
    ctx.fillStyle = '#f4f4f6'
    ctx.fillRect(-17, -2, 34, 4)
    ctx.fillStyle = '#e8604c'
    ctx.fillRect(13, -4, 6, 8)
    ctx.restore()
  }

  private drawAim(ctx: CanvasRenderingContext2D): void {
    if (!this.aiming || !this.aimPoint) return
    ctx.strokeStyle = 'rgba(77, 141, 255, 0.9)'
    ctx.lineWidth = 3
    ctx.setLineDash([10, 8])
    ctx.beginPath()
    ctx.moveTo(ARCHER_X, ARCHER_Y)
    ctx.lineTo(this.aimPoint.x, this.aimPoint.y)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function scoreFor(distanceFromCenter: number): number {
  for (const [radius, points] of RINGS) {
    if (distanceFromCenter <= radius) return points
  }
  return 0
}
