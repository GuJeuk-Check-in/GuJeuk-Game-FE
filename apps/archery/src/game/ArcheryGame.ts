import { Bodies, Body, Composite, Engine } from 'matter-js'
import { GameLoop, PointerInput, clamp, lerp } from '@gujuck/game-core'
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

/**
 * 조준으로 인정하는 최소 드래그(화면 px).
 *
 * 이 문턱이 없으면 캔버스를 한 번 탭한 것이 곧 조준이 된다.
 */
const MIN_DRAG_PX = 14
/** 쏠 수 있는 최대 각도. 이보다 위나 뒤로 조준하면 발사하지 않는다. */
const MAX_ANGLE = (85 * Math.PI) / 180

/**
 * 만개에 필요한 드래그 거리(화면 px).
 *
 * 세계 좌표가 아니라 화면 좌표로 재는 이유가 두 가지다. 카메라가 확대·이동해도
 * 당기는 감각이 그대로여야 하고, 궁수 좌표를 기준으로 재면 세로 화면에서 만개
 * 지점이 화면 밖으로 나가 아예 낼 수 없는 각도가 생긴다.
 */
function maxPullPx(view: ViewSize): number {
  return clamp(Math.min(view.width, view.height) * 0.32, 90, 220)
}
/**
 * 최대로 당겼을 때의 화살 초기 속도(스텝당 이동 픽셀).
 *
 * 실측으로 정했다. 이 값이 게임의 성격을 거의 결정한다.
 *
 * 사거리가 남으면 최적해가 "낮고 빠르게 쏘기"로 몰린다. 그게 왜 나쁜지는
 * 포물선이 안 보인다는 것보다 더 구체적이다 — 낮은 탄도는 궤적 정점 근처에서
 * 과녁을 만나는데, 정점에서는 수직 속도가 0이라 바람이 도달 시각을 바꿔도
 * 착탄 높이가 움직이지 않는다. 24에서는 25도(도달 시 vy 0.64)와 30도가
 * 바람 -1~+1을 통째로 무시하고 만점을 냈다. 바람을 읽을 이유가 사라진다.
 *
 * 19면 35~65도에서 정중앙에 필요한 세기가 0.89~0.99이고 비행이 49~102
 * 프레임이라 궤적이 눈에 보인다. 이 범위에서 바람을 무시하고 만점을 내는
 * 각도는 하나도 없다.
 *
 * 더 낮추면(18) 40~60도로 좁아지고 전부 만개해야 해서 세기로 조절할 여지가
 * 사라진다.
 */
const MAX_ARROW_SPEED = 19
/**
 * 바람 세기 1.0당 매 스텝 가해지는 수평 힘 계수.
 *
 * 40도로 정중앙을 조준(세기 0.92)해 놓고 바람만 바꾸면 점수가 이렇게 된다.
 *
 *   바람  -1   -0.5   0   +0.5   +1
 *   점수   6     9    10    9     8
 *
 * 무시하면 최대 4점을 잃고, 깃발을 보고 보정하면 만회할 수 있는 정도다.
 *
 * 이 표는 MAX_ARROW_SPEED와 같이 봐야 뜻이 있다. 계수는 그대로여도 속도가
 * 24였을 때는 어느 각도에서도 이 표가 나오지 않았다 — 낮은 탄도가 바람을
 * 구조적으로 무시했기 때문이다. 계수만 키우면(0.0002) 높은 탄도가 먼저
 * 운 싸움이 되고, 낮은 탄도는 여전히 무풍이나 다름없다.
 */
const WIND_FORCE = 0.00016
/** 과녁에 꽂힌 화살은 이만큼만 남긴다. 계속 쌓이면 과녁이 안 보인다. */
const MAX_STUCK_ARROWS = 12
/**
 * 하늘과 땅을 세계 밖으로 이만큼 더 칠한다.
 *
 * 카메라가 움직이면 세계 경계 너머가 화면에 들어온다. 거기까지 칠하지 않으면
 * 배경색 그대로인 띠가 보인다. 세계를 넓히는 것보다 칠만 넘기는 편이 싸다.
 */
const BLEED = 700
/** 물리 갱신 간격. 미리 돌려보는 쪽과 화면이 같은 값을 써야 결과가 같다. */
const STEP_SEC = 1 / 60
/** 미리 돌려볼 때의 안전 상한. 여기 닿으면 잃은 화살로 본다. */
const MAX_FLIGHT_STEPS = 3000

export type Shooter = 'me' | 'them'

/**
 * 세계의 어디를 화면 어디에 보여줄지.
 *
 * 지금까지는 세계 전체를 항상 contain 했다. 궁수와 과녁이 680px 떨어져 있어서
 * 세로 화면에서는 과녁 링 간격이 4px까지 줄고 캔버스의 70%가 빈 배경이 된다.
 * 상용 양궁 게임이 하나같이 카메라를 움직이는 이유다.
 */
export interface Camera {
  /** 화면 한가운데가 바라보는 세계 좌표. */
  x: number
  y: number
  /** 1이면 세계 전체가 들어오는 배율. 크면 확대. */
  zoom: number
}

/** 세계 전체를 담는 카메라. 개편 전 화면과 같다. */
export const FULL_VIEW: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 }

/**
 * 조준할 때 보여줄 세계 영역.
 *
 * 궁수만 크게 잡으면 과녁이 화면 밖으로 나가 어디를 겨누는지 알 수 없다.
 * 사거리 전체를 보여주고, 과녁을 크게 보는 일은 조준경이 맡는다.
 */
const AIM_VIEW_W = 820
const AIM_VIEW_H = 430
/** 비행 중. 포물선이 눈에 들어오도록 조금 넓게 잡는다. */
const FLIGHT_VIEW_W = 700
const FLIGHT_VIEW_H = 440
/** 착탄 순간. 어느 링에 꽂혔는지 읽히는 크기다. */
const IMPACT_VIEW_W = 280
const IMPACT_VIEW_H = 210
/** 착탄 뒤 과녁을 보여주고 있는 시간(스텝). 60스텝이 1초다. */
const IMPACT_HOLD_STEPS = 54
/**
 * 조준경 안에서의 링 간격(화면 px).
 *
 * 창 크기로 배율을 정하면 큰 화면에서는 본 화면보다 오히려 작게 보인다.
 * 배율이 아니라 "링이 몇 px로 보일지"를 고정한다. 그러면 창이 클수록 과녁을
 * 더 넓게 담고, 작아도 링 간격은 유지된다.
 */
const SCOPE_RING_PX = 11
/**
 * 본 화면 링 간격이 이보다 좁을 때만 조준경을 띄운다.
 *
 * 넓은 화면에서는 본 화면만으로 어느 링인지 읽힌다. 그때도 창을 띄우면
 * 가리기만 하고 얻는 게 없다.
 */
const SCOPE_TRIGGER_RING_PX = 9
/** 조준경 반지름(화면 px). 화면 짧은 쪽에 비례한다. */
const SCOPE_MIN_R = 56
const SCOPE_MAX_R = 120

/** 카메라가 목표로 다가가는 비율. 스텝마다 남은 거리의 이만큼을 좁힌다. */
const CAMERA_EASE = 0.14
/** 세계 위쪽으로 이만큼까지는 따라 올라가도 된다. 높은 탄도를 담기 위함이다. */
const CAMERA_SKY_MARGIN = 260

export interface ViewSize {
  width: number
  height: number
}

/**
 * 카메라를 화면 변환으로 바꾼다.
 *
 * 순수 함수로 둔 이유는 이 값이 조준 좌표 변환과 렌더 양쪽에 쓰이기 때문이다.
 * 둘이 어긋나면 누른 자리와 그려지는 자리가 달라진다.
 */
/** 이 세계 영역이 다 보이는 배율. 화면 비율이 달라도 같은 범위를 담는다. */
export function zoomToFit(view: ViewSize, worldW: number, worldH: number): number {
  const base = Math.min(view.width / WORLD_W, view.height / WORLD_H)
  const need = Math.min(view.width / worldW, view.height / worldH)
  return need / base
}

/** 이 배율에서 화면에 들어오는 세계 크기. */
export function visibleSize(view: ViewSize, zoom: number): { w: number; h: number } {
  const base = Math.min(view.width / WORLD_W, view.height / WORLD_H)
  const scale = base * zoom
  return { w: view.width / scale, h: view.height / scale }
}

/**
 * 보이는 영역이 세계를 벗어나지 않게 중심을 당긴다.
 *
 * 가로는 세계 밖을 보여줄 이유가 없다(하늘도 땅도 거기서 끝난다). 세로는
 * 위로만 여유를 준다 — 높은 탄도는 세계 천장 위로 올라간다.
 */
export function clampCamera(view: ViewSize, camera: Camera): Camera {
  const vis = visibleSize(view, camera.zoom)
  const halfW = vis.w / 2
  const halfH = vis.h / 2

  const x = vis.w >= WORLD_W ? WORLD_W / 2 : clamp(camera.x, halfW, WORLD_W - halfW)

  const top = -CAMERA_SKY_MARGIN + halfH
  const bottom = WORLD_H - halfH
  const y =
    vis.h >= WORLD_H + CAMERA_SKY_MARGIN
      ? WORLD_H / 2
      : clamp(camera.y, Math.min(top, bottom), bottom)

  return { x, y, zoom: camera.zoom }
}

/** 조준 중. 궁수부터 과녁까지 사거리 전체를 담는다. */
export function aimCamera(view: ViewSize): Camera {
  const zoom = zoomToFit(view, AIM_VIEW_W, AIM_VIEW_H)
  return clampCamera(view, { x: 440, y: 300, zoom })
}

/** 비행 중. 화살을 따라간다. */
export function flightCamera(view: ViewSize, x: number, y: number): Camera {
  return clampCamera(view, { x, y, zoom: zoomToFit(view, FLIGHT_VIEW_W, FLIGHT_VIEW_H) })
}

/** 조준경 안. 링 간격을 고정해 두고 과녁을 담는다. */
export function scopeCamera(scopeView: ViewSize): Camera {
  const base = Math.min(scopeView.width / WORLD_W, scopeView.height / WORLD_H)
  return { x: TARGET_X, y: TARGET_Y, zoom: SCOPE_RING_PX / RING_STEP / base }
}

/** 착탄 직후. 과녁으로 붙어 어디에 꽂혔는지 보여준다. */
export function impactCamera(view: ViewSize): Camera {
  return clampCamera(view, {
    x: TARGET_X,
    y: TARGET_Y,
    zoom: zoomToFit(view, IMPACT_VIEW_W, IMPACT_VIEW_H),
  })
}

export function cameraTransform(
  view: ViewSize,
  camera: Camera,
): { scale: number; offsetX: number; offsetY: number } {
  // zoom 1이 세계 전체가 들어오는 배율이 되도록 기준 배율을 먼저 잡는다.
  const base = Math.min(view.width / WORLD_W, view.height / WORLD_H)
  const scale = base * camera.zoom
  return {
    scale,
    offsetX: view.width / 2 - camera.x * scale,
    offsetY: view.height / 2 - camera.y * scale,
  }
}

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
  /** 지금 조준 중인 각도(도). 당기고 있지 않으면 null. */
  angleDeg: number | null
  /** 화살이 날거나 착탄을 보여주는 중. 결과창은 이게 끝난 뒤에 띄운다. */
  busy: boolean
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
  /** 발사할 때 확정해 두는 결과. 화면은 이걸 보여주기만 한다. */
  private arrowResult: ShotResult | null = null
  private arrowImpactAngle = 0
  private arrowSteps = 0
  private flownSteps = 0
  /** 화면이 멈춰도 착탄시키는 안전망. */
  private landTimer: ReturnType<typeof setTimeout> | null = null
  private trail: PointerPoint[] = []
  private stuck: StuckArrow[] = []

  /** 내 차례이고 아직 안 쐈을 때만 true. */
  private armed = false
  private wind = 0

  /** 지금 보고 있는 곳. 매 스텝 목표 쪽으로 조금씩 다가간다. */
  private camera: Camera = FULL_VIEW
  /** 착탄 뒤 과녁을 보여주고 있는 남은 스텝. */
  private impactHold = 0
  /** 방금 꽂힌 발. 착탄 표시에 쓴다. */
  private impact: { score: number; y: number; by: Shooter } | null = null
  /** 루프가 멈춰 있어도 착탄 표시를 끝내는 안전망. */
  private holdTimer: ReturnType<typeof setTimeout> | null = null

  private aiming = false
  /** 누른 지점과 지금 끌고 있는 지점. 둘 다 화면 좌표다. */
  private downPoint: PointerPoint | null = null
  private dragPoint: PointerPoint | null = null
  /** 드래그 없이 정한 조준. 조작 도우미가 쓴다. */
  private assist: { angle: number; power: number } | null = null

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
      update: () => this.update(),
      render: () => this.render(),
      // 미리 돌려보는 쪽과 같은 스텝이어야 같은 결과가 나온다.
      fixedStepSec: STEP_SEC,
    })
    this.loop.start()
  }

  destroy(): void {
    this.clearArrow()
    this.clearHoldTimer()
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

  /**
   * 드래그 없이 조준한다.
   *
   * WCAG 2.2 AA는 드래그로만 할 수 있는 동작에 단일 포인터 대체 수단을 두도록
   * 요구한다. 지금 이 게임은 당겨서 쏘는 것 말고는 쏠 방법이 없다. 각도와
   * 세기를 값으로 받아 두면 버튼으로도, 키보드로도 쏠 수 있다.
   */
  setAssist(angleDeg: number | null, power = 0): void {
    this.assist =
      angleDeg === null ? null : { angle: (angleDeg * Math.PI) / 180, power: clamp(power, 0, 1) }
    this.emit()
  }

  /** 조작 도우미로 정해 둔 값으로 쏜다. 쏘지 못했으면 false. */
  fireAssist(): boolean {
    const aim = this.assist
    if (!aim || !this.armed || this.arrow !== null) return false
    if (aim.power <= 0 || aim.angle < 0 || aim.angle > MAX_ANGLE) return false

    this.armed = false
    this.launch({ angle: aim.angle, power: aim.power, wind: this.wind }, 'me')
    return true
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
    this.impactHold = 0
    this.impact = null
    this.clearHoldTimer()
    this.camera = aimCamera(this.stage)
    this.armed = false
    this.aiming = false
    this.downPoint = null
    this.dragPoint = null
    this.emit()
  }

  // ---- 발사 ---------------------------------------------------------------

  private launch(input: ShotInput, by: Shooter): void {
    this.clearArrow()

    // 결과를 발사 시점에 확정한다.
    //
    // 렌더 루프는 탭이 숨으면 멈춘다 — 브라우저가 rAF를 주지 않는다. 착탄
    // 보고가 렌더에 묶여 있으면 쏘자마자 탭을 벗어난 사람은 자기 점수를
    // 보내지 못하고, 차례가 시간 초과로 0점 처리된다. 결과를 먼저 정해 두면
    // 화면은 그걸 언제 보여줄지만 정하면 된다.
    const flight = simulate(input)

    this.arrow = spawnArrow(this.engine, input)
    this.arrowInput = input
    this.arrowBy = by
    this.arrowResult = flight.result
    this.arrowImpactAngle = flight.angle
    this.arrowSteps = flight.steps
    this.flownSteps = 0
    this.trail = []

    // 화면이 멈춰도 착탄은 일어나야 한다. setTimeout은 숨은 탭에서도 느리게나마
    // 깨어나므로 안전망이 된다. 정상이면 루프가 먼저 끝내고 이 타이머는 지워진다.
    this.landTimer = setTimeout(() => this.finishShot(), flight.steps * STEP_SEC * 1000 + 700)

    this.emit()
  }

  private update(): void {
    this.tickCamera()

    const arrow = this.arrow
    const input = this.arrowInput
    if (!arrow || !input) return

    stepArrow(this.engine, arrow, input.wind)

    this.trail.push({ x: arrow.position.x, y: arrow.position.y })
    if (this.trail.length > 70) this.trail.shift()

    this.flownSteps += 1
    // 어디에 맞았는지는 이미 정해져 있다. 여기서는 도착 시점만 본다.
    if (this.flownSteps >= this.arrowSteps) this.finishShot()
  }

  /**
   * 카메라를 목표 쪽으로 한 스텝 당긴다.
   *
   * 목표로 즉시 튀면 어지럽다. 남은 거리의 일정 비율만 좁히면 가까울수록 느려져
   * 멈추는 느낌이 자연스럽다. 물리와 무관하므로 결정성에는 영향이 없다.
   */
  private tickCamera(): void {
    if (this.impactHold > 0) {
      this.impactHold -= 1
      if (this.impactHold === 0) this.clearHoldTimer()
      // 착탄 표시가 끝나는 순간을 알린다. 결과창이 이걸 기다리고 있어서,
      // 여기서 알리지 않으면 busy가 true로 굳어 영영 안 뜬다.
      if (this.impactHold === 0) this.emit()
    }

    const want = this.desiredCamera()
    const now = this.camera
    this.camera = {
      x: lerp(now.x, want.x, CAMERA_EASE),
      y: lerp(now.y, want.y, CAMERA_EASE),
      zoom: lerp(now.zoom, want.zoom, CAMERA_EASE),
    }
  }

  /** 지금 상황에서 카메라가 있어야 할 자리. */
  private desiredCamera(): Camera {
    if (this.impactHold > 0) return impactCamera(this.stage)

    const arrow = this.arrow
    if (arrow) return flightCamera(this.stage, arrow.position.x, arrow.position.y)

    return aimCamera(this.stage)
  }

  /** 확정된 결과를 적용하고 알린다. 루프가 부르든 안전망이 부르든 같다. */
  private finishShot(): void {
    const input = this.arrowInput
    const result = this.arrowResult
    if (!input || !result) return

    if (result.outcome === 'target' && result.hitY !== null) {
      this.stuck.push({
        x: TARGET_X - TARGET_HALF_W,
        y: result.hitY,
        // 화면이 멈춘 채 안전망이 부르면 살아 있는 화살은 아직 출발 자세다.
        // 꽂히는 각도도 미리 구해 둔 값을 쓴다.
        angle: this.arrowImpactAngle,
        by: this.arrowBy,
      })
      // 오래된 것부터 걷어낸다. 계속 쌓이면 과녁이 화살에 덮인다.
      while (this.stuck.length > MAX_STUCK_ARROWS) this.stuck.shift()
    }

    // 과녁까지 간 발은 어디에 꽂혔는지 잠깐 보여준다. 땅에 떨어졌으면 볼 게 없다.
    if (result.outcome === 'target' || result.outcome === 'over') {
      this.impactHold = IMPACT_HOLD_STEPS
      this.impact = { score: result.score, y: result.hitY ?? TARGET_Y, by: this.arrowBy }
    } else {
      this.impact = null
    }

    // 맞은 순간은 눈보다 손이 먼저 안다. 내가 쏜 발에만 준다 — 상대 발마다
    // 울리면 성가시다.
    if (this.arrowBy === 'me') buzz(result.score)

    const by = this.arrowBy
    this.clearArrow()

    // 착탄 표시는 루프가 스텝을 세어 끝낸다. 그런데 탭이 숨어 루프가 멈춰 있으면
    // 영영 끝나지 않아 결과창이 안 뜬다. 발사 착탄과 같은 이유로 안전망을 둔다.
    if (this.impactHold > 0) {
      this.clearHoldTimer()
      this.holdTimer = setTimeout(
        () => {
          if (this.impactHold <= 0) return
          this.impactHold = 0
          this.emit()
        },
        IMPACT_HOLD_STEPS * STEP_SEC * 1000 + 500,
      )
    }

    this.emit()
    this.onShotLanded(input, result, by)
  }

  private clearHoldTimer(): void {
    if (this.holdTimer === null) return
    clearTimeout(this.holdTimer)
    this.holdTimer = null
  }

  private clearArrow(): void {
    if (this.landTimer !== null) {
      clearTimeout(this.landTimer)
      this.landTimer = null
    }
    if (this.arrow) Composite.remove(this.engine.world, this.arrow)
    this.arrow = null
    this.arrowInput = null
    this.arrowResult = null
    this.arrowSteps = 0
    this.flownSteps = 0
    this.trail = []
  }

  private emit(): void {
    const aim = this.aimState()
    this.onChange({
      canShoot: this.armed && this.arrow === null,
      flying: this.arrow !== null,
      pull: aim?.power ?? 0,
      angleDeg: aim ? (aim.angle * 180) / Math.PI : null,
      busy: this.arrow !== null || this.impactHold > 0,
    })
  }

  // ---- 입력 ---------------------------------------------------------------

  private handleDown(point: PointerPoint): void {
    if (!this.armed || this.arrow !== null) return
    // 누른 지점만 기억한다. 여기서 바로 조준을 켜면 탭 한 번이 곧 발사가 된다.
    this.downPoint = point
    this.dragPoint = null
    this.aiming = false
    this.emit()
  }

  private handleMove(point: PointerPoint): void {
    const down = this.downPoint
    if (!down) return

    // 누른 자리에서 충분히 끌어야 조준이 시작된다.
    if (!this.aiming && Math.hypot(point.x - down.x, point.y - down.y) < MIN_DRAG_PX) return

    this.aiming = true
    this.dragPoint = point
    this.emit()
  }

  private handleUp(): void {
    const aim = this.aimState()

    this.aiming = false
    this.downPoint = null
    this.dragPoint = null

    if (!aim || !this.armed || aim.power <= 0) {
      this.emit()
      return
    }
    // 뒤나 아래로 조준한 것은 실수다. 쏘면 화살만 버리므로 차례를 유지한다.
    if (aim.angle < 0 || aim.angle > MAX_ANGLE) {
      this.emit()
      return
    }

    this.armed = false
    this.launch({ angle: aim.angle, power: aim.power, wind: this.wind }, 'me')
  }

  /**
   * 지금 당기고 있는 각도와 세기. 당기는 중이 아니면 null.
   *
   * 누른 지점에서 얼마나 끌었는지로만 정한다. 궁수 좌표는 쓰지 않는다 — 전에는
   * 그 때문에 과녁 쪽을 한 번 탭한 것이 만개 조준으로 읽혔다.
   */
  private aimState(): { angle: number; power: number } | null {
    const down = this.downPoint
    const drag = this.dragPoint
    // 손으로 당기고 있지 않으면 조작 도우미가 정해 둔 값을 보여준다.
    if (!this.aiming || !down || !drag) return this.assist

    // 활을 당기듯 뒤로 끈다. 당긴 반대 방향으로 날아간다.
    const dx = down.x - drag.x
    const dy = down.y - drag.y
    const max = maxPullPx(this.stage)

    return {
      angle: Math.atan2(-dy, dx),
      power: clamp(Math.hypot(dx, dy), 0, max) / max,
    }
  }

  // ---- 렌더 ---------------------------------------------------------------

  private render(): void {
    this.stage.fill('#0f1420')
    this.renderScene(this.stage.ctx, this.camera, this.stage)
    this.drawScope(this.stage.ctx)
    // 게이지는 세계 변환 밖에서, 손가락 자리에 그린다.
    this.drawAimHud(this.stage.ctx)
  }

  /**
   * 한 카메라로 세계를 한 번 그린다.
   *
   * 카메라만 바꿔 여러 번 부를 수 있게 떼어 놓는다. 조준 중 과녁을 확대해
   * 보여주는 창이 이 함수를 같은 프레임에 한 번 더 부르는 것으로 끝난다.
   */
  private renderScene(ctx: CanvasRenderingContext2D, camera: Camera, view: ViewSize): void {
    const { scale, offsetX, offsetY } = cameraTransform(view, camera)

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
    this.drawImpact(ctx)

    ctx.restore()
  }

  private drawSky(ctx: CanvasRenderingContext2D): void {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
    sky.addColorStop(0, '#16203a')
    sky.addColorStop(1, '#243352')
    ctx.fillStyle = sky
    ctx.fillRect(-BLEED, -BLEED, WORLD_W + BLEED * 2, GROUND_Y + BLEED)
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#2c4a30'
    ctx.fillRect(-BLEED, GROUND_Y, WORLD_W + BLEED * 2, WORLD_H - GROUND_Y + BLEED)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-BLEED, GROUND_Y)
    ctx.lineTo(WORLD_W + BLEED, GROUND_Y)
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
    const pull = this.aimState()?.power ?? 0

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
   * 당긴 방향과 세기만 보여준다. 예상 낙하점은 그리지 않는다 — 어디에 떨어질지
   * 미리 보여주면 바람을 읽을 이유가 없어진다.
   */
  private drawAim(ctx: CanvasRenderingContext2D): void {
    const aim = this.aimState()
    if (!aim) return

    const length = 60 + aim.power * 150
    ctx.strokeStyle = 'rgba(245, 207, 61, 0.9)'
    ctx.lineWidth = 3
    ctx.setLineDash([10, 8])
    ctx.beginPath()
    ctx.moveTo(ARCHER_X, ARCHER_Y)
    ctx.lineTo(ARCHER_X + Math.cos(aim.angle) * length, ARCHER_Y - Math.sin(aim.angle) * length)
    ctx.stroke()
    ctx.setLineDash([])
  }

  /**
   * 방금 몇 점인지.
   *
   * 전에는 착탄 순간 화면에 아무 표시가 없어서, 하단 숫자칸을 다시 찾아봐야
   * 몇 점인지 알 수 있었다. 맞은 자리에 바로 띄운다. 세계 좌표에 그리므로
   * 확대창 안에도 같이 나온다.
   */
  private drawImpact(ctx: CanvasRenderingContext2D): void {
    const hit = this.impact
    if (!hit || this.impactHold <= 0) return

    // 끝날 때쯤 옅어진다. 갑자기 사라지면 놓친 것처럼 보인다.
    const fade = clamp(this.impactHold / (IMPACT_HOLD_STEPS * 0.4), 0, 1)
    ctx.save()
    ctx.globalAlpha = fade

    // 맞은 링을 한 번 둘러준다. 숫자보다 먼저 눈에 들어온다.
    const ring = Math.ceil(Math.abs(hit.y - TARGET_Y) / RING_STEP)
    if (ring >= 1 && ring <= RING_COUNT) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(TARGET_X, TARGET_Y, TARGET_HALF_W, RING_STEP * ring, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 점수. 과녁 왼쪽에 띄워 화살을 가리지 않는다.
    const x = TARGET_X - 62
    const y = hit.y
    ctx.fillStyle = hit.score === 0 ? 'rgba(232, 71, 75, 0.92)' : 'rgba(12, 16, 24, 0.86)'
    roundedRect(ctx, x - 30, y - 19, 60, 38, 10)
    ctx.fill()
    ctx.strokeStyle = hit.score === 10 ? '#f5cf3d' : 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.fillStyle = hit.score === 0 ? '#fff' : hit.score === 10 ? '#f5cf3d' : '#e9edf5'
    ctx.font = '800 25px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(hit.score === 0 ? 'MISS' : String(hit.score), x, y + 1)
    ctx.textBaseline = 'alphabetic'

    ctx.restore()
  }

  /**
   * 과녁 확대 조준경.
   *
   * 사거리 전체를 담으면 과녁이 작아지고, 과녁을 크게 잡으면 어디를 겨누는지
   * 알 수 없다. 상용 양궁 게임은 둘을 겹쳐서 푼다 — 넓은 시야 위에 확대창을
   * 얹는다. 여기서는 같은 renderScene을 카메라와 뷰포트만 바꿔 한 번 더 부르는
   * 것으로 끝난다. 그래서 과녁에 꽂힌 화살도 확대창에 그대로 보인다.
   */
  private drawScope(ctx: CanvasRenderingContext2D): void {
    // 내 차례에 조준할 수 있을 때만. 날아가는 동안에는 카메라가 따라간다.
    if (!this.armed) return

    // 본 화면만으로 링이 읽히면 띄우지 않는다.
    const mainScale = cameraTransform(this.stage, this.camera).scale
    if (mainScale * RING_STEP >= SCOPE_TRIGGER_RING_PX) return

    const { width, height } = this.stage
    const radius = clamp(Math.min(width, height) * 0.22, SCOPE_MIN_R, SCOPE_MAX_R)
    const cx = width - radius - 14
    const cy = radius + 14

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.clip()

    // 창을 하나의 작은 화면으로 본다. 원점을 창 왼쪽 위로 옮기고 창 크기를
    // 뷰포트로 넘기면 cameraTransform이 알아서 창 한가운데에 과녁을 놓는다.
    ctx.translate(cx - radius, cy - radius)
    const view: ViewSize = { width: radius * 2, height: radius * 2 }
    this.renderScene(ctx, scopeCamera(view), view)
    ctx.restore()

    // 테두리와 십자선
    ctx.save()
    ctx.strokeStyle = 'rgba(245, 207, 61, 0.85)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()

    const tick = radius * 0.18
    ctx.beginPath()
    ctx.moveTo(cx, cy - radius)
    ctx.lineTo(cx, cy - radius + tick)
    ctx.moveTo(cx, cy + radius)
    ctx.lineTo(cx, cy + radius - tick)
    ctx.moveTo(cx - radius, cy)
    ctx.lineTo(cx - radius + tick, cy)
    ctx.moveTo(cx + radius, cy)
    ctx.lineTo(cx + radius - tick, cy)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * 당김 게이지. 세계가 아니라 화면 좌표에 그린다.
   *
   * 세계에 그리면 카메라가 움직일 때 손가락에서 떨어진다. 지금 얼마나 당겼는지는
   * 손이 있는 자리에 붙어 있어야 읽힌다.
   */
  private drawAimHud(ctx: CanvasRenderingContext2D): void {
    const aim = this.aimState()
    const drag = this.dragPoint
    if (!aim || !drag) return

    const radius = 34
    ctx.save()
    ctx.translate(drag.x, drag.y)

    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = aim.power > 0.92 ? '#e8604c' : '#f5cf3d'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * aim.power)
    ctx.stroke()
    ctx.lineCap = 'butt'

    ctx.fillStyle = '#e9edf5'
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.round((aim.angle * 180) / Math.PI)}°`, 0, -radius - 10)
    ctx.fillText(`${Math.round(aim.power * 100)}%`, 0, radius + 20)

    ctx.restore()
  }
}

/**
 * 모서리가 둥근 사각형 경로.
 *
 * ctx.roundRect는 비교적 최근에 들어왔다. 스마트 TV 내장 브라우저까지 보면
 * 없는 곳이 있어서, 없으면 각진 사각형으로 떨어뜨린다.
 */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.rect(x, y, w, h)
}

/**
 * 착탄 진동.
 *
 * 정곡은 조금 길게 울려 다른 점수와 구분되게 한다. 지원하지 않는 기기에서는
 * 조용히 넘어간다.
 */
function buzz(score: number): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(score === 10 ? [12, 40, 22] : score === 0 ? 6 : 10)
}

/** 화살 하나를 세계에 넣는다. 화면용과 미리 돌려보는 쪽이 같아야 한다. */
function spawnArrow(engine: Engine, input: ShotInput): Body {
  const arrow = Bodies.rectangle(ARCHER_X, ARCHER_Y, 34, 4, {
    frictionAir: 0.004,
    density: 0.002,
  })
  Composite.add(engine.world, arrow)

  const speed = input.power * MAX_ARROW_SPEED
  Body.setVelocity(arrow, {
    x: Math.cos(input.angle) * speed,
    y: -Math.sin(input.angle) * speed,
  })
  return arrow
}

/**
 * 화살을 한 스텝 민다. 착탄했으면 결과를, 아직 날고 있으면 null을 준다.
 *
 * 화면과 미리 돌려보는 쪽이 이 함수 하나를 같이 쓴다. 두 벌로 두면 언젠가
 * 한쪽만 고쳐져서 점수와 그림이 어긋난다.
 */
function stepArrow(engine: Engine, arrow: Body, wind: number): ShotResult | null {
  // 과녁 평면을 지나는 순간의 높이를 구하려면 스텝 이전 위치가 필요하다.
  // position은 Engine.update가 제자리에서 고치므로 숫자를 복사해 둔다.
  const prevX = arrow.position.x
  const prevY = arrow.position.y

  // 바람은 매 스텝 더해지는 수평 상수력이다. 한 번만 주면 초속만 바뀌고
  // 비행 중 휘어지는 느낌이 안 난다.
  Body.applyForce(arrow, arrow.position, { x: wind * WIND_FORCE * arrow.mass, y: 0 })
  Engine.update(engine, STEP_SEC * 1000)

  // 화살은 진행 방향을 향하게 돌려준다. 물리적으로는 필요 없지만 이게 없으면
  // 옆으로 누운 채 날아가 어색하다.
  Body.setAngle(arrow, Math.atan2(arrow.velocity.y, arrow.velocity.x))

  const { x, y } = arrow.position
  const plane = TARGET_X - TARGET_HALF_W

  if (x >= plane) {
    // 스텝이 끝난 위치는 평면을 최대 24px 지나쳐 있다. 그 좌표로 점수를 매기면
    // 실제 통과 높이와 최대 16px 어긋나는데, 링 간격이 10px이라 점수가 실제로
    // 바뀐다. 직전 위치와 이어 평면을 지나는 지점을 구한다.
    const hitY = crossingY(prevX, prevY, x, y, plane)

    // 평면을 지났다고 다 맞은 게 아니다. 이 조건은 x만 보므로 과녁 한참 위로
    // 넘어간 화살도 여기로 온다. 링 안팎을 갈라두지 않으면 0점짜리 화살이
    // 과녁 위 허공에 꽂힌 채 남는다.
    const outcome = Math.abs(hitY - TARGET_Y) <= RING_OUTER ? 'target' : 'over'
    const score = outcome === 'target' ? scoreFor(Math.abs(hitY - TARGET_Y)) : 0
    return { score, hitY, outcome }
  }
  if (y >= GROUND_Y) return { score: 0, hitY: null, outcome: 'ground' }
  if (x > WORLD_W + 100 || y > WORLD_H + 200) return { score: 0, hitY: null, outcome: 'out' }
  return null
}

/** 화면과 무관하게 이 발이 어떻게 끝나는지 미리 끝까지 돌려본다. */
function simulate(input: ShotInput): { result: ShotResult; steps: number; angle: number } {
  const engine = Engine.create()
  engine.gravity.y = 1
  const arrow = spawnArrow(engine, input)

  for (let steps = 1; steps <= MAX_FLIGHT_STEPS; steps += 1) {
    const result = stepArrow(engine, arrow, input.wind)
    if (result) {
      const angle = arrow.angle
      Engine.clear(engine)
      return { result, steps, angle }
    }
  }

  Engine.clear(engine)
  return { result: { score: 0, hitY: null, outcome: 'out' }, steps: MAX_FLIGHT_STEPS, angle: 0 }
}

/**
 * 두 스텝을 직선으로 이어 x = plane 을 지나는 높이를 구한다.
 *
 * 물리 스텝은 이산적이라 평면을 정확히 밟지 않는다. 보간하지 않으면 착탄점이
 * 스텝 크기에 따라 흔들리고, 꽂힌 화살도 실제 통과 높이보다 아래에 그려진다.
 */
export function crossingY(
  prevX: number,
  prevY: number,
  x: number,
  y: number,
  plane: number,
): number {
  const dx = x - prevX
  // 뒤로 가거나 제자리면 이을 구간이 없다.
  if (dx <= 0) return y
  return prevY + (y - prevY) * clamp((plane - prevX) / dx, 0, 1)
}

/** 중심에서 떨어진 거리로 점수를 정한다. 가장 바깥 링을 넘으면 0점. */
export function scoreFor(distanceFromCenter: number): number {
  const ring = Math.ceil(distanceFromCenter / RING_STEP)
  if (ring > RING_COUNT) return 0
  // 안쪽(ring 1)이 10점, 바깥(ring 10)이 1점.
  return RING_COUNT + 1 - Math.max(1, ring)
}
