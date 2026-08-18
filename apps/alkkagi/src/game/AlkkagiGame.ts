import { Bodies, Body, Composite, Engine } from 'matter-js'
import { GameLoop, PointerInput, clamp, distance } from '@gujuck/game-core'
import type { CanvasStage, PointerPoint } from '@gujuck/game-core'

/** 물리 세계의 논리 크기. 화면 크기가 바뀌어도 이 값은 변하지 않는다. */
const BOARD = 600
const STONE_RADIUS = 24
const MAX_PULL = 150
/**
 * 최대 세기로 튕겼을 때의 초기 속도(스텝당 이동 픽셀).
 *
 * 실측으로 정한 값이다. 17이면 240 정도 떨어진 돌을 맞혀 판(600) 밖으로
 * 밀어내고 약 2.7초 만에 멈춘다. 그리고 돌 지름(48)보다 작아야 한다 —
 * matter.js에는 연속 충돌 검사가 없어서 한 스텝 이동 거리가 지름을 넘으면
 * 돌끼리 그냥 통과해버린다.
 */
const MAX_FLICK_SPEED = 17
/** 이 속도 아래면 멈춘 것으로 본다. */
const REST_SPEED = 0.12

export type Player = 'black' | 'white'

export interface AlkkagiSnapshot {
  turn: Player
  black: number
  white: number
  winner: Player | null
  /** 돌이 아직 굴러가는 중이면 true. UI에서 입력을 막는 데 쓴다. */
  settling: boolean
}

interface Stone {
  body: Body
  owner: Player
}

export interface AlkkagiGameOptions {
  stage: CanvasStage
  onChange: (snapshot: AlkkagiSnapshot) => void
}

/**
 * 알까기.
 *
 * 여기가 물리 엔진(matter.js)에 의존하는 유일한 계층이다. matter.js는 이
 * 파일 밖으로 새어나가지 않고, @gujuck/game-core는 물리 엔진의 존재를 모른다.
 * 그래서 양궁이 다른 물리 구현을 쓰더라도 서로 간섭하지 않는다.
 *
 * 위에서 내려다보는 시점이라 중력은 0이다. 대신 frictionAir로 바닥 마찰을
 * 흉내 낸다 — 중력을 켜면 돌이 화면 아래로 쏟아진다.
 */
export class AlkkagiGame {
  private readonly stage: CanvasStage
  private readonly onChange: (snapshot: AlkkagiSnapshot) => void
  private readonly engine: Engine
  private readonly loop: GameLoop
  private readonly input: PointerInput

  private stones: Stone[] = []
  private turn: Player = 'black'
  private winner: Player | null = null
  private settling = false

  private dragging: Stone | null = null
  private dragPoint: PointerPoint | null = null

  constructor(options: AlkkagiGameOptions) {
    this.stage = options.stage
    this.onChange = options.onChange

    this.engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } })
    this.reset()

    this.input = new PointerInput({
      target: this.stage.canvas,
      onDown: (point) => this.handleDown(point),
      onMove: (point) => this.handleMove(point),
      onUp: (point) => this.handleUp(point),
    })

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    })
    this.loop.start()
  }

  reset(): void {
    Composite.clear(this.engine.world, false)
    this.stones = []
    this.turn = 'black'
    this.winner = null
    this.settling = false

    const gap = BOARD / 5
    for (let i = 0; i < 4; i += 1) {
      const x = gap * (i + 1)
      this.addStone('black', x, BOARD - gap)
      this.addStone('white', x, gap)
    }

    this.emit()
  }

  destroy(): void {
    this.loop.destroy()
    this.input.destroy()
    Composite.clear(this.engine.world, false)
    Engine.clear(this.engine)
  }

  private addStone(owner: Player, x: number, y: number): void {
    const body = Bodies.circle(x, y, STONE_RADIUS, {
      restitution: 0.82,
      friction: 0,
      // 바닥 마찰 대용. 값이 크면 금방 멈추고, 작으면 미끄러진다.
      frictionAir: 0.028,
      density: 0.0016,
    })
    Composite.add(this.engine.world, body)
    this.stones.push({ body, owner })
  }

  private update(dtSec: number): void {
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
      // 다 멈췄으니 차례를 넘긴다. 굴러가는 도중에 넘기면 다음 사람이
      // 아직 움직이는 돌을 칠 수 있어 순서가 무너진다.
      this.settling = false
      this.turn = this.turn === 'black' ? 'white' : 'black'
      this.checkWinner()
      this.emit()
    } else if (removed) {
      this.checkWinner()
      this.emit()
    }
  }

  private checkWinner(): void {
    const black = this.count('black')
    const white = this.count('white')
    if (black === 0) this.winner = 'white'
    else if (white === 0) this.winner = 'black'
  }

  private count(owner: Player): number {
    return this.stones.filter((s) => s.owner === owner).length
  }

  private emit(): void {
    this.onChange({
      turn: this.turn,
      black: this.count('black'),
      white: this.count('white'),
      winner: this.winner,
      settling: this.settling,
    })
  }

  // ---- 입력 -------------------------------------------------------------

  private handleDown(point: PointerPoint): void {
    if (this.winner !== null || this.settling) return

    const world = this.toWorld(point)
    const hit = this.stones.find(
      (s) =>
        s.owner === this.turn &&
        distance(world.x, world.y, s.body.position.x, s.body.position.y) <= STONE_RADIUS * 1.6,
    )
    if (!hit) return

    this.dragging = hit
    this.dragPoint = world
  }

  private handleMove(point: PointerPoint): void {
    if (!this.dragging) return
    this.dragPoint = this.toWorld(point)
  }

  private handleUp(point: PointerPoint): void {
    const stone = this.dragging
    this.dragging = null
    this.dragPoint = null
    if (!stone) return

    const world = this.toWorld(point)
    // 당긴 반대 방향으로 튕긴다(새총). 당긴 거리가 곧 세기다.
    const dx = stone.body.position.x - world.x
    const dy = stone.body.position.y - world.y
    const pulled = Math.hypot(dx, dy)
    if (pulled < 6) return

    // applyForce가 아니라 setVelocity를 쓴다. matter.js의 힘은 질량과
    // 타임스텝 제곱에 얽혀 있어 "얼마나 세게"가 직관적으로 안 잡히고,
    // 조금만 키워도 돌이 한 프레임에 수천 픽셀을 날아가 상대를 관통한다.
    // 튕기기는 순간 속도를 주는 동작이므로 속도를 직접 지정하는 편이
    // 예측 가능하고 관통 위험도 상한으로 막을 수 있다.
    const speed = (clamp(pulled, 0, MAX_PULL) / MAX_PULL) * MAX_FLICK_SPEED
    Body.setVelocity(stone.body, {
      x: (dx / pulled) * speed,
      y: (dy / pulled) * speed,
    })

    this.settling = true
    this.emit()
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
   * 세계는 고정하고 그리기만 스케일한다.
   */
  private viewport(): { scale: number; offsetX: number; offsetY: number } {
    const { width, height } = this.stage
    const scale = (Math.min(width, height) * 0.92) / BOARD
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
      ctx.beginPath()
      ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = stone.owner === 'black' ? '#1b1b1f' : '#f4f4f6'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = stone.owner === 'black' ? '#3a3a45' : '#c3c3cc'
      ctx.stroke()

      if (stone.owner === this.turn && this.winner === null && !this.settling) {
        ctx.beginPath()
        ctx.arc(x, y, STONE_RADIUS + 6, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(77, 141, 255, 0.9)'
        ctx.lineWidth = 3
        ctx.stroke()
      }
    }

    ctx.restore()
  }
}
