import { Bodies, Body, Composite, Engine } from 'matter-js'
import { GameLoop, PointerInput, clamp, distance } from '@gujuck/game-core'
import type { CanvasStage, PointerPoint } from '@gujuck/game-core'
import type { PlacedStone, Player } from '@gujuck/api'

/** 물리 세계의 논리 크기. 화면 크기가 바뀌어도 이 값은 변하지 않는다. */
const BOARD = 600
const STONE_RADIUS = 24
const MAX_PULL = 150
const STONE_COUNT = 5
/**
 * 최대 세기로 튕겼을 때의 초기 속도(스텝당 이동 픽셀).
 *
 * 실측으로 정한 값이다. 그리고 돌 지름(48)보다 작아야 한다 — matter.js에는
 * 연속 충돌 검사가 없어서 한 스텝 이동 거리가 지름을 넘으면 돌끼리 그냥
 * 통과해버린다. 돌이 5개로 늘어 배치가 촘촘해질수록 이 위험은 커지므로
 * 상한을 올리지 않는다.
 */
const MAX_FLICK_SPEED = 17
/** 이 속도 아래면 멈춘 것으로 본다. */
const REST_SPEED = 0.12

export type Mode = 'placement' | 'playing' | 'over'

export interface AlkkagiSnapshot {
  mode: Mode
  turn: Player | null
  black: number
  white: number
  /** 돌이 아직 굴러가는 중이면 true. UI에서 입력을 막는 데 쓴다. */
  settling: boolean
  /** 배치 단계에서 5개가 모두 규칙에 맞게 놓였는지. */
  placementValid: boolean
}

export interface AlkkagiGameOptions {
  stage: CanvasStage
  myColor: Player
  onChange: (snapshot: AlkkagiSnapshot) => void
  /**
   * 내가 돌을 튕겼을 때. **여기서 바로 물리에 반영하지 않는다.**
   * 서버가 되돌려준 값을 applyFlick으로 받아야 양쪽이 완전히 같은 입력으로
   * 시뮬레이션한다. 보낸 쪽만 자기 로컬 값을 쓰면 미세하게 갈라진다.
   */
  onFlickRequest: (stoneId: number, vx: number, vy: number) => void
  /** 돌이 다 멈췄을 때. 최종 상태 해시와 남은 돌 수를 서버로 보고한다. */
  onSettled: (hash: string, black: number, white: number) => void
}

interface Stone {
  id: number
  body: Body
  owner: Player
}

/**
 * 알까기.
 *
 * 여기가 물리 엔진(matter.js)에 의존하는 유일한 계층이다. matter.js는 이
 * 파일 밖으로 새어나가지 않고, @gujuck/game-core는 물리 엔진의 존재를 모른다.
 *
 * 위에서 내려다보는 시점이라 중력은 0이다. 대신 frictionAir로 바닥 마찰을
 * 흉내 낸다 — 중력을 켜면 돌이 화면 아래로 쏟아진다.
 *
 * 온라인 대전에서는 양쪽 클라가 이 클래스를 각자 돌린다. 같은 입력에서 같은
 * 결과가 나와야 하므로 물리 갱신은 GameLoop의 고정 스텝에만 얹는다.
 */
export class AlkkagiGame {
  private readonly stage: CanvasStage
  private readonly myColor: Player
  private readonly onChange: (snapshot: AlkkagiSnapshot) => void
  private readonly onFlickRequest: (stoneId: number, vx: number, vy: number) => void
  private readonly onSettled: (hash: string, black: number, white: number) => void

  private readonly engine: Engine
  private readonly loop: GameLoop
  private readonly input: PointerInput

  private mode: Mode = 'placement'
  private stones: Stone[] = []
  private turn: Player | null = null
  private settling = false

  /** 배치 단계에서 끌고 다니는 좌표. 물리 바디를 만들기 전 단계다. */
  private placement: PointerPoint[] = []
  private placingIndex = -1

  private dragging: Stone | null = null
  private dragPoint: PointerPoint | null = null

  constructor(options: AlkkagiGameOptions) {
    this.stage = options.stage
    this.myColor = options.myColor
    this.onChange = options.onChange
    this.onFlickRequest = options.onFlickRequest
    this.onSettled = options.onSettled

    this.engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } })

    this.input = new PointerInput({
      target: this.stage.canvas,
      onDown: (point) => this.handleDown(point),
      onMove: (point) => this.handleMove(point),
      onUp: (point) => this.handleUp(point),
    })

    this.loop = new GameLoop({
      update: (dtSec) => this.update(dtSec),
      render: () => this.render(),
    })

    this.resetPlacement()
    this.loop.start()
  }

  destroy(): void {
    this.loop.destroy()
    this.input.destroy()
    Composite.clear(this.engine.world, false)
    Engine.clear(this.engine)
  }

  // ---- 배치 단계 ---------------------------------------------------------

  /** 자기 진영 안에 기본 배치를 깔아둔다. 사용자는 여기서부터 끌어 옮긴다. */
  private resetPlacement(): void {
    const gap = BOARD / (STONE_COUNT + 1)
    const y = this.myColor === 'black' ? BOARD - gap : gap

    this.placement = Array.from({ length: STONE_COUNT }, (_, i) => ({ x: gap * (i + 1), y }))
    this.mode = 'placement'
    this.emit()
  }

  /** 서버로 보낼 배치 좌표. */
  getPlacement(): PointerPoint[] {
    return this.placement.map((point) => ({ ...point }))
  }

  /** 내 진영 y 범위. 배치 가능 영역을 그리고 검사하는 데 함께 쓴다. */
  private myHalf(): { min: number; max: number } {
    const half = BOARD / 2
    return this.myColor === 'black'
      ? { min: half + STONE_RADIUS, max: BOARD - STONE_RADIUS }
      : { min: STONE_RADIUS, max: half - STONE_RADIUS }
  }

  private placementValid(): boolean {
    const { min, max } = this.myHalf()

    for (let i = 0; i < this.placement.length; i += 1) {
      const a = this.placement[i]
      if (a.y < min || a.y > max) return false
      if (a.x < STONE_RADIUS || a.x > BOARD - STONE_RADIUS) return false

      for (let j = i + 1; j < this.placement.length; j += 1) {
        const b = this.placement[j]
        if (distance(a.x, a.y, b.x, b.y) < STONE_RADIUS * 2) return false
      }
    }

    return true
  }

  // ---- 대국 -------------------------------------------------------------

  /** 서버가 확정한 배치와 선공으로 판을 시작한다. 양쪽이 같은 값을 받는다. */
  startGame(stones: PlacedStone[], turn: Player): void {
    Composite.clear(this.engine.world, false)
    this.stones = stones.map((stone) => this.createStone(stone))
    this.mode = 'playing'
    this.turn = turn
    this.settling = false
    this.emit()
  }

  setTurn(turn: Player): void {
    this.turn = turn
    this.settling = false
    this.emit()
  }

  finish(): void {
    this.mode = 'over'
    this.emit()
  }

  /** 서버가 중계한 튕기기를 물리에 반영한다. 친 사람에게도 이 경로로 돌아온다. */
  applyFlick(stoneId: number, vx: number, vy: number): void {
    const stone = this.stones.find((s) => s.id === stoneId)
    if (!stone) return

    // applyForce가 아니라 setVelocity를 쓴다. matter.js의 힘은 질량과 타임스텝
    // 제곱에 얽혀 있어 "얼마나 세게"가 직관적으로 안 잡히고, 조금만 키워도 돌이
    // 한 프레임에 수천 픽셀을 날아가 상대를 관통한다.
    Body.setVelocity(stone.body, { x: vx, y: vy })
    this.settling = true
    this.emit()
  }

  private createStone(stone: PlacedStone): Stone {
    const body = Bodies.circle(stone.x, stone.y, STONE_RADIUS, {
      restitution: 0.82,
      friction: 0,
      // 바닥 마찰 대용. 값이 크면 금방 멈추고, 작으면 미끄러진다.
      frictionAir: 0.028,
      density: 0.0016,
    })
    Composite.add(this.engine.world, body)
    return { id: stone.id, body, owner: stone.owner }
  }

  private update(dtSec: number): void {
    if (this.mode !== 'playing') return

    Engine.update(this.engine, dtSec * 1000)

    // 판 밖으로 나간 돌을 제거한다. 벽이 없는 게 알까기의 핵심 규칙이다.
    const survivors: Stone[] = []
    for (const stone of this.stones) {
      const { x, y } = stone.body.position
      const out =
        x < -STONE_RADIUS ||
        x > BOARD + STONE_RADIUS ||
        y < -STONE_RADIUS ||
        y > BOARD + STONE_RADIUS
      if (out) Composite.remove(this.engine.world, stone.body)
      else survivors.push(stone)
    }

    const removed = survivors.length !== this.stones.length
    this.stones = survivors

    const moving = this.stones.some((s) => Body.getSpeed(s.body) > REST_SPEED)

    if (this.settling && !moving) {
      // 다 멈췄으니 결과를 보고한다. 턴을 여기서 넘기지 않는다 — 순서는
      // 서버가 양쪽 보고를 대조한 뒤에 정한다.
      this.settling = false
      this.onSettled(this.hash(), this.count('black'), this.count('white'))
      this.emit()
    } else if (removed) {
      this.emit()
    }
  }

  /**
   * 최종 상태를 한 줄로 만든다. 양쪽 클라가 같은 값을 내야 정상이다.
   *
   * 소수점을 그대로 쓰면 마지막 자리 차이만으로 디싱크가 뜬다. 눈에 보이지
   * 않는 수준(0.1px)까지만 남기고 자른다.
   */
  private hash(): string {
    return this.stones
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((s) => `${s.id}:${s.body.position.x.toFixed(1)},${s.body.position.y.toFixed(1)}`)
      .join('|')
  }

  private count(owner: Player): number {
    return this.stones.filter((s) => s.owner === owner).length
  }

  private emit(): void {
    this.onChange({
      mode: this.mode,
      turn: this.turn,
      black: this.mode === 'placement' ? STONE_COUNT : this.count('black'),
      white: this.mode === 'placement' ? STONE_COUNT : this.count('white'),
      settling: this.settling,
      placementValid: this.mode === 'placement' ? this.placementValid() : true,
    })
  }

  private get myTurn(): boolean {
    return this.mode === 'playing' && this.turn === this.myColor && !this.settling
  }

  // ---- 입력 -------------------------------------------------------------

  private handleDown(point: PointerPoint): void {
    const world = this.toWorld(point)

    if (this.mode === 'placement') {
      this.placingIndex = this.placement.findIndex(
        (p) => distance(world.x, world.y, p.x, p.y) <= STONE_RADIUS * 1.6,
      )
      return
    }

    if (!this.myTurn) return

    const hit = this.stones.find(
      (s) =>
        s.owner === this.myColor &&
        distance(world.x, world.y, s.body.position.x, s.body.position.y) <= STONE_RADIUS * 1.6,
    )
    if (!hit) return

    this.dragging = hit
    this.dragPoint = world
  }

  private handleMove(point: PointerPoint): void {
    const world = this.toWorld(point)

    if (this.mode === 'placement') {
      if (this.placingIndex < 0) return

      // 진영 밖으로는 아예 못 나가게 잡아둔다. 놓은 뒤에 빨간 경고를 띄우는
      // 것보다 손끝에서 막히는 편이 이유가 분명하다.
      const { min, max } = this.myHalf()
      this.placement[this.placingIndex] = {
        x: clamp(world.x, STONE_RADIUS, BOARD - STONE_RADIUS),
        y: clamp(world.y, min, max),
      }
      this.emit()
      return
    }

    if (!this.dragging) return
    this.dragPoint = world
  }

  private handleUp(point: PointerPoint): void {
    if (this.mode === 'placement') {
      this.placingIndex = -1
      this.emit()
      return
    }

    const stone = this.dragging
    this.dragging = null
    this.dragPoint = null
    if (!stone || !this.myTurn) return

    const world = this.toWorld(point)
    // 당긴 반대 방향으로 튕긴다(새총). 당긴 거리가 곧 세기다.
    const dx = stone.body.position.x - world.x
    const dy = stone.body.position.y - world.y
    const pulled = Math.hypot(dx, dy)
    if (pulled < 6) return

    const speed = (clamp(pulled, 0, MAX_PULL) / MAX_PULL) * MAX_FLICK_SPEED
    this.onFlickRequest(stone.id, (dx / pulled) * speed, (dy / pulled) * speed)
  }

  // ---- 좌표 변환 --------------------------------------------------------

  /** 화면(CSS px) → 물리 세계 좌표. */
  private toWorld(point: PointerPoint): PointerPoint {
    const { scale, offsetX, offsetY } = this.viewport()
    return { x: (point.x - offsetX) / scale, y: (point.y - offsetY) / scale }
  }

  /**
   * 화면 크기와 무관하게 판을 정사각형으로 유지하기 위한 변환값.
   * 물리 좌표를 화면 크기에 맞춰 바꾸면 리사이즈할 때마다 돌이 순간이동하므로,
   * 세계는 고정하고 그리기만 스케일한다. 반응형은 여기서 끝난다.
   */
  private viewport(): { scale: number; offsetX: number; offsetY: number } {
    const { width, height } = this.stage
    const scale = (Math.min(width, height) * 0.94) / BOARD
    return {
      scale,
      offsetX: (width - BOARD * scale) / 2,
      offsetY: (height - BOARD * scale) / 2,
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

    this.renderBoard(ctx)

    if (this.mode === 'placement') this.renderPlacement(ctx)
    else this.renderStones(ctx)

    ctx.restore()
  }

  private renderBoard(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#c98f4a'
    ctx.fillRect(0, 0, BOARD, BOARD)

    ctx.strokeStyle = 'rgba(60, 34, 12, 0.45)'
    ctx.lineWidth = 2
    for (let i = 1; i < 5; i += 1) {
      const p = (BOARD / 5) * i
      ctx.beginPath()
      ctx.moveTo(p, 0)
      ctx.lineTo(p, BOARD)
      ctx.moveTo(0, p)
      ctx.lineTo(BOARD, p)
      ctx.stroke()
    }

    // 중앙선. 배치 단계에서 진영 경계가 어디인지가 가장 중요한 정보다.
    ctx.strokeStyle = 'rgba(40, 20, 5, 0.7)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, BOARD / 2)
    ctx.lineTo(BOARD, BOARD / 2)
    ctx.stroke()
  }

  private renderPlacement(ctx: CanvasRenderingContext2D): void {
    const { min, max } = this.myHalf()

    ctx.fillStyle = 'rgba(90, 200, 150, 0.14)'
    ctx.fillRect(0, min - STONE_RADIUS, BOARD, max - min + STONE_RADIUS * 2)

    const valid = this.placementValid()
    for (const point of this.placement) {
      this.drawStone(ctx, point.x, point.y, this.myColor)

      if (!valid) {
        ctx.beginPath()
        ctx.arc(point.x, point.y, STONE_RADIUS + 3, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 110, 110, 0.9)'
        ctx.lineWidth = 3
        ctx.stroke()
      }
    }
  }

  private renderStones(ctx: CanvasRenderingContext2D): void {
    // 조준선은 당긴 쪽에만 그린다. 날아갈 방향에는 아무 표시도 하지 않는다 —
    // 눈대중으로 겨누는 것이 이 게임의 재미다.
    if (this.dragging && this.dragPoint) {
      const { position } = this.dragging.body
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.lineWidth = 4
      ctx.setLineDash([12, 8])
      ctx.beginPath()
      ctx.moveTo(position.x, position.y)
      ctx.lineTo(this.dragPoint.x, this.dragPoint.y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    for (const stone of this.stones) {
      const { x, y } = stone.body.position
      this.drawStone(ctx, x, y, stone.owner)

      if (stone.owner === this.myColor && this.myTurn) {
        ctx.beginPath()
        ctx.arc(x, y, STONE_RADIUS + 5, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(120, 220, 255, 0.75)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  private drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, owner: Player): void {
    ctx.beginPath()
    ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = owner === 'black' ? '#1b1b1f' : '#f4f4f6'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = owner === 'black' ? '#3a3a45' : '#c3c3cc'
    ctx.stroke()
  }
}
