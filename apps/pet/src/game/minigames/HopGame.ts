// 폴짝 달리기 — 명세 §8.2.
//
// 원버튼 러너다. 세계가 왼쪽으로 흐르고 펫은 제자리에서 뛴다. 펫을 실제로
// 오른쪽으로 움직이지 않는 이유는 카메라가 생기기 때문이다 — 카메라가 생기면
// 스프라이트 위치가 소수로 떨어지고, 그 순간 도트가 뭉개진다(§11 도트 렌더링 규칙).
//
// **물리 엔진을 쓰지 않는다.** 필요한 것은 포물선 하나와 사각형 겹침 판정뿐이라
// matter.js 는 번들만 늘린다(§8).
//
// 이 파일이 지는 책임은 한 판의 진행뿐이다. 에너지 차감·코인·EXP 는 전혀 모르고,
// 끝났을 때 달린 거리(m)를 onEnd 로 넘기는 것으로 끝난다. 정산은 game/pet 이 한다.

import { GameLoop, PointerInput } from '@gujuck/game-core'
import { PALETTE_DARKEST, paletteCss } from '../palette'
import { PET_SPRITE } from '../sprites'
import type { PropSpriteName } from '../sprites'
import { GAME_HEIGHT, GAME_WIDTH, PixelStage } from './pixelStage'
import type { MinigameHost } from './types'

// ────────────────────────────────────────────────────────────────────────────
// 무대
// ────────────────────────────────────────────────────────────────────────────

/**
 * 바닥선(논리 y). 펫의 발바닥이 닿는 줄이다.
 *
 * 640 의 한가운데보다 아래로 내린 이유는 최대 점프(아래 MAX_JUMP_APEX ≈ 163px)에
 * 펫 키 115px 를 더한 278px 이 위로 필요하기 때문이다. 464 면 꼭대기가 y≈186 이라
 * 상단 거리 표시(y=40)와 겹치지 않는다.
 */
const GROUND_Y = 464

/**
 * 펫 히트박스의 왼쪽·크기.
 *
 * **그림보다 좁고 낮게 잡는다.** 펫 스프라이트의 불투명 폭은 아랫배에서 100px 나
 * 되는데(sprites.ts 의 실측), 그 폭을 그대로 판정에 쓰면 저속에서 최대 점프로도
 * 높은 선인장을 넘지 못하는 구간이 생긴다 — 느릴수록 장애물 옆에 머무는 시간이
 * 길어지기 때문이다. 60px 은 발치 실루엣(발바닥 근처 45~76px)에 맞춘 값이다.
 * 높이 96 은 펫 키 115 보다 낮은데, 이것이 "서 있으면 새 밑을 지나간다"를 만든다.
 */
const PET_X = 40
const PET_HIT_W = 60
const PET_HIT_H = 96

/** 스프라이트를 그릴 x. 불투명 영역의 가로 중심(centerX)을 히트박스 중앙에 맞춘다. */
const PET_DRAW_X = PET_X + PET_HIT_W / 2 - PET_SPRITE.centerX

/** 장애물이 나타나는 x. 화면 오른쪽 바로 밖이다. */
const SPAWN_X = GAME_WIDTH + 4

// ────────────────────────────────────────────────────────────────────────────
// 속도와 거리
// ────────────────────────────────────────────────────────────────────────────

const BASE_SPEED = 210
/** 초당 1.5% 증가, 2.5배에서 상한(§8.2). 상한까지 약 61초가 걸린다. */
const SPEED_GROWTH_PER_SEC = 0.015
const SPEED_MAX_FACTOR = 2.5
const MAX_SPEED = BASE_SPEED * SPEED_MAX_FACTOR

/**
 * 논리 픽셀 몇 개가 1m 인가.
 *
 * 점수는 달린 거리(m)이고 코인은 floor(m/10) 이다(§8.2). 24 로 잡으면 40초쯤
 * 버틴 판이 약 480m → 48코인이 되어 "잘하면 30~50코인"(§8)에 맞는다.
 */
const PX_PER_METER = 24

// ────────────────────────────────────────────────────────────────────────────
// 점프
//
// 탭하면 기본 점프, 누르고 있으면 상승 구간의 중력이 약해져 더 높이 뛴다.
// 눌림을 반영하는 것은 MAX_HOLD_SEC 까지다(§8.2).
// ────────────────────────────────────────────────────────────────────────────

const GRAVITY = 2000
const HOLD_GRAVITY = 1100
const JUMP_V0 = 620
const MAX_HOLD_SEC = 0.35

/** 공중에서 누른 입력을 이 시간만큼 기억했다가 착지하는 순간 써 준다. */
const JUMP_BUFFER_SEC = 0.12

// 최대 점프(끝까지 누른 경우)의 정점과 체공 시간. 아래 최소 간격 계산의 입력이라
// 상수를 손으로 적지 않고 위 값들에서 유도한다 — 중력이나 초기 속도를 고치면
// 간격 계산도 따라 바뀌어야 하는데, 두 벌로 갈리면 그 어긋남은 "가끔 못 넘는
// 배치가 나온다"로만 드러나 원인을 찾기 어렵다.
const HOLD_RISE = JUMP_V0 * MAX_HOLD_SEC - 0.5 * HOLD_GRAVITY * MAX_HOLD_SEC * MAX_HOLD_SEC
const HOLD_END_VY = JUMP_V0 - HOLD_GRAVITY * MAX_HOLD_SEC
const MAX_JUMP_APEX = HOLD_RISE + (HOLD_END_VY * HOLD_END_VY) / (2 * GRAVITY)
const MAX_AIR_SEC = MAX_HOLD_SEC + HOLD_END_VY / GRAVITY + Math.sqrt((2 * MAX_JUMP_APEX) / GRAVITY)

// ────────────────────────────────────────────────────────────────────────────
// 장애물
// ────────────────────────────────────────────────────────────────────────────

type ObstacleKind = 'cactusSmall' | 'cactusTall' | 'bird'

interface ObstacleSpec {
  readonly sprite: PropSpriteName
  /** 스프라이트 안에서 불투명 영역이 시작하는 x. 실측값이다. */
  readonly insetX: number
  readonly width: number
  readonly height: number
  /** 히트박스 아래변이 바닥선에서 얼마나 위에 있는가. 0 이면 바닥에 붙어 있다. */
  readonly bottomAboveGround: number
  /** 스프라이트 위쪽 변이 바닥선에서 얼마나 위에 있는가. */
  readonly drawTopAboveGround: number
  /** 위아래로 흔들리는가(새만). */
  readonly bobs: boolean
}

/**
 * 장애물 3종. 수치는 전부 PNG 의 알파 경계 상자를 실제로 재서 넣은 값이다.
 *
 * **두 선인장은 원본이 둘 다 48px 를 꽉 채운다.** 그림 자체로는 높이 차이가 없어서,
 * 낮은 선인장은 **바닥에 21px 묻어** 지면 위로 26px 만 남긴다. 스프라이트를
 * 축소해 낮추는 방법은 쓸 수 없다 — 비정수 배율은 도트를 뭉갠다(§12.3). 묻힌
 * 부분은 장애물을 바닥보다 먼저 그려서 가린다(render 참조).
 *
 * **새의 아래변은 서 있는 펫의 머리 위(132 > 펫 히트 96, 펫 그림 키 115)다.**
 * 그래서 가만히 있으면 지나가고, 뛰면 맞는다 — "안 뛰는 것"이 답이 되는 장애물이다.
 */
const OBSTACLES: Record<ObstacleKind, ObstacleSpec> = {
  cactusSmall: {
    sprite: 'prop-cactus-small',
    insetX: 9,
    width: 30,
    height: 26,
    bottomAboveGround: 0,
    drawTopAboveGround: 27,
    bobs: false,
  },
  cactusTall: {
    sprite: 'prop-cactus-tall',
    insetX: 9,
    width: 29,
    height: 46,
    bottomAboveGround: 0,
    drawTopAboveGround: 46,
    bobs: false,
  },
  bird: {
    sprite: 'prop-bird',
    insetX: 0,
    width: 48,
    height: 30,
    bottomAboveGround: 132,
    drawTopAboveGround: 170,
    bobs: true,
  },
}

/**
 * 착지 뒤 다음 장애물까지 확보하는 여유 시간(초).
 *
 * 최대 점프로 넘긴 직후에도 이만큼은 땅을 밟고 있게 된다. 사람의 반응 시간과
 * 입력 지연을 흡수하는 몫이다.
 */
const LANDING_SLACK_SEC = 0.2

/**
 * 간격을 지금 속도가 아니라 조금 빠른 속도로 계산한다.
 *
 * 장애물은 화면 밖(x=364)에서 나와 펫(x=100)까지 264px 를 오는데, 그 사이에도
 * 속도가 계속 오른다. 가장 느린 시작 속도(210px/s)에서도 이동에 1.26초뿐이고
 * 그동안의 증가는 1.015^1.26 ≈ 1.9% 다. 10% 를 얹어 두면 어떤 구간에서도
 * 통과 시점의 실제 속도가 계획에 쓴 속도를 넘지 않는다.
 */
const SPEED_LOOKAHEAD = 1.1

/** 간격에 얹는 무작위 여유의 최대 비율. 리듬이 기계적으로 반복되지 않게 한다. */
const GAP_JITTER = 0.55

/** 첫 장애물까지는 넉넉히 둔다. 시작하자마자 넘으라고 하면 조작을 읽을 틈이 없다. */
const FIRST_GAP_FACTOR = 2.2

/** 이 시간 전에는 새를 내보내지 않는다. 먼저 "뛰는 법"을 익히게 한다. */
const BIRD_UNLOCK_SEC = 8

/**
 * 직전 장애물과의 최소 간격(px). **이 함수가 §8.2 의 "클리어 불가능한 배치가
 * 나오면 안 된다"를 지탱한다.**
 *
 * 유도. 장애물은 전부 같은 x(SPAWN_X)에서 나오므로, 스폰 사이에 흐른 거리가 곧
 * 두 히트박스 왼쪽 변 사이의 간격 G 다. 속도 v 로 흐르는 세계에서 펫이
 *
 *   1) 앞 장애물을 최대 점프(체공 MAX_AIR_SEC)로 넘고,
 *   2) 착지한 뒤 다시 떠올라
 *   3) 뒤 장애물을 넘는다
 *
 * 를 할 수 있으려면, 뒤 장애물의 이상적인 도약 지점이 착지보다 뒤에 와야 한다.
 * 두 장애물이 같은 지점에서 같은 조건으로 처리되므로 도약 지점 사이의 시간 차는
 * 정확히 G/v 이고, 조건은 G/v ≥ MAX_AIR_SEC 이다. 여기에 반응 여유를 더해
 *
 *   G ≥ v × (MAX_AIR_SEC + LANDING_SLACK_SEC)
 *
 * 를 쓴다. **가장 체공이 긴 점프를 기준으로 잡는 것이 핵심이다** — 짧게 탭한
 * 점프는 더 빨리 내려오므로 이 간격이면 언제나 여유가 남는다.
 *
 * 넘는 것 자체가 가능한지는 별개의 조건인데(장애물 옆을 지나는 시간이 장애물
 * 높이 위에 머무는 시간보다 짧아야 한다) 그쪽은 최대 속도에서도 넉넉하다:
 * 최대 점프는 46px(가장 높은 선인장) 위에 0.73초 머물고, 최대 속도 525px/s 에서
 * 겹침 구간(60+29px)을 지나는 데는 0.17초뿐이다. 가장 빡빡한 조합은 오히려
 * **시작 속도에서 탭 점프**로, 0.42초 대 0.45초라 탭으로도 아슬아슬하게 넘어간다.
 */
function minGapPx(speed: number): number {
  // 위 SPEED_LOOKAHEAD 주석의 이유로 조금 빠른 속도를 가정하되, 상한을 넘지는
  // 않는다 — 이미 상한에 닿았으면 더 빨라질 여지가 없다.
  const planned = Math.min(speed * SPEED_LOOKAHEAD, MAX_SPEED)
  return planned * (MAX_AIR_SEC + LANDING_SLACK_SEC)
}

// ────────────────────────────────────────────────────────────────────────────
// 연출
// ────────────────────────────────────────────────────────────────────────────

/** 충돌 뒤 결과를 넘기기까지의 짧은 정지(§8.2 연출). 무슨 일이 났는지 보여 준다. */
const HIT_FREEZE_SEC = 0.5
/** 정지 동안 펫이 깜빡이는 주기. 맞았다는 것이 한눈에 읽힌다. */
const HIT_BLINK_SEC = 0.08

const DUST_LIFE_SEC = 0.32
const DUST_GRAVITY = 700
const LANDING_DUST_COUNT = 6
const HIT_DUST_COUNT = 12

interface Dust {
  x: number
  y: number
  vx: number
  vy: number
  /** 남은 수명(초). 0 이하면 지운다. */
  life: number
  size: number
}

// 팔레트에서 색을 고른다. hex 문자열을 `'#accce4'` 처럼 직접 적으면 팔레트가 두
// 벌로 갈린다(palette.ts 첫머리 참조). paletteCss 는 인자를 PaletteHex 로 받아
// 팔레트 밖 색을 컴파일에서 막는다 — 세 미니게임이 같은 방식을 쓴다.
const SKY_CSS = paletteCss('accce4') // 하늘
const HILL_CSS = paletteCss('b3e3da') // 먼 언덕
const CLOUD_CSS = paletteCss('fff7e4') // 구름
const GRASS_CSS = paletteCss('b0eb93') // 잔디
const GRASS_DASH_CSS = paletteCss('87a889') // 잔디 결
const SOIL_CSS = paletteCss('dea38b') // 흙
const SOIL_SPECK_CSS = paletteCss('ffe6c6') // 흙 위의 밝은 점
const DUST_CSS = paletteCss('d9c8bf') // 먼지
const OUTLINE_CSS = paletteCss(PALETTE_DARKEST)

const GRASS_H = 12
const GRASS_DASH_PERIOD = 48
const SOIL_SPECK_PERIOD = 73

/**
 * 먼 언덕의 실루엣. 한 칸이 20px 이고 18칸이 한 주기(360px)다.
 *
 * 곡선을 그리지 않고 계단으로 두는 것은 도트 화면이라서다. 안티에일리어싱된
 * 곡선 하나가 화면 전체를 "도트가 아닌 것"으로 만든다.
 */
const HILL_STEPS = [8, 16, 24, 30, 32, 30, 24, 16, 8, 4, 4, 8, 14, 20, 24, 20, 14, 8]
const HILL_STEP_W = 20
const HILL_PARALLAX = 0.35
const CLOUD_PARALLAX = 0.12

interface Cloud {
  x: number
  y: number
  w: number
}

const CLOUD_SPAN = GAME_WIDTH + 120

// ────────────────────────────────────────────────────────────────────────────

export class HopGame {
  private readonly host: MinigameHost
  private readonly pixels: PixelStage
  private readonly loop: GameLoop
  private readonly pointer: PointerInput

  /** destroy() 뒤에는 아무것도 하지 않는다. StrictMode 재마운트에서 죽은 판이 살아나지 않게. */
  private disposed = false
  /** onEnd 를 이미 불렀는가. 한 판에 정확히 한 번만 부른다는 계약을 여기서 지킨다. */
  private ended = false

  private runSec = 0
  private speed = BASE_SPEED
  private distancePx = 0
  private meters = 0

  /** 바닥선 위로 떠 있는 높이(px, 양수가 위). 0 이면 땅을 밟고 있다. */
  private lift = 0
  /** 수직 속도(px/s, 양수가 위). */
  private vy = 0
  private airborne = false
  private holdActive = false
  private holdSec = 0
  private bufferSec = 0
  private jumped = false

  private obstacles: { kind: ObstacleKind; x: number; phase: number }[] = []
  private spawnCountdownPx = 0
  private lastKind: ObstacleKind | null = null

  private dust: Dust[] = []
  /** 구름은 늘 같은 세 덩이가 돌고 돈다. 무작위로 만들면 하늘이 시끄러워진다. */
  private readonly clouds: readonly Cloud[] = [
    { x: 40, y: 74, w: 46 },
    { x: 190, y: 128, w: 62 },
    { x: 320, y: 92, w: 38 },
  ]
  private cloudShift = 0

  /** 충돌했는가. 세계를 멈추고 짧은 정지 연출로 넘어간다. */
  private over = false
  private hitSec = 0

  constructor(host: MinigameHost) {
    this.host = host
    this.pixels = new PixelStage(host.stage)

    this.spawnCountdownPx = minGapPx(BASE_SPEED) * FIRST_GAP_FACTOR

    this.pointer = new PointerInput({
      target: host.stage.canvas,
      onDown: () => this.press(),
      onUp: () => this.release(),
    })

    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    // 창이 포커스를 잃으면 keyup 이 오지 않아 누름이 눌린 채로 남는다. 그러면
    // 돌아왔을 때 첫 점프가 제멋대로 최대 높이로 뜬다.
    window.addEventListener('blur', this.handleBlur)

    this.loop = new GameLoop({
      update: (dtSec) => this.update(dtSec),
      render: () => this.render(),
    })
    this.loop.start()
  }

  /** 만든 루프·리스너를 전부 뗀다. 하나라도 남으면 재마운트에서 두 벌이 돈다. */
  destroy(): void {
    this.disposed = true
    this.loop.destroy()
    this.pointer.destroy()
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleBlur)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 입력
  // ──────────────────────────────────────────────────────────────────────────

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' && event.code !== 'ArrowUp') return
    // 키를 누르고 있으면 브라우저가 keydown 을 반복해서 보낸다. 그대로 두면
    // 반복마다 새 점프로 읽혀 버퍼가 계속 채워진다.
    if (event.repeat) return
    // 스페이스는 페이지를 스크롤시킨다. 게임 화면이 통째로 밀려 내려간다.
    event.preventDefault()
    this.press()
  }

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' && event.code !== 'ArrowUp') return
    this.release()
  }

  private handleBlur = (): void => {
    this.release()
  }

  private press(): void {
    if (this.disposed || this.over) return

    // **holdSec 을 여기서 0 으로 되돌리면 안 된다.** 공중에서 연타하는 것만으로
    // 감소 중력 예산(MAX_HOLD_SEC)이 계속 되살아나 체공이 무한히 늘어나고,
    // 최소 간격 계산의 전제(MAX_AIR_SEC)가 통째로 깨진다. 예산은 jump() 에서만
    // 새로 준다.
    this.holdActive = true

    // 공중에서 누른 것은 버린다고 두면 착지 직전 입력이 통째로 사라져 조작이
    // 먹지 않는 것처럼 느껴진다. 아주 짧게 기억했다가 착지할 때 써 준다.
    if (this.airborne) this.bufferSec = JUMP_BUFFER_SEC
    else this.jump()
  }

  private release(): void {
    this.holdActive = false
  }

  private jump(): void {
    this.airborne = true
    this.jumped = true
    this.vy = JUMP_V0
    this.holdSec = 0
    this.bufferSec = 0
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 진행
  // ──────────────────────────────────────────────────────────────────────────

  private update(dtSec: number): void {
    if (this.disposed) return

    // 충돌한 뒤에는 세계를 멈춘 채 짧게 보여 주고 결과를 넘긴다.
    if (this.over) {
      this.hitSec += dtSec
      this.updateDust(dtSec)
      if (this.hitSec >= HIT_FREEZE_SEC) this.finish()
      return
    }

    this.runSec += dtSec

    // 초당 1.5% 복리다. 매 프레임 곱해 나가면 부동소수 오차가 쌓이므로 경과
    // 시간에서 한 번에 구한다.
    this.speed = Math.min(BASE_SPEED * (1 + SPEED_GROWTH_PER_SEC) ** this.runSec, MAX_SPEED)

    const moved = this.speed * dtSec
    this.distancePx += moved
    this.cloudShift = (this.cloudShift + moved * CLOUD_PARALLAX) % CLOUD_SPAN

    this.updateJump(dtSec)
    this.updateObstacles(moved)
    this.updateDust(dtSec)
    this.reportScore()

    if (this.collides()) this.hit()
  }

  private updateJump(dtSec: number): void {
    if (this.bufferSec > 0) this.bufferSec -= dtSec
    if (!this.airborne) return

    // 상승 중에 누르고 있는 동안만 중력이 약해진다. 하강까지 이어지면 낙하가
    // 느려져 "길게 누르면 오래 떠 있는" 게임이 되고, 최소 간격 계산의 전제인
    // 체공 시간 상한이 깨진다.
    const holding = this.holdActive && this.vy > 0 && this.holdSec < MAX_HOLD_SEC
    if (holding) this.holdSec += dtSec

    this.vy -= (holding ? HOLD_GRAVITY : GRAVITY) * dtSec
    this.lift += this.vy * dtSec

    if (this.lift > 0) return

    this.lift = 0
    this.vy = 0
    this.airborne = false
    this.spawnDust(LANDING_DUST_COUNT, 0)

    if (this.bufferSec > 0) this.jump()
  }

  private updateObstacles(moved: number): void {
    for (const obstacle of this.obstacles) obstacle.x -= moved

    // 화면 왼쪽 밖으로 완전히 나간 것만 지운다. 폭이 가장 넓은 새(48)를 기준으로
    // 여유를 둔다.
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.x > -64)

    this.spawnCountdownPx -= moved
    if (this.spawnCountdownPx > 0) return

    const gap = minGapPx(this.speed)
    this.obstacles.push({ kind: this.pickKind(), x: SPAWN_X, phase: Math.random() * Math.PI * 2 })
    // 남은 음수분을 그대로 더해 다음 간격이 조금씩 밀리지 않게 한다.
    this.spawnCountdownPx += gap * (1 + Math.random() * GAP_JITTER)
  }

  private pickKind(): ObstacleKind {
    // 새를 연달아 내보내면 "뛰지 않는" 구간만 길게 이어져 판이 멈춘 것처럼 보인다.
    const birdAllowed = this.runSec >= BIRD_UNLOCK_SEC && this.lastKind !== 'bird'
    const roll = Math.random()

    const kind: ObstacleKind =
      birdAllowed && roll > 0.75 ? 'bird' : roll > 0.45 ? 'cactusTall' : 'cactusSmall'

    this.lastKind = kind
    return kind
  }

  private updateDust(dtSec: number): void {
    for (const particle of this.dust) {
      particle.life -= dtSec
      particle.vy -= DUST_GRAVITY * dtSec
      particle.x += particle.vx * dtSec
      particle.y -= particle.vy * dtSec
    }
    this.dust = this.dust.filter((particle) => particle.life > 0)
  }

  private spawnDust(count: number, upward: number): void {
    for (let i = 0; i < count; i += 1) {
      this.dust.push({
        x: PET_X + Math.random() * PET_HIT_W,
        y: GROUND_Y - upward - Math.random() * 4,
        // 세계가 흐르는 방향으로 함께 뒤로 흩어져야 바닥을 딛은 것처럼 보인다.
        vx: -this.speed * 0.3 + (Math.random() - 0.5) * 60,
        vy: 40 + Math.random() * 90 + upward,
        life: DUST_LIFE_SEC * (0.7 + Math.random() * 0.6),
        size: Math.random() < 0.4 ? 3 : 2,
      })
    }
  }

  private reportScore(): void {
    const meters = Math.floor(this.distancePx / PX_PER_METER)
    if (meters === this.meters) return

    this.meters = meters
    this.host.onScore?.(meters)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 충돌
  // ──────────────────────────────────────────────────────────────────────────

  /** 사각형 겹침(AABB)만 본다. 회전도 곡면도 없으므로 이 이상이 필요 없다(§8). */
  private collides(): boolean {
    const petLeft = PET_X
    const petRight = PET_X + PET_HIT_W
    const petBottom = GROUND_Y - this.lift
    const petTop = petBottom - PET_HIT_H

    return this.obstacles.some((obstacle) => {
      const spec = OBSTACLES[obstacle.kind]
      if (obstacle.x + spec.width <= petLeft || obstacle.x >= petRight) return false

      const bottom = GROUND_Y - spec.bottomAboveGround + this.bobPx(obstacle.kind, obstacle.phase)
      return petBottom > bottom - spec.height && petTop < bottom
    })
  }

  private hit(): void {
    this.over = true
    this.hitSec = 0
    this.holdActive = false
    this.spawnDust(HIT_DUST_COUNT, 24)
  }

  private finish(): void {
    if (this.ended || this.disposed) return
    this.ended = true
    // 결과를 올려보내면 대개 화면이 바뀐다. 루프를 먼저 세워 두지 않으면 그
    // 프레임의 render 가 이미 정리된 캔버스에 그리고, 부모가 화면을 붙들고 있는
    // 경우에는 끝난 판이 계속 rAF 를 태운다(CatchGame.finish 와 같은 이유).
    this.loop.stop()
    this.host.onEnd(this.meters)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 그리기
  //
  // 좌표는 전부 정수로 떨어지게 둔다. PixelStage 가 반올림해 주지만, 소수 좌표를
  // 그대로 넘기면 프레임마다 반올림 방향이 갈려 도트가 떨리는 것처럼 보인다.
  // ──────────────────────────────────────────────────────────────────────────

  private bobPx(kind: ObstacleKind, phase: number): number {
    if (!OBSTACLES[kind].bobs) return 0
    // 반올림해서 -2 · 0 · 2 세 값만 쓴다. 소수로 흔들면 새가 흐려진다.
    return Math.round(Math.sin(this.runSec * 4 + phase)) * 2
  }

  private render(): void {
    this.pixels.begin(SKY_CSS)

    this.renderClouds()
    this.renderHills()
    // **장애물을 바닥보다 먼저 그린다.** 낮은 선인장은 바닥에 묻어 낮아진 것이라,
    // 묻힌 부분을 바닥이 덮어 주어야 땅에서 자란 것처럼 보인다(OBSTACLES 주석).
    this.renderObstacles()
    this.renderGround()
    this.renderDust()
    this.renderPet()
    this.renderLetterbox()
    this.renderHud()
  }

  /**
   * 논리 화면(360×640) 밖으로 삐져나간 것을 덮는다.
   *
   * 화면 왼쪽으로 빠져나가는 장애물·구름·언덕은 논리 좌표가 음수인 채로 그려지고,
   * PixelStage 는 그것을 레터박스 위에 그대로 찍는다. 여백에 선인장 반쪽이 남으면
   * 화면이 깨진 것처럼 보인다. 색은 방 화면(PetGame)의 여백과 같은 값으로 맞춘다 —
   * 미니게임을 드나들 때 테두리 색이 바뀌면 그 자체가 깜빡임이 된다.
   */
  private renderLetterbox(): void {
    // 어떤 배율에서도 화면 끝까지 닿도록 논리 해상도보다 넉넉히 잡는다.
    const over = 1000
    const tall = GAME_HEIGHT + over * 2
    const wide = GAME_WIDTH + over * 2

    this.pixels.fillRect(-over, -over, over, tall, OUTLINE_CSS)
    this.pixels.fillRect(GAME_WIDTH, -over, over, tall, OUTLINE_CSS)
    this.pixels.fillRect(-over, -over, wide, over, OUTLINE_CSS)
    this.pixels.fillRect(-over, GAME_HEIGHT, wide, over, OUTLINE_CSS)
  }

  private renderClouds(): void {
    for (const cloud of this.clouds) {
      // 왼쪽으로 흐르다 화면 밖으로 나가면 오른쪽 끝에서 다시 들어온다.
      // JS 의 % 는 음수에서 음수를 돌려주므로 한 번 더 더해 양수로 만든다.
      const wrapped = (((cloud.x - this.cloudShift) % CLOUD_SPAN) + CLOUD_SPAN) % CLOUD_SPAN
      const x = wrapped - 60

      this.pixels.fillRect(x, cloud.y, cloud.w, 8, CLOUD_CSS)
      this.pixels.fillRect(x + 8, cloud.y - 6, cloud.w - 16, 6, CLOUD_CSS)
    }
  }

  private renderHills(): void {
    const shift = (this.distancePx * HILL_PARALLAX) % (HILL_STEPS.length * HILL_STEP_W)

    for (let i = -1; i <= HILL_STEPS.length; i += 1) {
      const height = HILL_STEPS[((i % HILL_STEPS.length) + HILL_STEPS.length) % HILL_STEPS.length]
      const x = i * HILL_STEP_W - shift
      this.pixels.fillRect(x, GROUND_Y - height, HILL_STEP_W, height, HILL_CSS)
    }
  }

  private renderObstacles(): void {
    for (const obstacle of this.obstacles) {
      const spec = OBSTACLES[obstacle.kind]
      this.pixels.drawSprite(
        this.host.sprites.props[spec.sprite],
        obstacle.x - spec.insetX,
        GROUND_Y - spec.drawTopAboveGround + this.bobPx(obstacle.kind, obstacle.phase),
      )
    }
  }

  private renderGround(): void {
    const pixels = this.pixels

    // 이 팔레트는 밝은 쪽에 치우쳐 있어 명암으로는 면이 갈리지 않는다. 경계는
    // 어두운 선으로 그어야 읽힌다(palette.ts 첫머리).
    pixels.fillRect(0, GROUND_Y, GAME_WIDTH, 2, OUTLINE_CSS)
    pixels.fillRect(0, GROUND_Y + 2, GAME_WIDTH, GRASS_H, GRASS_CSS)
    const soilY = GROUND_Y + 2 + GRASS_H
    pixels.fillRect(0, soilY, GAME_WIDTH, GAME_HEIGHT - soilY, SOIL_CSS)

    // 흐르는 결이 없으면 속도가 전혀 읽히지 않는다. 바닥이 정지 화면처럼 보인다.
    const dashShift = this.distancePx % GRASS_DASH_PERIOD
    for (let x = -GRASS_DASH_PERIOD; x < GAME_WIDTH + GRASS_DASH_PERIOD; x += GRASS_DASH_PERIOD) {
      pixels.fillRect(x - dashShift, GROUND_Y + 6, 16, 2, GRASS_DASH_CSS)
    }

    const speckShift = this.distancePx % SOIL_SPECK_PERIOD
    for (let x = -SOIL_SPECK_PERIOD; x < GAME_WIDTH + SOIL_SPECK_PERIOD; x += SOIL_SPECK_PERIOD) {
      pixels.fillRect(x - speckShift, GROUND_Y + 34, 6, 3, SOIL_SPECK_CSS)
      pixels.fillRect(x - speckShift + 38, GROUND_Y + 70, 4, 3, SOIL_SPECK_CSS)
    }
  }

  private renderDust(): void {
    for (const particle of this.dust) {
      this.pixels.fillRect(particle.x, particle.y, particle.size, particle.size, DUST_CSS)
    }
  }

  private renderPet(): void {
    // 충돌 정지 동안만 깜빡인다. 멈춘 화면만 보여 주면 게임이 굳은 것처럼 보인다.
    // **정지가 끝나면 반드시 멈춘다** — onEnd 뒤에도 계속 깜빡이면 결과 화면이
    // 뜨는 동안 뒤에서 펫이 점멸한다.
    const blinking = this.over && this.hitSec < HIT_FREEZE_SEC
    if (blinking && Math.floor(this.hitSec / HIT_BLINK_SEC) % 2 === 1) return

    this.pixels.drawSprite(
      this.host.sprites.pet,
      PET_DRAW_X,
      GROUND_Y - PET_SPRITE.feetY - Math.round(this.lift),
    )
  }

  private renderHud(): void {
    this.pixels.fillText(`${this.meters}m`, GAME_WIDTH / 2, 40, OUTLINE_CSS, 22)

    // 한 번이라도 뛰면 안내를 치운다. 계속 띄워 두면 화면을 가린다.
    if (!this.jumped && !this.over) {
      this.pixels.fillText('탭해서 점프 · 길게 누르면 더 높이', GAME_WIDTH / 2, 76, OUTLINE_CSS, 11)
    }
  }
}
