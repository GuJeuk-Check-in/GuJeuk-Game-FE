import { Bodies, Body, Composite, Engine } from 'matter-js'
import { GameLoop, PointerInput, clamp } from '@gujuck/game-core'
import type { CanvasStage, PointerPoint } from '@gujuck/game-core'

/**
 * 양궁.
 *
 * ─── 물리를 클라에서 도는 이유 ───────────────────────────────────────────
 * 화살은 서로 부딪히지 않는다. 한 발의 결과는 착탄점 하나로 압축되고, 같은
 * 입력(각도·세기·바람)이면 같은 궤적이 나온다. 그래서 서버가 궤적을 계산해
 * 내려보낼 필요 없이, 발사 입력만 중계하면 상대 화면에서 같은 화살이 난다.
 *
 * 알까기가 락스텝을 쓰는 건 돌끼리 충돌해 상태가 얽히기 때문이고, 양궁은
 * 그 얽힘이 없어서 훨씬 단순하게 끝난다.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** 물리 세계의 논리 크기. 화면 비율과 무관하게 고정한다. */
const WORLD_W = 900
const WORLD_H = 500
const GROUND_Y = 440

const ARCHER_X = 110
const ARCHER_Y = GROUND_Y - 40

const TARGET_X = 790
const TARGET_Y = 250
/** 과녁을 옆에서 본 두께. 이 값이 작을수록 얇은 판처럼 보인다. */
const TARGET_HALF_W = 16

/**
 * 과녁 링. 안쪽부터 10점, 바깥으로 갈수록 1점씩 낮아진다.
 *
 * 실제 양궁 과녁의 배색을 그대로 쓴다. 링은 열 개지만 눈에는 색 다섯 구간으로
 * 읽혀서, 화면이 작아도 어디에 맞았는지 바로 보인다. 실제 과녁이 이 배색인
 * 이유이기도 하다.
 */
const RING_STEP = 10
const RING_COUNT = 10
/** 가장 바깥 링의 반지름. 이 밖으로 지나가면 과녁을 넘긴 것이다. */
const RING_OUTER = RING_STEP * RING_COUNT
/** 점수 구간 두 개가 색 하나를 공유한다. 안쪽(10·9)부터. */
const RING_COLORS = ['#f5cf3d', '#e8474b', '#4d8dff', '#23262e', '#edeff5'] as const
/** 흰색·금색 링 위에 그리는 경계선. 색이 옅어 경계가 안 보인다. */
const RING_LINE = 'rgba(0, 0, 0, 0.28)'

const MAX_PULL = 150
/**
 * 조준으로 인정하는 최소 드래그 거리(월드 px).
 *
 * 당김 벡터를 누른 지점이 아니라 궁수 기준으로 재기 때문에, 이 문턱이 없으면
 * 캔버스 아무 데나 한 번 탭한 것이 곧 만개 조준이 된다. 과녁 쪽을 탭하면
 * 최대 세기로 뒤를 향해 쏴서 화살 한 발이 0점으로 사라진다.
 */
const MIN_DRAG = 12
/** 쏠 수 있는 최대 각도. 이보다 위나 뒤로 조준하면 발사하지 않는다. */
const MAX_ANGLE = (85 * Math.PI) / 180
/**
 * 최대로 당겼을 때의 화살 초기 속도(스텝당 이동 픽셀).
 *
 * 실측으로 정했다. 이 값이 게임의 성격을 거의 결정한다.
 *
 * 처음에 26으로 뒀더니 45도 사거리가 1793px인데 과녁은 664px 앞이라, 최적해가
 * "낮고 빠르게 쏘기"로 몰렸다. 그러면 비행이 31프레임(0.5초)에 끝나서 포물선도
 * 안 보이고 바람이 쌓일 시간도 없다. 반대로 18까지 낮추면 사거리 여유가 없어
 * 항상 만개해야 하고 맞바람이 불면 아예 못 닿는다.
 *
 * 24면 정중앙에 필요한 세기가 각도별로 0.71~0.83이라 위아래로 여유가 있고,
 * 비행이 41~62프레임이라 궤적이 눈에 보인다.
 */
const MAX_ARROW_SPEED = 24
/**
 * 바람 세기 1.0당 매 스텝 가해지는 수평 힘 계수.
 *
 * 이 값도 실측이다. 정중앙 조준을 고정하고 바람만 바꿨을 때 점수가 이렇게 된다.
 *
 *   바람  -1   -0.5   0   +0.5   +1
 *   점수   6     9    10    9     8
 *
 * 무시하면 최대 4점을 잃고, 깃발을 보고 보정하면 만회할 수 있는 정도다.
 * 더 키우면(0.0002) 맞바람에서 3점까지 떨어지고 과녁에 닿지도 못하는 발이
 * 늘어 운 싸움이 되고, 줄이면(0.00008) 1점밖에 안 깎여서 읽을 이유가 없어진다.
 */
const WIND_FORCE = 0.00016
/** 과녁에 꽂힌 화살은 이만큼만 남긴다. 계속 쌓이면 과녁이 안 보인다. */
const MAX_STUCK_ARROWS = 12

export type Shooter = 'me' | 'them'

/** 한 발의 입력. 이 값만 있으면 어느 화면에서도 같은 궤적이 나온다. */
export interface ShotInput {
  /** 라디안. 0이 수평, 양수가 위쪽. */
  angle: number
  /** 0~1. 얼마나 당겼는지. */
  power: number
  /** 이번 발의 바람. 양수면 오른쪽. */
  wind: number
}

export interface ShotResult {
  /** 0~10. 빗나가면 0. */
  score: number
  /** 과녁 평면을 지난 높이. 평면까지 못 갔으면 null. */
  hitY: number | null
  /** over는 평면을 지나긴 했지만 링 바깥이었다는 뜻 — 넘긴 발이다. */
  outcome: 'target' | 'over' | 'ground' | 'out'
}

export interface ArcherySnapshot {
  /** 지금 조준할 수 있는지. */
  canShoot: boolean
  /** 화살이 날아가는 중인지. */
  flying: boolean
  /** 지금 당기고 있는 세기(0~1). 활 시위 표시에 쓴다. */
  pull: number
}

export interface ArcheryGameOptions {
  stage: CanvasStage
  /**
   * 화살이 멈췄을 때. 내가 쏜 것이면 이 값을 서버로 보낸다.
   *
   * 입력을 함께 넘기는 이유는 상대 화면에서 그대로 재생하기 위해서다.
   * 나중에 서버 검증을 붙일 때도 이 값이면 충분하다.
   */
  onShotLanded: (input: ShotInput, result: ShotResult, by: Shooter) => void
  onChange: (snapshot: ArcherySnapshot) => void
}

interface StuckArrow {
  x: number
  y: number
  angle: number
  by: Shooter
}

export class ArcheryGame {
  private readonly stage: CanvasStage
  private readonly onShotLanded: ArcheryGameOptions['onShotLanded']
  private readonly onChange: (snapshot: ArcherySnapshot) => void

  private readonly engine: Engine
  private readonly loop: GameLoop
  private readonly input: PointerInput

  /** 지금 날아가는 화살. 한 번에 한 발만 난다. */
  private arrow: Body | null = null
  private arrowInput: ShotInput | null = null
  private arrowBy: Shooter = 'me'
  private trail: PointerPoint[] = []
  private stuck: StuckArrow[] = []

  /** 내 차례이고 아직 안 쐈을 때만 true. */
  private armed = false
  private wind = 0

  private aiming = false
  private aimPoint: PointerPoint | null = null
  /** 포인터를 누른 지점. 여기서 얼마나 끌었는지로 탭과 조준을 가른다. */
  private downPoint: PointerPoint | null = null

  constructor(options: ArcheryGameOptions) {
    this.stage = options.stage
    this.onShotLanded = options.onShotLanded
    this.onChange = options.onChange

    this.engine = Engine.create()
    this.engine.gravity.y = 1

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

  destroy(): void {
    this.loop.destroy()
    this.input.destroy()
    Composite.clear(this.engine.world, false)
    Engine.clear(this.engine)
  }

  // ---- 바깥에서 부르는 것 -------------------------------------------------

  /** 내 차례를 켜거나 끈다. 바람은 이번 발에 적용된다. */
  setTurn(canShoot: boolean, wind: number): void {
    this.armed = canShoot && this.arrow === null
    this.wind = wind
    this.emit()
  }

  /** 상대가 쏜 발을 같은 입력으로 재생한다. */
  replay(input: ShotInput): void {
    this.armed = false
    this.launch(input, 'them')
  }

  /** 판을 처음으로 되돌린다. 꽂힌 화살도 지운다. */
  reset(): void {
    this.clearArrow()
    this.stuck = []
    this.armed = false
    this.aiming = false
    this.aimPoint = null
    this.downPoint = null
    this.emit()
  }

  // ---- 발사 ---------------------------------------------------------------

  private launch(input: ShotInput, by: Shooter): void {
    this.clearArrow()

    const arrow = Bodies.rectangle(ARCHER_X, ARCHER_Y, 34, 4, {
      frictionAir: 0.004,
      density: 0.002,
    })
    Composite.add(this.engine.world, arrow)

    const speed = input.power * MAX_ARROW_SPEED
    Body.setVelocity(arrow, {
      x: Math.cos(input.angle) * speed,
      y: -Math.sin(input.angle) * speed,
    })

    this.arrow = arrow
    this.arrowInput = input
    this.arrowBy = by
    this.trail = []
    this.emit()
  }

  private update(dtSec: number): void {
    const arrow = this.arrow
    const input = this.arrowInput
    if (!arrow || !input) return

    // 바람은 매 스텝 더해지는 수평 상수력이다. 한 번만 주면 초속만 바뀌고
    // 비행 중 휘어지는 느낌이 안 난다.
    Body.applyForce(arrow, arrow.position, {
      x: input.wind * WIND_FORCE * arrow.mass,
      y: 0,
    })

    Engine.update(this.engine, dtSec * 1000)

    this.trail.push({ x: arrow.position.x, y: arrow.position.y })
    if (this.trail.length > 70) this.trail.shift()

    // 화살은 진행 방향을 향하게 돌려준다. 물리적으로는 필요 없지만 이게
    // 없으면 옆으로 누운 채 날아가 어색하다.
    Body.setAngle(arrow, Math.atan2(arrow.velocity.y, arrow.velocity.x))

    const { x, y } = arrow.position
    if (x >= TARGET_X - TARGET_HALF_W) {
      // 평면을 지났다고 다 맞은 게 아니다. 이 조건은 x만 보므로 과녁 한참 위로
      // 넘어간 화살도 여기로 온다. 링 안팎을 갈라두지 않으면 0점짜리 화살이
      // 과녁 위 허공에 꽂힌 채 남는다.
      this.land(y, Math.abs(y - TARGET_Y) <= RING_OUTER ? 'target' : 'over')
    } else if (y >= GROUND_Y) {
      this.land(null, 'ground')
    } else if (x > WORLD_W + 100 || y > WORLD_H + 200) {
      this.land(null, 'out')
    }
  }

  private land(hitY: number | null, outcome: ShotResult['outcome']): void {
    const input = this.arrowInput
    const arrow = this.arrow
    if (!input || !arrow) return

    // 링 안에 든 발만 점수가 있다. over/ground/out은 전부 0점이다.
    const score = outcome === 'target' && hitY !== null ? scoreFor(Math.abs(hitY - TARGET_Y)) : 0

    if (outcome === 'target' && hitY !== null) {
      this.stuck.push({
        x: TARGET_X - TARGET_HALF_W,
        y: hitY,
        angle: arrow.angle,
        by: this.arrowBy,
      })
      // 오래된 것부터 걷어낸다. 계속 쌓이면 과녁이 화살에 덮인다.
      while (this.stuck.length > MAX_STUCK_ARROWS) this.stuck.shift()
    }

    const by = this.arrowBy
    this.clearArrow()
    this.emit()
    this.onShotLanded(input, { score, hitY, outcome }, by)
  }

  private clearArrow(): void {
    if (this.arrow) Composite.remove(this.engine.world, this.arrow)
    this.arrow = null
    this.arrowInput = null
    this.trail = []
  }

  private emit(): void {
    this.onChange({
      canShoot: this.armed && this.arrow === null,
      flying: this.arrow !== null,
      pull: this.aiming ? this.pullRatio() : 0,
    })
  }

  // ---- 입력 ---------------------------------------------------------------

  private handleDown(point: PointerPoint): void {
    if (!this.armed || this.arrow !== null) return
    // 누른 지점만 기억한다. 여기서 바로 조준을 켜면 탭 한 번이 곧 발사가 된다.
    this.downPoint = this.toWorld(point)
    this.aiming = false
    this.aimPoint = null
    this.emit()
  }

  private handleMove(point: PointerPoint): void {
    const down = this.downPoint
    if (!down) return

    const world = this.toWorld(point)
    // 누른 자리에서 충분히 끌어야 조준이 시작된다.
    if (!this.aiming && Math.hypot(world.x - down.x, world.y - down.y) < MIN_DRAG) return

    this.aiming = true
    this.aimPoint = world
    this.emit()
  }

  private handleUp(): void {
    const aim = this.aimPoint
    const wasAiming = this.aiming

    this.aiming = false
    this.aimPoint = null
    this.downPoint = null

    if (!wasAiming || !aim || !this.armed) {
      this.emit()
      return
    }

    const pulled = this.pullVector(aim)
    if (pulled.distance < MIN_DRAG) {
      this.emit()
      return
    }

    const angle = Math.atan2(-pulled.dy, pulled.dx)
    // 뒤나 아래로 조준한 것은 실수다. 쏘면 화살만 버리므로 차례를 유지한다.
    if (angle < 0 || angle > MAX_ANGLE) {
      this.emit()
      return
    }

    this.armed = false
    this.launch(
      {
        angle,
        power: clamp(pulled.distance, 0, MAX_PULL) / MAX_PULL,
        wind: this.wind,
      },
      'me',
    )
  }

  /** 활을 당기듯 뒤로 끌었다 놓는다. 당긴 반대 방향으로 날아간다. */
  private pullVector(aim: PointerPoint): { dx: number; dy: number; distance: number } {
    const dx = ARCHER_X - aim.x
    const dy = ARCHER_Y - aim.y
    return { dx, dy, distance: Math.hypot(dx, dy) }
  }

  private pullRatio(): number {
    if (!this.aimPoint) return 0
    return clamp(this.pullVector(this.aimPoint).distance, 0, MAX_PULL) / MAX_PULL
  }

  // ---- 좌표 변환 ----------------------------------------------------------

  private toWorld(point: PointerPoint): PointerPoint {
    const { scale, offsetX, offsetY } = this.viewport()
    return { x: (point.x - offsetX) / scale, y: (point.y - offsetY) / scale }
  }

  /** contain 방식: 세계 전체가 항상 보이도록 작은 쪽 배율을 택한다. */
  private viewport(): { scale: number; offsetX: number; offsetY: number } {
    const { width, height } = this.stage
    const scale = Math.min(width / WORLD_W, height / WORLD_H)
    return {
      scale,
      offsetX: (width - WORLD_W * scale) / 2,
      offsetY: (height - WORLD_H * scale) / 2,
    }
  }

  // ---- 렌더 ---------------------------------------------------------------

  private render(): void {
    const { ctx } = this.stage
    const { scale, offsetX, offsetY } = this.viewport()

    this.stage.fill('#0f1420')

    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)

    this.drawSky(ctx)
    this.drawGround(ctx)
    this.drawTarget(ctx)
    this.drawStuckArrows(ctx)
    this.drawFlag(ctx)
    this.drawArcher(ctx)
    this.drawTrail(ctx)
    this.drawArrow(ctx)
    this.drawAim(ctx)

    ctx.restore()
  }

  private drawSky(ctx: CanvasRenderingContext2D): void {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
    sky.addColorStop(0, '#16203a')
    sky.addColorStop(1, '#243352')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, WORLD_W, GROUND_Y)
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#2c4a30'
    ctx.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, GROUND_Y)
    ctx.lineTo(WORLD_W, GROUND_Y)
    ctx.stroke()
  }

  private drawTarget(ctx: CanvasRenderingContext2D): void {
    // 받침대
    ctx.fillStyle = '#6f5836'
    ctx.fillRect(TARGET_X + TARGET_HALF_W - 4, TARGET_Y, 8, GROUND_Y - TARGET_Y)

    // 바깥 링부터 안쪽으로 덮어 그린다.
    for (let i = RING_COUNT; i >= 1; i -= 1) {
      const radius = RING_STEP * i
      // 링 두 개가 색 하나를 나눠 쓴다. RING_COLORS가 안쪽부터이므로 인덱스도
      // 안쪽(i=1)부터 세야 한다. 바깥부터 세면 배색이 통째로 뒤집힌다.
      const colorIndex = Math.floor((i - 1) / 2)

      ctx.beginPath()
      ctx.ellipse(TARGET_X, TARGET_Y, TARGET_HALF_W, radius, 0, 0, Math.PI * 2)
      ctx.fillStyle = RING_COLORS[colorIndex] ?? '#edeff5'
      ctx.fill()

      // 같은 색 안에서 점수가 갈리는 경계에만 선을 긋는다.
      if (i % 2 === 1) {
        ctx.strokeStyle = RING_LINE
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }

  private drawStuckArrows(ctx: CanvasRenderingContext2D): void {
    for (const arrow of this.stuck) {
      ctx.save()
      ctx.translate(arrow.x, arrow.y)
      ctx.rotate(arrow.angle)
      // 과녁 앞으로 튀어나온 부분만 그린다.
      ctx.fillStyle = arrow.by === 'me' ? '#f4f4f6' : '#9fb4d8'
      ctx.fillRect(-26, -1.5, 26, 3)
      ctx.fillStyle = arrow.by === 'me' ? '#e8604c' : '#4d8dff'
      ctx.fillRect(-26, -3.5, 5, 7)
      ctx.restore()
    }
  }

  /**
   * 바람 깃발.
   *
   * 숫자만으로는 바람이 얼마나 센지 감이 안 온다. 깃발이 방향으로 뻗고 세기에
   * 따라 더 팽팽해지면 눈으로 읽힌다.
   */
  private drawFlag(ctx: CanvasRenderingContext2D): void {
    const poleX = TARGET_X - 120
    const poleTop = TARGET_Y - 120
    const poleBottom = GROUND_Y

    ctx.strokeStyle = '#8b93a7'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(poleX, poleTop)
    ctx.lineTo(poleX, poleBottom)
    ctx.stroke()

    const strength = clamp(Math.abs(this.wind), 0, 1)
    const direction = this.wind >= 0 ? 1 : -1
    const length = 18 + strength * 52
    // 바람이 약하면 아래로 늘어지고 세면 수평으로 뻗는다.
    const droop = (1 - strength) * 26

    ctx.beginPath()
    ctx.moveTo(poleX, poleTop)
    ctx.lineTo(poleX + direction * length, poleTop + droop * 0.5)
    ctx.lineTo(poleX + direction * length * 0.55, poleTop + droop)
    ctx.closePath()
    ctx.fillStyle = strength > 0.5 ? '#e8604c' : '#e0a34c'
    ctx.fill()
  }

  private drawArcher(ctx: CanvasRenderingContext2D): void {
    const pull = this.aiming ? this.pullRatio() : 0

    // 몸
    ctx.strokeStyle = '#e9edf5'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(ARCHER_X - 14, ARCHER_Y + 12)
    ctx.lineTo(ARCHER_X - 14, GROUND_Y)
    ctx.stroke()

    ctx.fillStyle = '#e9edf5'
    ctx.beginPath()
    ctx.arc(ARCHER_X - 14, ARCHER_Y - 2, 9, 0, Math.PI * 2)
    ctx.fill()

    // 활 — 당길수록 더 휜다
    ctx.strokeStyle = '#c9a227'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(ARCHER_X, ARCHER_Y, 30, -Math.PI / 2.3, Math.PI / 2.3)
    ctx.stroke()

    // 시위 — 당긴 만큼 뒤로 물러난다
    const nock = ARCHER_X - pull * 26
    const tipY = 30 * Math.sin(Math.PI / 2.3)
    ctx.strokeStyle = 'rgba(233, 237, 245, 0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ARCHER_X + 30 * Math.cos(Math.PI / 2.3), ARCHER_Y - tipY)
    ctx.lineTo(nock, ARCHER_Y)
    ctx.lineTo(ARCHER_X + 30 * Math.cos(Math.PI / 2.3), ARCHER_Y + tipY)
    ctx.stroke()
  }

  private drawTrail(ctx: CanvasRenderingContext2D): void {
    if (this.trail.length < 2) return
    const first = this.trail[0]
    if (!first) return

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 7])
    ctx.beginPath()
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

  /**
   * 조준선.
   *
   * 당긴 방향과 세기만 보여준다. 예상 궤적은 그리지 않는다 — 어디에 떨어질지
   * 미리 보여주면 바람을 읽을 이유가 없어진다.
   */
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

    // 당긴 세기 막대
    const ratio = this.pullRatio()
    const barX = ARCHER_X - 40
    const barY = ARCHER_Y - 70
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    ctx.fillRect(barX, barY, 80, 8)
    ctx.fillStyle = ratio > 0.85 ? '#e8604c' : '#4d8dff'
    ctx.fillRect(barX, barY, 80 * ratio, 8)
  }
}

/** 중심에서 떨어진 거리로 점수를 정한다. 가장 바깥 링을 넘으면 0점. */
export function scoreFor(distanceFromCenter: number): number {
  const ring = Math.ceil(distanceFromCenter / RING_STEP)
  if (ring > RING_COUNT) return 0
  // 안쪽(ring 1)이 10점, 바깥(ring 10)이 1점.
  return RING_COUNT + 1 - Math.max(1, ring)
}
