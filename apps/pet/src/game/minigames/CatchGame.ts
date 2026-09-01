// 간식받기 (명세 §8.1).
//
// 펫이 화면 아래에서 좌우로 움직이며 떨어지는 것을 받는다. 음식 +1, 황금 도넛
// +5, 폭탄은 라이프 -1 이고 라이프 3 이 다 닳거나 60초가 지나면 끝난다.
//
// **물리 엔진을 쓰지 않는다.** 필요한 판정이 축에 정렬된 사각형 겹침 하나뿐이라
// matter.js 는 번들에 230KB 를 얹고 아무것도 더해주지 않는다(명세 §8).
//
// 이 클래스는 **규칙을 모른다.** 코인·EXP·에너지·일일 상한은 전부
// game/pet/minigames.ts 가 정산한다. 여기가 아는 것은 "점수"뿐이고, 판이 끝나면
// 그 숫자 하나를 onEnd 로 올려보낸다.

import { GameLoop } from '@gujuck/game-core'
import { PALETTE_DARKEST, paletteCss } from '../palette'
import { ITEM_SPRITE_NAMES, PET_METRICS, PROP_SPRITE_SIZE } from '../sprites'
import type { ItemSpriteName, PetMetrics } from '../sprites'
// 앱 안에 play 가 둘이다 — 효과음(sound.play)과 배경음악(music.play). 이름만
// 가져오면 호출부에서 어느 쪽인지 드러나지 않는다. App.tsx 가 같은 이유로 통째로
// 가져온다.
import * as sound from '../sound'
import { GAME_HEIGHT, GAME_WIDTH, PixelStage } from './pixelStage'
import type { MinigameHost } from './types'

// ────────────────────────────────────────────────────────────────────────────
// 밸런싱
//
// 명세 §8.1 이 못 박은 값(60초 · 라이프 3 · 10초마다 12%)과, 그 안에서 "잘하면
// 30~50 코인"(§8 끝)이 나오도록 잡은 설계값이 섞여 있다. 설계값 쪽은 실측 후
// 조정하고, 바꾼 이유를 그 상수 옆에 적는다.
// ────────────────────────────────────────────────────────────────────────────

/** §8.1 — 60초 경과 또는 라이프 소진에서 끝난다. */
const DURATION_SEC = 60
const START_LIVES = 3

/**
 * §8.1 — 낙하 속도는 10초마다 12% 증가한다.
 *
 * 연속 가속이 아니라 **10초마다 한 계단**이다. 명세가 그렇게 적혀 있고, 계단이
 * 눈에 띄는 편이 "빨라졌다"가 읽힌다. 한 판이 정확히 60초에 끝나므로 마지막
 * 구간(playSec 50~60)의 지수는 6 이 아니라 5 다 — 6 계단째는 판이 끝나는 그
 * 순간에야 온다. 그래서 실제 최대는 1.12⁵ ≈ 1.76배이고, 화면을 가로지르는 시간은
 * 절반이 아니라 약 57% 다. (다음에 FALL_SPEED_START 를 잡을 때 이 값을 쓴다.)
 */
const SPEEDUP_EVERY_SEC = 10
const SPEEDUP_FACTOR = 1.12

/**
 * 시작 낙하 속도(px/s)와 시작 생성 간격(초).
 *
 * 낙하 구간이 약 550px 이므로 처음에는 한 개가 약 2.9초 동안 보인다. 이보다
 * 빠르면 첫 10초부터 손이 바쁘고, 느리면 화면이 비어 심심하다. 생성 간격은
 * 속도와 같은 계단으로 줄여서 화면에 떠 있는 개수를 대략 일정하게 유지한다 —
 * 속도만 올리면 후반에 오히려 물건이 드물어진다.
 */
const FALL_SPEED_START = 190
const SPAWN_INTERVAL_START = 1.15

/**
 * 무엇이 떨어지는가의 확률.
 *
 * 위 간격과 함께 계산해 둔 값이다. 60초에 약 71개가 떨어지고 그중 폭탄이 13개,
 * 황금 도넛이 6개다. 폭탄을 피하느라 놓치는 것까지 감안해 **떨어진 것의 40~60%를
 * 받으면 점수가 32~49** 가 되는데, 코인은 점수 × 1 이라 명세 §8 이 세 게임에
 * 공통으로 잡은 "잘하면 30~50코인"과 그대로 맞는다. 실측이 아니라 설계값이므로
 * 열 판쯤 돌려 보고 조정한다.
 */
const BOMB_CHANCE = 0.18
const GOLDEN_CHANCE = 0.08

const GOLDEN_SCORE = 5

/**
 * 충돌 상자를 스프라이트보다 얼마나 줄일지(px).
 *
 * **받는 것과 맞는 것에 다른 값을 준다.** 48×48 안에서 그림이 실제로 차지하는
 * 영역은 그보다 작아서, 같은 여유를 주면 스치듯 지나간 폭탄이 라이프를 깎는다.
 * 손해는 인색하게, 이득은 넉넉하게 판정하는 편이 억울함이 없다.
 */
const FOOD_HIT_PAD = 4
const BOMB_HIT_PAD = 11

/**
 * 받는 폭과 그 폭의 왼쪽 끝(펫 중심 기준). **성장 단계와 무관하게 어른 값이다.**
 *
 * 명세 §6 은 성장을 "외형만 바뀌고 능력 차이는 없다"로 못 박았다. 이 폭을 단계별
 * 실측(아기 63 · 어린이 82 · 어른 101)으로 두면 Lv.1 의 받는 폭이 Lv.10 보다
 * 38px 좁아지고, 코인이 점수 그대로라(economy.ts) **레벨이 곧 코인 수급률이
 * 된다.** 떨어지는 물건은 48px 로 단계와 무관하므로 그 차이가 그대로 남는다.
 *
 * 상자가 그림보다 넓어지는 것(아기는 좌우로 19px 씩)은 감수한다. 이 저장소는
 * 이미 판정 상자를 그림이 아니라 **재미**에 맞춰 잡는다 — 폴짝 달리기의 펫 폭은
 * 실측 100 이 아니라 60 이고, 여기서도 폭탄과 음식의 여유가 서로 다르다
 * (BOMB_HIT_PAD · FOOD_HIT_PAD). 넓어지는 방향은 그중 "이득은 넉넉하게" 쪽이다.
 *
 * 세로는 단계별 실측을 그대로 쓴다. 물건은 위에서 아래로만 떨어지고 화면 바닥
 * (GROUND_Y)까지 살아 있으므로, 가로로 겹치기만 하면 세로는 언제든 겹친다 —
 * 상자 높이는 "받느냐"가 아니라 "머리에서 몇 px 위에서 사라지느냐"만 정한다.
 * 어른 높이로 고정하면 아기 머리 위 43px 에서 간식이 사라진다.
 */
const CATCH_WIDTH = PET_METRICS.adult.bodyWidth
const CATCH_LEFT_FROM_CENTER = PET_METRICS.adult.centerX - PET_METRICS.adult.bodyLeft

/** 펫이 손가락을 따라가는 최고 속도(px/s). 화면 폭을 약 0.45초에 가로지른다. */
const PET_SPEED = 800

/** 펫 발밑 바닥선. 아래 44px 이 잔디다. */
const GROUND_Y = 596

/** 위쪽 점수·시간 패널의 높이. 떨어지는 물건은 이 패널 뒤로 지나간다. */
const HUD_HEIGHT = 44

// ── 연출 ────────────────────────────────────────────────────────────────────

/** 받았을 때 펫이 한 번 튀는 높이와 길이. 회전·비정수 스케일은 도트를 뭉갠다(§12.3). */
const BOUNCE_SEC = 0.28
const BOUNCE_HEIGHT_PX = 9

/**
 * 폭탄에 맞았을 때의 화면 흔들림.
 *
 * **흔들림 폭도 정수 픽셀로만 반올림한다.** 소수 좌표로 흔들면 흔드는 동안
 * 화면 전체의 도트가 흐려져, 흔들림이 아니라 초점이 나간 것처럼 보인다.
 */
const SHAKE_SEC = 0.34
const SHAKE_PX = 4

/** 맞은 직후 테두리가 빨갛게 남는 시간. 흔들림만으로는 원인이 안 읽힌다. */
const HIT_FRAME_SEC = 0.18

/** 받았을 때 튀는 반짝이. 4×4 도트 하나를 재사용한다(§12.3 의 파티클 규칙). */
const SPARK_COUNT = 6
const SPARK_SEC = 0.34
const SPARK_SIZE = 4
const SPARK_GRAVITY = 420

/** 끝난 뒤 결과를 올려보내기까지의 여유. 마지막 순간을 못 보고 화면이 바뀌면 허무하다. */
const OUTRO_SEC = 0.8

/** 남은 시간이 이보다 적으면 숫자가 빨개진다. 조급함은 색으로 먼저 온다. */
const HURRY_SEC = 10

/**
 * 색은 팔레트에서만 가져온다.
 *
 * paletteCss 의 인자 타입이 PaletteHex 라 팔레트 밖 색은 컴파일에서 막힌다.
 * hex 문자열을 `'#accce4'` 처럼 직접 적으면 팔레트가 두 벌로 갈려 에셋 색과 UI
 * 색이 조용히 어긋난다. 세 미니게임이 같은 방식을 쓴다(palette.ts 의 paletteCss).
 */
const COLOR = {
  letterbox: paletteCss(PALETTE_DARKEST),
  sky: paletteCss('accce4'),
  grass: paletteCss('b0eb93'),
  grassEdge: paletteCss('87a889'),
  panel: paletteCss('fff7e4'),
  ink: paletteCss('28282e'),
  warn: paletteCss('f98284'),
  calm: paletteCss('b3e3da'),
  dim: paletteCss('d9c8bf'),
  spark: paletteCss('fff7a0'),
  sparkAlt: paletteCss('ffc384'),
} as const

/**
 * 떨어지는 음식 후보.
 *
 * **도넛만 뺀다.** 황금 도넛(prop-donut)이 +5 인데 생김새가 거의 같은 +1 짜리
 * 도넛이 같이 떨어지면, 화면에서 둘을 구분할 방법이 없어 "왜 어떤 도넛은 5점이
 * 아니지"가 된다. 점수가 다른 것은 겉모습이 달라야 한다.
 */
const FOOD_SPRITE_NAMES: readonly ItemSpriteName[] = ITEM_SPRITE_NAMES.filter(
  (name) => name !== 'item-donut',
)

type FallerKind = 'food' | 'golden' | 'bomb'

interface Faller {
  kind: FallerKind
  image: HTMLImageElement
  /** 스프라이트 왼쪽 위(논리 좌표). */
  x: number
  y: number
  /** px/s. 생성 시점의 속도로 고정한다 — 도중에 빨라지면 이미 떠 있는 것이 튄다. */
  vy: number
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  /** 남은 수명(초). */
  sec: number
  color: string
}

/** 한 판의 진행 단계. done 이 되면 onEnd 는 이미 불렸다. */
type Phase = 'play' | 'outro' | 'done'

export class CatchGame {
  private readonly host: MinigameHost
  private readonly pixels: PixelStage
  private readonly loop: GameLoop
  private readonly canvas: HTMLCanvasElement

  /**
   * 지금 단계의 실측 좌표. 판이 도는 동안 단계는 바뀌지 않으므로 한 번만 읽는다.
   *
   * **그리는 자리에만 쓴다.** 받는 폭은 단계와 무관한 CATCH_WIDTH 다 — 이유는
   * 그 상수 옆에 적어 두었다(명세 §6).
   */
  private readonly metrics: PetMetrics

  private disposed = false

  /** 시작한 뒤 흐른 플레이 시간(초). 탭이 숨으면 루프가 멈추므로 함께 멈춘다. */
  private playSec = 0
  private phase: Phase = 'play'
  private outroSec = 0

  private score = 0
  private lives = START_LIVES
  private spawnCooldown = SPAWN_INTERVAL_START

  private readonly fallers: Faller[] = []
  private readonly sparks: Spark[] = []

  /** 펫의 불투명 영역 가로 중심(논리 좌표). 그리는 좌표가 아니다. */
  private petX = GAME_WIDTH / 2
  private targetX = GAME_WIDTH / 2
  private pointerId: number | null = null

  private bounceSec = 0
  private shakeSec = 0

  constructor(host: MinigameHost) {
    this.host = host
    this.pixels = new PixelStage(host.stage)
    this.canvas = host.stage.canvas
    this.metrics = PET_METRICS[host.petStage]

    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerUp)

    this.loop = new GameLoop({
      update: (dtSec) => this.update(dtSec),
      render: () => this.render(),
    })
    this.loop.start()
  }

  /**
   * 자기가 만든 루프와 리스너를 전부 뗀다.
   *
   * 하나라도 남으면 StrictMode 의 마운트 → 언마운트 → 재마운트에서 루프가 두 벌
   * 돌고 포인터가 두 번 먹는다. 펫이 손가락보다 두 배로 움직이고 점수가 두 배로
   * 오르는데, 원인은 화면 어디에도 나타나지 않는다(ARCHITECTURE.md 의 그 버그).
   */
  destroy(): void {
    this.disposed = true

    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp)

    if (this.pointerId !== null && this.canvas.hasPointerCapture(this.pointerId)) {
      this.canvas.releasePointerCapture(this.pointerId)
    }
    this.pointerId = null

    this.loop.destroy()
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 입력
  //
  // PointerInput 을 쓰지 않고 직접 붙인다. 그쪽은 CSS 픽셀 좌표를 주는데 여기
  // 필요한 것은 논리 좌표(360×640)이고, 그 변환은 PixelStage 가 배율·레터박스를
  // 알고 있어야 할 수 있다. 한 번 더 감싸느니 여기서 clientX 를 바로 넘긴다.
  // ──────────────────────────────────────────────────────────────────────────

  private handlePointerDown = (event: PointerEvent): void => {
    // 두 번째 손가락은 무시한다. 둘 다 따라가면 펫이 두 좌표 사이에서 떤다.
    if (this.pointerId !== null || this.phase !== 'play') return

    this.pointerId = event.pointerId
    this.canvas.setPointerCapture(event.pointerId)
    this.aimAt(event.clientX)
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return
    this.aimAt(event.clientX)
  }

  private handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return

    this.pointerId = null
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId)
    }
    // 목표는 그대로 둔다. 손을 뗐다고 펫이 되돌아가면 놓은 자리를 지킬 수 없다.
  }

  /**
   * 손가락이 있는 곳을 목표로 잡는다. 펫은 이 목표를 향해 PET_SPEED 로 따라간다.
   *
   * 좌표를 그대로 대입하지 않는 이유: 먼 곳을 탭하면 펫이 순간이동한다. 도트
   * 게임에서 한 프레임 만에 100px 을 건너뛰면 이동이 아니라 사라졌다 나타난
   * 것으로 보이고, 그 사이의 폭탄을 통과해 버린다.
   */
  private aimAt(clientX: number): void {
    this.targetX = this.pixels.toLogical(clientX, 0).x
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 진행
  // ──────────────────────────────────────────────────────────────────────────

  private update(dtSec: number): void {
    if (this.disposed) return

    this.movePet(dtSec)
    this.advanceEffects(dtSec)

    if (this.phase === 'play') {
      this.playSec += dtSec
      this.spawnTick(dtSec)
      this.moveFallers(dtSec)

      if (this.playSec >= DURATION_SEC) this.beginOutro()
      return
    }

    if (this.phase === 'outro') {
      // 떨어지던 것은 계속 내려가게 둔다. 멈춰 세우면 화면이 얼어붙어 게임이
      // 끊긴 것처럼 보인다.
      this.moveFallers(dtSec)
      this.outroSec += dtSec
      if (this.outroSec >= OUTRO_SEC) this.finish()
    }
  }

  private movePet(dtSec: number): void {
    const { centerX, bodyLeft, bodyWidth } = this.metrics
    const minX = centerX - bodyLeft
    const maxX = GAME_WIDTH - (bodyLeft + bodyWidth - centerX)
    const target = Math.min(maxX, Math.max(minX, this.targetX))

    const step = PET_SPEED * dtSec
    const gap = target - this.petX
    this.petX = Math.abs(gap) <= step ? target : this.petX + Math.sign(gap) * step
  }

  private advanceEffects(dtSec: number): void {
    if (this.bounceSec > 0) this.bounceSec = Math.max(0, this.bounceSec - dtSec)
    if (this.shakeSec > 0) this.shakeSec = Math.max(0, this.shakeSec - dtSec)

    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i]
      spark.sec -= dtSec
      if (spark.sec <= 0) {
        this.sparks.splice(i, 1)
        continue
      }
      spark.x += spark.vx * dtSec
      spark.y += spark.vy * dtSec
      spark.vy += SPARK_GRAVITY * dtSec
    }
  }

  /**
   * 지금의 속도 배수. 10초마다 한 계단씩 오른다(§8.1).
   *
   * 생성 간격도 같은 배수로 나눈다 — 이유는 SPAWN_INTERVAL_START 주석 참조.
   */
  private speedFactor(): number {
    return SPEEDUP_FACTOR ** Math.floor(this.playSec / SPEEDUP_EVERY_SEC)
  }

  private spawnTick(dtSec: number): void {
    this.spawnCooldown -= dtSec
    if (this.spawnCooldown > 0) return

    this.spawn()
    this.spawnCooldown = SPAWN_INTERVAL_START / this.speedFactor()
  }

  private spawn(): void {
    const roll = Math.random()
    const kind: FallerKind =
      roll < BOMB_CHANCE ? 'bomb' : roll < BOMB_CHANCE + GOLDEN_CHANCE ? 'golden' : 'food'

    // 화면 양 끝에 딱 붙여 떨어뜨리지 않는다. 펫의 몸통 절반이 벽에 막혀 있어
    // 끝에 붙은 것은 받기가 부당하게 어렵다.
    const margin = 8
    const x = margin + Math.random() * (GAME_WIDTH - PROP_SPRITE_SIZE - margin * 2)

    this.fallers.push({
      kind,
      image: this.imageFor(kind),
      x,
      y: -PROP_SPRITE_SIZE,
      vy: FALL_SPEED_START * this.speedFactor(),
    })
  }

  private imageFor(kind: FallerKind): HTMLImageElement {
    const { sprites } = this.host
    if (kind === 'bomb') return sprites.props['prop-bomb']
    if (kind === 'golden') return sprites.props['prop-donut']

    const name = FOOD_SPRITE_NAMES[Math.floor(Math.random() * FOOD_SPRITE_NAMES.length)]
    return sprites.items[name]
  }

  private moveFallers(dtSec: number): void {
    const body = this.petBody()

    for (let i = this.fallers.length - 1; i >= 0; i -= 1) {
      const faller = this.fallers[i]
      faller.y += faller.vy * dtSec

      // 스프라이트 아래가 화면 바닥에 닿으면 지운다. GAME_HEIGHT 를 넘길 때까지
      // 두면 마지막 48px 이 아래쪽 레터박스 위에 그려진다 — drawSprite 는 논리
      // 화면 밖을 잘라 주지 않는다.
      if (faller.y > GAME_HEIGHT - PROP_SPRITE_SIZE) {
        this.fallers.splice(i, 1)
        continue
      }

      // 끝난 뒤에는 판정하지 않는다. 마지막 0.8초에 점수가 더 오르면 결과
      // 화면에 뜬 숫자와 방금 본 숫자가 어긋난다.
      if (this.phase !== 'play') continue

      const pad = faller.kind === 'bomb' ? BOMB_HIT_PAD : FOOD_HIT_PAD
      const hit = overlaps(
        faller.x + pad,
        faller.y + pad,
        PROP_SPRITE_SIZE - pad * 2,
        PROP_SPRITE_SIZE - pad * 2,
        body.x,
        body.y,
        body.w,
        body.h,
      )
      if (!hit) continue

      this.fallers.splice(i, 1)
      this.resolveHit(faller)
    }
  }

  private resolveHit(faller: Faller): void {
    const centerX = faller.x + PROP_SPRITE_SIZE / 2
    const centerY = faller.y + PROP_SPRITE_SIZE / 2

    if (faller.kind === 'bomb') {
      this.lives -= 1
      this.shakeSec = SHAKE_SEC
      this.burst(centerX, centerY, COLOR.warn)
      // 피격은 게임 안의 사건이라 거절(refuse)과 다른 소리를 쓴다(§12.13).
      sound.play('hit')
      if (this.lives <= 0) this.beginOutro()
      return
    }

    this.score += faller.kind === 'golden' ? GOLDEN_SCORE : 1
    this.bounceSec = BOUNCE_SEC
    this.burst(centerX, centerY, faller.kind === 'golden' ? COLOR.spark : COLOR.sparkAlt)
    // 황금 도넛도 같은 소리다. 점수 차이는 반짝임과 숫자로 이미 보이고, 여기서
    // 소리까지 갈라 두면 무엇이 다른 소리였는지 판이 끝난 뒤에 기억나지 않는다.
    sound.play('catch')
    this.host.onScore?.(this.score)
  }

  private burst(x: number, y: number, color: string): void {
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const angle = (Math.PI * 2 * i) / SPARK_COUNT + Math.random() * 0.4
      const speed = 70 + Math.random() * 60
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        sec: SPARK_SEC,
        color,
      })
    }
  }

  private beginOutro(): void {
    if (this.phase !== 'play') return
    this.phase = 'outro'
    this.outroSec = 0
  }

  /** onEnd 는 여기서만, 한 판에 한 번만 불린다. */
  private finish(): void {
    if (this.phase === 'done' || this.disposed) return
    this.phase = 'done'
    // 결과를 올려보내면 대개 화면이 바뀐다. 루프를 먼저 세워 두지 않으면 그
    // 프레임의 render 가 이미 정리된 캔버스에 그린다.
    this.loop.stop()
    this.host.onEnd(this.score)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 그리기
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * 펫의 충돌 상자(논리 좌표).
   *
   * 가로는 단계와 무관한 어른 폭이고(CATCH_WIDTH), 세로만 지금 단계의 불투명
   * 영역을 따른다. 왜 둘을 다르게 두는지는 CATCH_WIDTH 옆에 적어 두었다.
   */
  private petBody(): { x: number; y: number; w: number; h: number } {
    const m = this.metrics
    return {
      x: this.petX - CATCH_LEFT_FROM_CENTER,
      y: GROUND_Y - m.feetY + m.bodyTop - this.petLift(),
      w: CATCH_WIDTH,
      h: m.bodyHeight,
    }
  }

  /** 받았을 때 한 번 튀어 오르는 높이(정수 px). 튀지 않으면 0 이다. */
  private petLift(): number {
    if (this.bounceSec <= 0) return 0
    const t = 1 - this.bounceSec / BOUNCE_SEC
    return Math.round(BOUNCE_HEIGHT_PX * Math.sin(Math.PI * t))
  }

  /**
   * 폭탄에 맞았을 때의 흔들림(정수 px).
   *
   * 두 축의 주기를 서로 소수에 가깝게 어긋나게 두어야 같은 자리를 오가지 않고
   * 흔들린 것으로 읽힌다. 진폭은 남은 시간에 비례해 잦아든다.
   */
  private shakeOffset(): { dx: number; dy: number } {
    if (this.shakeSec <= 0) return { dx: 0, dy: 0 }

    const decay = this.shakeSec / SHAKE_SEC
    return {
      dx: Math.round(Math.sin(this.shakeSec * 71) * SHAKE_PX * decay),
      dy: Math.round(Math.cos(this.shakeSec * 53) * SHAKE_PX * decay * 0.5),
    }
  }

  private render(): void {
    if (this.disposed) return

    this.pixels.begin(COLOR.letterbox)
    this.pixels.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT, COLOR.sky)

    const { dx, dy } = this.shakeOffset()

    // **잔디를 논리 화면 밖으로 넘겨 그리지 않는다.** 넘겨 그리면 레터박스 위에
    // 칠해져 아래쪽 검은 띠만 사라진 화면이 된다(위쪽은 남아 있어 더 어긋나 보인다).
    // 흔들림은 세로로만 준다 — 아래 끝을 640 에 고정해 두면 위로 흔들려도 틈이
    // 생기지 않고, 바닥선이 위아래로 움직이는 것만으로 충격은 충분히 읽힌다.
    const grassY = GROUND_Y + dy
    this.pixels.fillRect(0, grassY, GAME_WIDTH, GAME_HEIGHT - grassY, COLOR.grass)
    this.pixels.fillRect(0, grassY, GAME_WIDTH, 3, COLOR.grassEdge)

    for (const faller of this.fallers) {
      const y = faller.y + dy
      // 논리 화면에 온전히 들어오지 않은 것은 그리지 않는다. drawSprite 는 밖을
      // 잘라 주지 않아서, 반쯤 걸친 물건이 레터박스 위에 찍힌다. 위쪽은 y = 0 부터
      // 44 까지를 점수 패널이 덮으므로(패널을 나중에 그린다) 갑자기 나타나는 것이
      // 눈에 띄지 않는다.
      if (y < 0 || y + PROP_SPRITE_SIZE > GAME_HEIGHT) continue

      if (faller.kind === 'golden') this.renderGlint(faller.x + dx, y)
      this.pixels.drawSprite(faller.image, faller.x + dx, y)
    }

    // 폭탄에 맞은 직후에는 시무룩한 얼굴로 그린다. 흔들림·빨간 테두리는 화면에
    // 일어난 일이고, 얼굴은 펫에게 일어난 일이라 둘이 겹쳐야 "아팠다"가 읽힌다.
    //
    // **기분 0 도 같은 자리에 넣는다.** 미니게임 안에는 깜빡임도 먹는 것도 없어서
    // face.ts 의 우선순위 중 남는 것은 시무룩뿐이고, 그 조건이 "게임 안의 사건"과
    // "기분 0" 둘이다. 뒤를 빼면 기분 0 인 펫이 거실에서만 시무룩하다.
    const face = this.shakeSec > 0 || this.host.moodZero ? 'sad' : 'base'

    this.pixels.drawSprite(
      this.host.sprites.pets[this.host.petStage][face],
      this.petX - this.metrics.centerX + dx,
      GROUND_Y - this.metrics.feetY - this.petLift() + dy,
    )

    for (const spark of this.sparks) {
      this.dot(spark.x + dx, spark.y + dy, spark.color)
    }

    this.renderHitFrame()
    this.renderHud()
    this.renderOutro()
  }

  /**
   * 황금 도넛 둘레에서 깜빡이는 점 넷.
   *
   * 황금 도넛은 +5 인데 48×48 안에 그려진 다른 음식과 크기도 색 언어도 같아서,
   * 떨어지는 동안에는 그냥 도넛으로 읽힌다. **점수가 다른 것은 화면에서 달라
   * 보여야 한다** — 받고 나서 점수가 5 오른 것으로 알게 되면 그건 규칙이 아니라
   * 우연이다. 새 에셋 없이 4×4 도트만으로 표시한다(§12.3 의 파티클 규칙).
   */
  private renderGlint(x: number, y: number): void {
    const on = Math.floor(this.playSec * 8) % 2 === 0
    const color = on ? COLOR.spark : COLOR.sparkAlt
    const mid = PROP_SPRITE_SIZE / 2 - SPARK_SIZE / 2
    const edge = PROP_SPRITE_SIZE - 2

    this.dot(x + mid, y - 2, color)
    this.dot(x + mid, y + edge, color)
    this.dot(x - 2, y + mid, color)
    this.dot(x + edge, y + mid, color)
  }

  /**
   * 논리 화면 안에 온전히 들어올 때만 4×4 도트를 찍는다.
   *
   * PixelStage.fillRect 는 논리 화면 밖을 잘라 주지 않는다. 화면 끝에서 받은
   * 반짝이가 레터박스 위에 찍히면 게임 화면이 정해진 틀 밖으로 새어 보인다.
   */
  private dot(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x + SPARK_SIZE > GAME_WIDTH || y + SPARK_SIZE > GAME_HEIGHT) return
    this.pixels.fillRect(x, y, SPARK_SIZE, SPARK_SIZE, color)
  }

  /** 맞은 직후의 빨간 테두리. 흔들림만으로는 "무엇에" 맞았는지가 안 읽힌다. */
  private renderHitFrame(): void {
    if (this.shakeSec <= SHAKE_SEC - HIT_FRAME_SEC) return

    const t = 3
    this.pixels.fillRect(0, 0, GAME_WIDTH, t, COLOR.warn)
    this.pixels.fillRect(0, GAME_HEIGHT - t, GAME_WIDTH, t, COLOR.warn)
    this.pixels.fillRect(0, 0, t, GAME_HEIGHT, COLOR.warn)
    this.pixels.fillRect(GAME_WIDTH - t, 0, t, GAME_HEIGHT, COLOR.warn)
  }

  /**
   * 점수 · 남은 시간 · 라이프.
   *
   * 남은 시간을 숫자와 막대로 함께 보여준다. **몇 초 남았는지 모르면 조급함이
   * 생기지 않고, 60초짜리 게임이 그냥 긴 게임이 된다.** 막대는 값이 툭 끊기지
   * 않고 줄어드는 것을 눈으로 보여주는 쪽이고, 숫자는 정확한 쪽이다.
   */
  private renderHud(): void {
    const remaining = Math.max(0, DURATION_SEC - this.playSec)
    const hurry = remaining <= HURRY_SEC

    this.pixels.fillRect(0, 0, GAME_WIDTH, HUD_HEIGHT, COLOR.panel)

    const barWidth = Math.round((GAME_WIDTH * remaining) / DURATION_SEC)
    this.pixels.fillRect(0, HUD_HEIGHT, GAME_WIDTH, 4, COLOR.dim)
    this.pixels.fillRect(0, HUD_HEIGHT, barWidth, 4, hurry ? COLOR.warn : COLOR.calm)

    this.pixels.fillText(`점수 ${this.score}`, 58, HUD_HEIGHT / 2, COLOR.ink, 15)
    this.pixels.fillText(
      `${Math.ceil(remaining)}초`,
      GAME_WIDTH / 2,
      HUD_HEIGHT / 2,
      hurry ? COLOR.warn : COLOR.ink,
      17,
    )

    // 라이프는 남은 것과 잃은 것을 **자리를 유지한 채** 색으로만 구분한다.
    // 사라지게 하면 몇 개짜리였는지가 화면에서 없어져 "이제 몇 번 더 맞아도
    // 되는지"를 셀 수 없다.
    for (let i = 0; i < START_LIVES; i += 1) {
      const x = GAME_WIDTH - 18 - (START_LIVES - i) * 20
      this.pixels.fillRect(x, 15, 14, 14, i < this.lives ? COLOR.warn : COLOR.dim)
    }
  }

  /** 끝난 이유를 0.8초 동안 보여준다. 결과 화면은 바깥이 그린다. */
  private renderOutro(): void {
    if (this.phase === 'play') return

    const y = GAME_HEIGHT / 2 - 40
    this.pixels.fillRect(40, y, GAME_WIDTH - 80, 80, COLOR.panel)
    this.pixels.fillRect(40, y, GAME_WIDTH - 80, 3, COLOR.ink)

    const reason = this.lives <= 0 ? '아야! 라이프를 다 썼어요' : '시간 끝!'
    this.pixels.fillText(reason, GAME_WIDTH / 2, y + 28, COLOR.ink, 15)
    this.pixels.fillText(`점수 ${this.score}`, GAME_WIDTH / 2, y + 56, COLOR.ink, 20)
  }
}

/**
 * 축에 정렬된 두 사각형이 겹치는가(AABB).
 *
 * 이 게임에 필요한 판정은 이것 하나뿐이다. 물리 엔진을 넣지 않는 근거가 이
 * 다섯 줄이다(명세 §8).
 */
function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}
