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
 * 한 프레임의 물리를 몇 번에 나눠 계산할지.
 *
 * matter.js에는 연속 충돌 검사가 없어서 한 번의 갱신에서 움직인 거리가 돌
 * 지름(48)을 넘으면 돌끼리 그냥 통과한다. 세게 칠 수 있게 하려면 이동 거리를
 * 쪼개는 수밖에 없다. 4분할이면 최대 세기에서도 한 번에 약 8px만 움직인다.
 *
 * 고정 횟수여야 한다. 속도에 따라 분할 수를 바꾸면 두 클라의 계산 순서가
 * 달라져 락스텝이 깨진다.
 */
const PHYSICS_SUBSTEPS = 4
/**
 * 최대 세기로 튕겼을 때의 초기 속도(갱신당 이동 픽셀).
 *
 * 기준은 "빈 판에서 얼마나 굴러가는가"다. 판 한 변이 600px인데 이 값이 24면
 * 최대로 당겼을 때 약 850px을 굴러간다 — 판을 한 번 가로지르고도 남는다.
 * 32까지 올려봤더니 1130px이라 판 두 개를 지나가 버려서 조준이 의미가 없었다.
 *
 * 절반 당김에서는 297px로, 분할 계산을 넣기 전 값(17 선형)과 정확히 같다.
 * 즉 평소 감각은 그대로 두고 끝에서만 여유를 준 값이다.
 */
const MAX_FLICK_SPEED = 24
/**
 * 세기 곡선의 지수. 1이면 당긴 만큼 선형으로 세진다.
 *
 * 최대치만 올리고 선형을 유지하면 살짝 당긴 샷까지 같이 세져서 미세 조정이
 * 안 된다. 1.5를 주면 약하게 치는 감각은 예전과 거의 같고 끝에서만 크게 붙는다.
 */
const FLICK_CURVE = 1.5
/** 이 속도 아래면 멈춘 것으로 본다. */
const REST_SPEED = 0.12
/**
 * 배치할 때 돌 중심이 유지해야 하는 최소 거리.
 *
 * 지름에 아주 작은 여유를 더한다. 정확히 지름으로 밀어내면 부동소수점 오차로
 * 47.99999가 나와 "겹쳤다"는 검사에 걸리는 경우가 생긴다.
 */
const MIN_PLACEMENT_GAP = STONE_RADIUS * 2 + 0.01
/** 밀어내기를 몇 번까지 되풀이할지. 좁은 틈에서 자리를 잡으려면 여러 번 필요하다. */
const RESOLVE_PASSES = 6

/** GROW 스킬로 커지는 최대 배율. 지름이 1.6배면 맞히기가 눈에 띄게 쉬워진다. */
const GROW_MAX_SCALE = 1.6
/** 최대 크기까지 부풀어 오르는 데 걸리는 물리 갱신 수. 240분할 기준 약 0.15초. */
const GROW_RAMP_TICKS = 36
/** 이 속도 아래로 느려지면 원래 크기로 돌아온다. */
const GROW_KEEP_SPEED = 6

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
  /** 아직 안 쓴 스킬. */
  skillsLeft: Skill[]
  /** 지금 이 순간 걸 수 있는 스킬. 버튼 활성 여부가 이 값이다. */
  usableSkills: Skill[]
  /** 지금 대상을 고르는 중인 스킬. 없으면 null. */
  armingSkill: Skill | null
}

export type Skill = 'GROW' | 'ANCHOR'

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
  /** 스킬 대상을 골랐을 때. 물리 반영은 서버가 되돌려준 뒤에 한다. */
  onSkillRequest: (skill: Skill, stoneId: number) => void
  /**
   * 돌이 다 멈췄을 때. 최종 상태 해시와 남은 돌 수, 그리고 어느 쪽이 먼저
   * 0개가 됐는지를 서버로 보고한다.
   *
   * firstZero가 필요한 이유는 마지막 한 개씩 남은 상황 때문이다. 친 돌과 맞은
   * 돌이 함께 판을 나가면 양쪽 다 0개가 되는데, 남은 개수만 보고해서는 누가
   * 먼저 비었는지 알 수 없다. 정확히 같은 순간이면 null이다.
   */
  onSettled: (hash: string, black: number, white: number, firstZero: Player | null) => void
}

interface Stone {
  id: number
  body: Body
  owner: Player
  /** 현재 반지름 배율. GROW가 걸린 돌만 1이 아니다. */
  scale: number
  /** GROW가 걸려 있고 아직 안 친 상태. */
  growArmed: boolean
  /** GROW가 걸린 채 날아가는 중. 이 값이 있으면 몇 갱신째인지 센다. */
  growTicks: number | null
  /** ANCHOR로 박혀 있는지. */
  anchored: boolean
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
  private readonly onSkillRequest: (skill: Skill, stoneId: number) => void
  private readonly onSettled: (
    hash: string,
    black: number,
    white: number,
    firstZero: Player | null,
  ) => void

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

  /**
   * 화면을 180° 돌려 그릴지.
   *
   * 내 진영은 언제나 화면 아래여야 한다. 세계 좌표에서 흑은 아래, 백은 위에
   * 고정돼 있으므로 백을 잡은 쪽만 뒤집어 본다.
   *
   * **뒤집는 것은 보이는 것뿐이다.** 물리 세계를 뒤집으면 두 클라의 시뮬레이션이
   * 달라져 락스텝이 깨진다. 좌표 변환(toWorld)과 그리기에만 적용한다.
   */
  private readonly flipped: boolean

  /** 물리 갱신 횟수. 어느 쪽이 먼저 비었는지 재는 시계다. */
  private tick = 0
  /** 각 색이 0개가 된 시점(tick). 아직이면 null. */
  private zeroAt: Record<Player, number | null> = { black: null, white: null }

  private skillsLeft: Skill[] = ['GROW', 'ANCHOR']
  private armingSkill: Skill | null = null

  constructor(options: AlkkagiGameOptions) {
    this.stage = options.stage
    this.myColor = options.myColor
    this.flipped = options.myColor === 'white'
    this.onChange = options.onChange
    this.onFlickRequest = options.onFlickRequest
    this.onSkillRequest = options.onSkillRequest
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

  /**
   * 끌고 있는 돌을 진영 안에서 다른 돌과 겹치지 않는 자리로 옮긴다.
   *
   * 겹친 채로 두고 경고를 띄우는 대신 아예 못 겹치게 막는다. 손끝이 다른 돌
   * 위로 들어가면 그 돌 둘레를 따라 미끄러지므로, 붙여 놓으려 할 때 자연스럽게
   * 옆자리를 찾아간다.
   *
   * **자리를 검사해서 통과한 위치만 돌려준다.** 밀어낸 결과가 진영 밖이면
   * 다시 안으로 잡아넣어야 하는데, 그 자리가 또 다른 돌 위일 수 있다. 구석에
   * 돌이 몰리면 이 왕복이 끝나지 않아 겹친 채로 끝나는 경우가 실제로 나온다.
   * 그래서 후보를 만들어 보고, 어느 것도 통과하지 못하면 제자리에 둔다.
   */
  private resolvePlacement(index: number, desired: PointerPoint): PointerPoint {
    const contained = this.contain(desired)
    if (this.isFreeSpot(index, contained)) return contained

    const pushed = this.pushOut(index, contained)
    if (this.isFreeSpot(index, pushed)) return pushed

    // 갈 수 있는 자리가 없다. 움직이지 않는 편이 겹치는 것보다 낫다.
    return this.placement[index]
  }

  /** 판과 내 진영 안으로 잡아넣는다. */
  private contain(point: PointerPoint): PointerPoint {
    const { min, max } = this.myHalf()
    return {
      x: clamp(point.x, STONE_RADIUS, BOARD - STONE_RADIUS),
      y: clamp(point.y, min, max),
    }
  }

  /** 그 자리가 진영 안이고 어느 돌과도 겹치지 않는지. */
  private isFreeSpot(index: number, point: PointerPoint): boolean {
    const { min, max } = this.myHalf()
    if (point.x < STONE_RADIUS || point.x > BOARD - STONE_RADIUS) return false
    if (point.y < min || point.y > max) return false

    return this.placement.every(
      (other, i) => i === index || distance(point.x, point.y, other.x, other.y) >= STONE_RADIUS * 2,
    )
  }

  /** 겹친 돌들 바깥으로 밀어낸다. 한 번 밀면 다른 돌에 닿을 수 있어 되풀이한다. */
  private pushOut(index: number, from: PointerPoint): PointerPoint {
    let point = from

    for (let pass = 0; pass < RESOLVE_PASSES; pass += 1) {
      let pushed = false

      for (let i = 0; i < this.placement.length; i += 1) {
        if (i === index) continue

        const other = this.placement[i]
        const dx = point.x - other.x
        const dy = point.y - other.y
        const gap = Math.hypot(dx, dy)
        if (gap >= MIN_PLACEMENT_GAP) continue

        // 정확히 포개지면 밀어낼 방향이 없다. 그때는 위쪽으로 정한다.
        const nx = gap > 0.0001 ? dx / gap : 0
        const ny = gap > 0.0001 ? dy / gap : -1

        point = { x: other.x + nx * MIN_PLACEMENT_GAP, y: other.y + ny * MIN_PLACEMENT_GAP }
        pushed = true
      }

      point = this.contain(point)
      if (!pushed) break
    }

    return point
  }

  // ---- 대국 -------------------------------------------------------------

  /** 서버가 확정한 배치와 선공으로 판을 시작한다. 양쪽이 같은 값을 받는다. */
  startGame(stones: PlacedStone[], turn: Player): void {
    Composite.clear(this.engine.world, false)
    this.stones = stones.map((stone) => this.createStone(stone))
    this.mode = 'playing'
    this.turn = turn
    this.settling = false
    this.tick = 0
    this.zeroAt = { black: null, white: null }
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

    if (stone.growArmed) {
      stone.growArmed = false
      stone.growTicks = 0
    }

    this.settling = true
    this.emit()
  }

  /** 스킬 버튼을 눌렀을 때. 이제 돌을 고르면 발동한다. 같은 걸 다시 누르면 취소. */
  armSkill(skill: Skill): void {
    if (!this.canUse(skill)) return

    this.armingSkill = this.armingSkill === skill ? null : skill
    this.emit()
  }

  /**
   * 지금 그 스킬을 걸 수 있는지.
   *
   * GROW는 내 차례에 쓴다(이어서 그 돌로 쳐야 하므로).
   * ANCHOR는 반대로 상대 차례에만 쓴다 — 들어오는 샷을 막는 것이 목적이다.
   */
  private canUse(skill: Skill): boolean {
    if (this.mode !== 'playing' || this.settling) return false
    if (!this.skillsLeft.includes(skill)) return false

    return skill === 'GROW' ? this.turn === this.myColor : this.turn !== this.myColor
  }

  cancelSkill(): void {
    this.armingSkill = null
    this.emit()
  }

  /**
   * 서버가 중계한 스킬을 반영한다. 건 사람에게도 이 경로로 돌아온다.
   *
   * GROW는 바로 커지지 않는다. 그 돌을 실제로 칠 때부터 부풀어 오른다.
   * ANCHOR는 즉시 정적 바디로 바꾼다 — matter.js에서 정적 바디는 질량이
   * 무한이라 부딪힌 쪽만 튕겨나간다.
   */
  applySkill(skill: Skill, stoneId: number, by: Player): void {
    const stone = this.stones.find((s) => s.id === stoneId)
    if (!stone) return

    if (by === this.myColor) {
      this.skillsLeft = this.skillsLeft.filter((s) => s !== skill)
      this.armingSkill = null
    }

    if (skill === 'GROW') stone.growArmed = true
    else {
      stone.anchored = true
      Body.setStatic(stone.body, true)
    }

    this.emit()
  }

  /**
   * 커졌다 줄어드는 과정. 갱신 횟수와 속도로만 정해지므로 두 클라가 같은 값을 낸다.
   *
   * 부풀어 오르는 데 시간을 두는 이유는 "가면서 커진다"는 게 스킬의 모습이기
   * 때문이다. 치자마자 커지면 그냥 큰 돌로 치는 것과 다르지 않다.
   * 느려지면 저절로 원래 크기로 돌아온다.
   */
  private updateGrow(stone: Stone): void {
    if (stone.growTicks === null) return

    stone.growTicks += 1

    const ramp = clamp(stone.growTicks / GROW_RAMP_TICKS, 0, 1)
    const keep = clamp(Body.getSpeed(stone.body) / GROW_KEEP_SPEED, 0, 1)
    const target = 1 + (GROW_MAX_SCALE - 1) * ramp * keep

    // matter.js는 배율을 누적 적용한다. 현재 대비 비율로 넘겨야 한다.
    const factor = target / stone.scale
    Body.scale(stone.body, factor, factor)
    stone.scale = target

    if (target <= 1.0001 && ramp >= 1) {
      this.resetScale(stone)
      stone.growTicks = null
    }
  }

  private resetScale(stone: Stone): void {
    if (stone.scale === 1) return
    const factor = 1 / stone.scale
    Body.scale(stone.body, factor, factor)
    stone.scale = 1
  }

  private createStone(stone: PlacedStone): Stone {
    const body = Bodies.circle(stone.x, stone.y, STONE_RADIUS, {
      restitution: 0.82,
      friction: 0,
      /*
       * 바닥 마찰 대용. 값이 크면 금방 멈추고, 작으면 미끄러진다.
       *
       * 분할 계산을 넣어도 이 값은 그대로 둔다. matter.js가 frictionAir를
       * 기준 delta(16.7ms) 대비 비율로 스스로 보정하기 때문에, 분할 수를
       * 1에서 8로 바꿔도 감속은 같다. 여기서 직접 보정하면 이중으로 걸린다.
       */
      frictionAir: 0.028,
      density: 0.0016,
    })
    Composite.add(this.engine.world, body)
    return {
      id: stone.id,
      body,
      owner: stone.owner,
      scale: 1,
      growArmed: false,
      growTicks: null,
      anchored: false,
    }
  }

  private update(dtSec: number): void {
    if (this.mode !== 'playing') return

    // 탈락 검사를 분할 갱신 **안에서** 한다. 마지막 한 개씩 남아 함께 나가는
    // 상황에서 누가 먼저 비었는지를 프레임보다 잘게 가려내야 하기 때문이다.
    const stepMs = (dtSec * 1000) / PHYSICS_SUBSTEPS
    let removed = false
    for (let i = 0; i < PHYSICS_SUBSTEPS; i += 1) {
      Engine.update(this.engine, stepMs)
      for (const stone of this.stones) this.updateGrow(stone)
      if (this.removeFallenStones()) removed = true
    }

    const moving = this.stones.some((s) => Body.getSpeed(s.body) > REST_SPEED)

    if (this.settling && !moving) {
      // 다 멈췄으니 결과를 보고한다. 턴을 여기서 넘기지 않는다 — 순서는
      // 서버가 양쪽 보고를 대조한 뒤에 정한다.
      this.settling = false
      this.clearShotEffects()
      this.onSettled(this.hash(), this.count('black'), this.count('white'), this.firstZero())
      this.emit()
    } else if (removed) {
      this.emit()
    }
  }

  /** 판 밖으로 나간 돌을 지운다. 벽이 없는 게 알까기의 핵심 규칙이다. */
  private removeFallenStones(): boolean {
    this.tick += 1

    const survivors: Stone[] = []
    for (const stone of this.stones) {
      const { x, y } = stone.body.position
      // 중심이 선에 닿으면 절반이 나간 것이다. 그 이상은 떨어뜨린다.
      // 가장자리에 걸쳐 있어도 절반이 판 위에 남아 있으면 살아남는다.
      const out = x <= 0 || x >= BOARD || y <= 0 || y >= BOARD
      if (out) Composite.remove(this.engine.world, stone.body)
      else survivors.push(stone)
    }

    if (survivors.length === this.stones.length) return false
    this.stones = survivors

    for (const owner of ['black', 'white'] as const) {
      if (this.zeroAt[owner] === null && this.count(owner) === 0) this.zeroAt[owner] = this.tick
    }

    return true
  }

  /**
   * 한 샷이 끝나면 스킬 효과를 푼다. 둘 다 "그 샷 한 번"짜리다.
   *
   * ANCHOR는 건 다음 상대 샷 동안만 버틴다. 여기서 풀지 않으면 영원히 박힌
   * 돌이 되어 한 번 쓴 사람이 계속 유리해진다.
   */
  private clearShotEffects(): void {
    for (const stone of this.stones) {
      if (stone.growTicks !== null) {
        this.resetScale(stone)
        stone.growTicks = null
      }

      if (stone.anchored) {
        stone.anchored = false
        Body.setStatic(stone.body, false)
      }
    }
  }

  /**
   * 먼저 0개가 된 쪽. 그쪽이 진다.
   *
   * 마지막 한 개씩 남은 상태에서 친 돌과 맞은 돌이 함께 나가면 양쪽 다 0개가
   * 된다. 남은 개수만으로는 가릴 수 없어 비워진 시점을 비교한다.
   * 정확히 같은 갱신에서 비면 null이고, 그때의 판정은 서버가 정한다.
   */
  private firstZero(): Player | null {
    const { black, white } = this.zeroAt

    if (black !== null && white !== null) {
      if (black === white) return null
      return black < white ? 'black' : 'white'
    }

    if (black !== null) return 'black'
    if (white !== null) return 'white'
    return null
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
      .map(
        (s) =>
          `${s.id}:${s.body.position.x.toFixed(1)},${s.body.position.y.toFixed(1)},${s.scale.toFixed(2)}`,
      )
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
      skillsLeft: [...this.skillsLeft],
      usableSkills: (['GROW', 'ANCHOR'] as Skill[]).filter((skill) => this.canUse(skill)),
      armingSkill: this.armingSkill,
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

    // 스킬 대상 고르기는 내 차례가 아니어도 된다(ANCHOR가 그렇다).
    const arming = this.armingSkill
    if (arming === null && !this.myTurn) return

    const hit = this.stones.find(
      (s) =>
        s.owner === this.myColor &&
        distance(world.x, world.y, s.body.position.x, s.body.position.y) <=
          STONE_RADIUS * s.scale * 1.6,
    )
    if (!hit) return

    // 스킬 대상을 고르는 중이면 여기서 끝난다. 끌지 않는다.
    if (arming !== null) {
      this.onSkillRequest(arming, hit.id)
      this.armingSkill = null
      this.emit()
      return
    }

    this.dragging = hit
    this.dragPoint = world
  }

  private handleMove(point: PointerPoint): void {
    const world = this.toWorld(point)

    if (this.mode === 'placement') {
      if (this.placingIndex < 0) return

      // 진영 밖으로도, 다른 돌 위로도 아예 못 가게 잡아둔다. 놓은 뒤에 빨간
      // 경고를 띄우는 것보다 손끝에서 막히는 편이 이유가 분명하다.
      this.placement[this.placingIndex] = this.resolvePlacement(this.placingIndex, world)
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

    const ratio = clamp(pulled, 0, MAX_PULL) / MAX_PULL
    const speed = MAX_FLICK_SPEED * Math.pow(ratio, FLICK_CURVE)
    this.onFlickRequest(stone.id, (dx / pulled) * speed, (dy / pulled) * speed)
  }

  // ---- 좌표 변환 --------------------------------------------------------

  /** 화면(CSS px) → 물리 세계 좌표. 뒤집어 보고 있으면 되돌려 준다. */
  private toWorld(point: PointerPoint): PointerPoint {
    const { scale, offsetX, offsetY } = this.viewport()
    const x = (point.x - offsetX) / scale
    const y = (point.y - offsetY) / scale

    return this.flipped ? { x: BOARD - x, y: BOARD - y } : { x, y }
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

    // 내 진영을 아래로 내린다. 판을 통째로 반 바퀴 돌리는 것과 같다.
    if (this.flipped) {
      ctx.translate(BOARD, BOARD)
      ctx.rotate(Math.PI)
    }

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
      this.drawStone(ctx, x, y, stone.owner, STONE_RADIUS * stone.scale)

      // 표시는 건 사람에게만 보인다. 상대는 부딪혀 보거나 커지는 걸 보고서야
      // 안다. 서버도 상대가 실제로 칠 때까지 알리지 않는다.
      const mine = stone.owner === this.myColor

      if (stone.anchored && mine) {
        ctx.beginPath()
        ctx.arc(x, y, STONE_RADIUS + 8, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 196, 84, 0.9)'
        ctx.lineWidth = 3
        ctx.setLineDash([6, 5])
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (stone.growArmed && mine) {
        ctx.beginPath()
        ctx.arc(x, y, STONE_RADIUS + 8, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(120, 255, 180, 0.9)'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      if (stone.owner === this.myColor && (this.myTurn || this.armingSkill !== null)) {
        ctx.beginPath()
        ctx.arc(x, y, STONE_RADIUS + 5, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(120, 220, 255, 0.75)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  private drawStone(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    owner: Player,
    radius: number = STONE_RADIUS,
  ): void {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = owner === 'black' ? '#1b1b1f' : '#f4f4f6'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = owner === 'black' ? '#3a3a45' : '#c3c3cc'
    ctx.stroke()
  }
}
