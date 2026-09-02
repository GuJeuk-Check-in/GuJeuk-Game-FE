// 따라하기 — 미니게임 3종 중 하나(명세 §8.3).
//
// 4색 타일이 순서대로 켜지고, 그 순서를 그대로 되눌러주면 다음 라운드로 간다.
// 라운드마다 패턴이 하나씩 길어지고, 라운드 5부터 재생이 빨라진다. 한 번이라도
// 틀리면 그 자리에서 끝난다.
//
// **이 클래스는 규칙(코인·EXP·에너지)을 모른다.** 끝났을 때 도달 라운드만
// onEnd 로 올려보내고 정산은 game/pet/minigames.ts 가 한다. 여기서 코인을
// 계산하면 밸런싱이 화면 코드 안으로 숨어 테스트로 확인할 수 없게 된다.

import { GameLoop, PointerInput } from '@gujuck/game-core'
import { PALETTE_DARKEST, PALETTE_LIGHTEST, paletteCss } from '../palette'
import type { PaletteHex } from '../palette'
import { PET_METRICS } from '../sprites'
// 앱 안에 play 가 둘이다 — 효과음(sound.play)과 배경음악(music.play). 이름만
// 가져오면 호출부에서 어느 쪽인지 드러나지 않는다. App.tsx 가 같은 이유로 통째로
// 가져온다.
import * as sound from '../sound'
import { GAME_HEIGHT, GAME_WIDTH, PixelStage } from './pixelStage'
import type { MinigameHost } from './types'

// ────────────────────────────────────────────────────────────────────────────
// 색
//
// 팔레트에서 **서로 충분히 떨어진 4색**을 고른다. 이 팔레트는 밝은 쪽에 치우쳐
// 있어(palette.ts 주석: 명도 0.6 미만이 두 색뿐) 명도로는 네 칸을 구분할 수
// 없다. 그래서 색상환에서 벌린다 — 주황 31° · 초록 100° · 파랑 206° · 분홍 319°
// 로 간격이 69~113° 다. 넷의 상대 휘도는 197~207 로 거의 같아서 **색상만으로**
// 구분되고, 흑백으로 봐도 구분이 안 되는 대신 명도 착시로 헷갈리지도 않는다.
//
// f98284(붉은색)는 타일 색으로 쓰지 않는다. 틀렸을 때 깜빡이는 색이라, 평상시에
// 그 색 타일이 화면에 있으면 "틀림"이 읽히지 않는다.
// ────────────────────────────────────────────────────────────────────────────

const TILE_HEX = ['ffc384', 'b0eb93', 'accce4', 'feaae4'] as const satisfies readonly PaletteHex[]

const TILE_COUNT = TILE_HEX.length

const TILE_CSS = TILE_HEX.map(paletteCss)

/** 놀이판 바닥. 레터박스는 PetGame 과 같은 색으로 둬서 화면이 이어져 보이게 한다. */
const CSS_FIELD = paletteCss('6c5671')
const CSS_LETTERBOX = paletteCss(PALETTE_DARKEST)
const CSS_OUTLINE = paletteCss(PALETTE_DARKEST)
const CSS_LIGHT = paletteCss(PALETTE_LIGHTEST)
const CSS_WRONG = paletteCss('f98284')
const CSS_DIM = paletteCss('d9c8bf')

// ────────────────────────────────────────────────────────────────────────────
// 배치 (논리 좌표 360×640)
// ────────────────────────────────────────────────────────────────────────────

const TILE_SIZE = 150
const TILE_GAP = 12
const GRID_X = (GAME_WIDTH - (TILE_SIZE * 2 + TILE_GAP)) / 2
const GRID_Y = 250

/** 타일 아래에 깔린 판의 두께. 눌리면 타일이 이만큼 내려앉는다. */
const DEPTH = 5
/** 켜졌을 때 떠오르는 높이. 눌림(+DEPTH)과 반대 방향이라 둘이 헷갈리지 않는다. */
const LIFT = 2
/** 타일 테두리 두께. 켜지면 이 테가 가장 밝은 색으로 바뀐다. */
const FRAME = 5

const TILE_RECTS = TILE_HEX.map((_, index) => ({
  x: GRID_X + (index % 2) * (TILE_SIZE + TILE_GAP),
  y: GRID_Y + Math.floor(index / 2) * (TILE_SIZE + TILE_GAP),
}))

// 라운드 표시는 화면 맨 위 50px 을 비우고 시작한다. 그 띠는 React HUD(점수·나가기)
// 가 덮을 수 있는 자리다 — STATUS_Y 와 같은 이유다.
const ROUND_TEXT_Y = 50
const DOT_Y = 80
const DOT_SIZE = 8
const DOT_GAP = 4
/**
 * 지금 무엇을 할 차례인지 알리는 한 줄. **타일 바로 위**에 둔다.
 *
 * 화면 맨 아래(600 언저리)에 두면 그 자리를 나가기 버튼 같은 React HUD 가 덮을
 * 수 있다. 게임 캔버스는 자기 위에 무엇이 얹힐지 모르므로, 반드시 보여야 하는
 * 글자는 화면 가장자리에 두지 않는다.
 */
const STATUS_Y = 236

/** 펫의 발밑 줄. 타일 격자 위에 서서 판을 내려다본다. */
const PET_FEET_Y = 218

// ────────────────────────────────────────────────────────────────────────────
// 진행 (초)
// ────────────────────────────────────────────────────────────────────────────

/** 시작하자마자 재생하면 사용자가 아직 화면을 보고 있지 않다. 한 박자 준다. */
const INTRO_SEC = 0.8
/** 라운드 재생 전 뜸. 이게 없으면 앞 라운드의 마지막 입력과 새 재생이 붙어 보인다. */
const PRE_WATCH_SEC = 0.5
const PLAY_LIT_SEC = 0.42
const PLAY_GAP_SEC = 0.18
/** 라운드를 다 맞춘 뒤의 여운. 여기서 끊으면 성공했다는 신호가 없다. */
const CLEAR_SEC = 0.6
/**
 * 라운드 상한까지 간 판의 마무리 여운.
 *
 * 틀린 판은 WRONG_SEC 1.1 초를 붙들고, 다른 두 게임도 끝을 각각 0.8·0.5 초씩
 * 보여준다. 이 게임에서 유일하게 축하할 만한 종료를 그 프레임에 잘라 버리면
 * '완벽해!' 도 펫의 만세도 아무도 못 본다(명세 §14 "연출까지가 그 단계다").
 */
const WON_SEC = 1.0
const WRONG_SEC = 1.1
const WRONG_BLINK_SEC = 0.14
/** 눌린 표시가 남아 있는 시간. 짧게 탭해도 반드시 한 번은 보이게 타이머로 돌린다. */
const PRESS_SEC = 0.18
const HOP_SEC = 0.26
const HOP_PX = 8
const IDLE_BOB_PX = 2
const IDLE_BOB_PERIOD_SEC = 2.6

/** 이 라운드부터 재생이 빨라진다(명세 §8.3). */
const ACCEL_FROM_ROUND = 5
const ACCEL_PER_ROUND = 0.08
/**
 * 가속 상한.
 *
 * 1.8배면 한 타일이 233ms 다. 이보다 빨라지면 켜짐과 꺼짐이 붙어 보여 "몇 번
 * 깜빡였는지"를 셀 수 없게 되는데, 그건 기억력이 아니라 시력 시험이 된다.
 */
const ACCEL_MAX = 1.8

/**
 * 라운드 상한. 여기까지 가면 이긴 것으로 치고 끝낸다(명세 §8.3 에 함께 적어 두었다).
 *
 * 상한이 없으면 패턴이 무한히 길어져 재생만 1분이 넘고, 하루 코인 상한
 * (DAILY_COIN_CAP) 앞에서 의미도 없다. 값을 17 로 잡은 것은 **코인이 라운드 × 3
 * 이기 때문**이다 — 20 이면 60코인이라 §8 이 세 게임에 공통으로 잡은 "잘하면
 * 30~50코인" 밴드를 상한 자체가 넘겨 버리고, 에너지 8 짜리라 12판이 가능한 이
 * 게임에서만 §7 의 "8판 ≈ 코인 상한" 대응이 어긋난다. 17 이면 51코인으로 밴드
 * 상단에 붙는다.
 */
const MAX_ROUND = 17

type Phase = 'intro' | 'watch' | 'input' | 'clear' | 'won' | 'wrong' | 'ended'
type TileState = 'idle' | 'lit' | 'pressed' | 'wrong'

export class EchoGame {
  private readonly host: MinigameHost
  private readonly pixel: PixelStage
  private readonly loop: GameLoop
  private readonly pointer: PointerInput

  private phase: Phase = 'intro'
  /** 현재 단계에 남은 시간(초). 0 이하가 되면 다음 단계로 넘어간다. */
  private timer = INTRO_SEC

  /** 이번 판의 정답 순서. 길이가 곧 현재 라운드 수다. */
  private readonly pattern: number[] = []
  private round = 1

  /** 재생 중 지금 몇 번째를 보여주고 있는지. -1 은 아직 첫 타일 전이다. */
  private watchIndex = -1
  /** 재생으로 켜져 있는 타일. 꺼져 있으면 null. */
  private litTile: number | null = null

  /** 입력 중 지금 몇 번째를 기다리는지. 그대로 진행 표시가 된다. */
  private inputIndex = 0

  private pressTile: number | null = null
  private pressSec = 0

  private wrongTile: number | null = null

  private hopSec: number | null = null
  private elapsedSec = 0

  /**
   * onEnd 를 이미 불렀는지.
   *
   * 계약이 "한 판에 정확히 한 번"이다. 틀림 연출이 끝나는 프레임과 라운드 상한
   * 도달이 겹칠 일은 없지만, 한 번이라도 두 번 불리면 정산이 두 번 돌아 코인이
   * 두 배로 들어간다. 되돌릴 수 없는 사고라 값싼 잠금을 걸어 둔다.
   */
  private finished = false

  /** 라운드 상한까지 갔는가. 끝난 화면의 문구와 펫 자세가 이 값으로 갈린다. */
  private wonAll = false

  constructor(host: MinigameHost) {
    this.host = host
    this.pixel = new PixelStage(host.stage)

    this.loop = new GameLoop({
      update: (dtSec) => this.update(dtSec),
      render: () => this.render(),
    })

    // 포인터는 캔버스에만 건다. document 에 걸면 이 게임이 없어진 뒤에도 화면
    // 아무 데나 누른 것이 여기로 들어온다.
    this.pointer = new PointerInput({
      target: host.stage.canvas,
      onDown: (_point, event) => this.handleDown(event),
    })

    this.loop.start()
  }

  /**
   * 자기가 만든 루프와 리스너를 전부 뗀다.
   *
   * 빠뜨리면 StrictMode 의 마운트 → 언마운트 → 재마운트에서 루프가 두 벌 돌고
   * 탭 한 번이 두 번 먹는다(ARCHITECTURE.md 에 적힌 그 버그).
   */
  destroy(): void {
    this.pointer.destroy()
    this.loop.destroy()
    // 정리된 인스턴스는 아무것도 진행하지 않는다. onEnd 도 여기서는 부르지
    // 않는다 — 화면이 이미 사라졌는데 정산이 도는 것이 더 이상한 일이다.
    this.phase = 'ended'
    this.finished = true
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 진행
  // ──────────────────────────────────────────────────────────────────────────

  private update(dtSec: number): void {
    this.elapsedSec += dtSec

    if (this.pressSec > 0) this.pressSec -= dtSec
    if (this.hopSec !== null) {
      this.hopSec += dtSec
      if (this.hopSec >= HOP_SEC) this.hopSec = null
    }

    if (this.phase === 'watch') {
      this.updateWatch(dtSec)
      return
    }

    if (this.phase === 'input' || this.phase === 'ended') return

    this.timer -= dtSec
    if (this.timer > 0) return

    if (this.phase === 'intro') this.beginRound()
    else if (this.phase === 'clear') this.afterClear()
    else if (this.phase === 'won') this.finish(MAX_ROUND)
    else if (this.phase === 'wrong') this.finish(this.round)
  }

  /**
   * 재생. 켜짐 → 꺼짐 → 다음 타일을 타이머로 잇는다.
   *
   * while 로 도는 것은 한 프레임에 여러 단계가 지나갈 수 있어서다. 고정 스텝
   * 1/60 에서는 그럴 일이 없지만, 남은 시간을 버리지 않고 다음 단계로 넘겨야
   * 재생 간격이 프레임에 끌려 조금씩 늘어나지 않는다.
   */
  private updateWatch(dtSec: number): void {
    this.timer -= dtSec

    while (this.timer <= 0) {
      if (this.litTile !== null) {
        this.litTile = null
        this.timer += this.stepSec(PLAY_GAP_SEC)
        continue
      }

      this.watchIndex += 1
      if (this.watchIndex >= this.pattern.length) {
        this.phase = 'input'
        this.inputIndex = 0
        this.watchIndex = -1
        return
      }

      this.litTile = this.pattern[this.watchIndex]
      // 재생에도 소리를 준다. 이 게임은 순서를 기억하는 게임이라, 소리가 붙으면
      // 색만 볼 때보다 리듬으로도 외울 수 있다. **네 타일이 같은 소리인 것은
      // sound.ts 의 소리표를 늘리지 않기 위해서다** — 타일마다 음을 다르게 하려면
      // 소리표에 네 줄이 늘고, 그 넷은 이 게임 밖에서 쓸 곳이 없다.
      sound.play('tap')
      this.timer += this.stepSec(PLAY_LIT_SEC)
    }
  }

  /** 새 라운드. 패턴을 하나 늘리고 재생부터 시작한다. */
  private beginRound(): void {
    this.pattern.push(this.nextTile())
    this.phase = 'watch'
    this.timer = PRE_WATCH_SEC
    this.watchIndex = -1
    this.litTile = null
    this.inputIndex = 0
    this.host.onScore?.(this.round)
  }

  /**
   * 마지막 라운드를 맞췄으면 곧바로 정산하지 않고 승리 연출을 한 박자 세운다.
   *
   * 여기서 finish 를 바로 부르면 '완벽해!' 와 만세 자세가 그 프레임에만 그려지고
   * 화면이 결과 카드로 넘어간다 — 이 게임에서 유일하게 축하할 만한 종료가 아무도
   * 못 보는 종료가 된다. onEnd 가 한 번만 나가는 것은 finished 잠금이 지킨다.
   */
  private afterClear(): void {
    if (this.round >= MAX_ROUND) {
      this.wonAll = true
      this.phase = 'won'
      this.timer = WON_SEC
      // 마지막 한 번은 뛰면서 끝낸다. idle 로 서서 끝나면 이긴 것으로 안 읽힌다.
      this.hopSec = 0
      // **레벨업 징글을 쓰지 않는다.** 이 판이 끝나면 1초 안에 결과 카드가 뜨고,
      // 거기서 레벨이 올랐으면 App 이 같은 징글을 낸다 — 완전히 같은 소리가 두 번
      // 나면 뒤의 진짜 레벨업이 앞의 메아리로 들린다. 뜻이 다른 사건은 소리가
      // 달라야 어느 쪽인지 안다(§12.13). 다 이긴 것은 '완벽해!' 와 만세 자세와
      // WON_SEC 의 여운이 이미 말하고 있으므로, 소리는 라운드 클리어로 끝낸다.
      sound.play('catch')
      return
    }

    this.round += 1
    this.beginRound()
  }

  /**
   * 판을 닫는다. 점수는 **도달 라운드**다(명세 §8.3).
   *
   * 5라운드를 다 맞추고 6라운드에서 틀렸으면 6이다. 끝낸 라운드 수(5)가 아니라
   * 도달한 번호를 주는 것은 화면에 "라운드 6" 이 떠 있는 상태에서 끝났기
   * 때문이다 — 보고 있던 숫자와 결과 화면의 숫자가 다르면 정산이 틀린 것처럼
   * 보인다.
   */
  private finish(score: number): void {
    if (this.finished) return
    this.finished = true
    this.phase = 'ended'
    this.litTile = null
    // 결과를 올려보내면 대개 화면이 바뀐다. 루프를 먼저 세워 두지 않으면 그
    // 프레임의 render 가 이미 정리된 캔버스에 그린다(CatchGame.finish 와 같다).
    this.loop.stop()
    this.host.onEnd(score)
  }

  /**
   * 다음 타일. 직전과 같은 타일은 고르지 않는다.
   *
   * 같은 타일이 연달아 켜지면 꺼짐 간격이 180ms 뿐이라 한 번 깜빡인 것과
   * 구분되지 않는다. 정답을 알아볼 수 없게 만드는 난이도는 난이도가 아니다.
   */
  private nextTile(): number {
    const last = this.pattern.length === 0 ? -1 : this.pattern[this.pattern.length - 1]

    for (;;) {
      const tile = Math.floor(Math.random() * TILE_COUNT)
      if (tile !== last) return tile
    }
  }

  /** 재생 한 단계의 길이. 라운드 5부터 빨라진다. */
  private stepSec(baseSec: number): number {
    if (this.round < ACCEL_FROM_ROUND) return baseSec

    const speed = Math.min(ACCEL_MAX, 1 + (this.round - ACCEL_FROM_ROUND + 1) * ACCEL_PER_ROUND)
    return baseSec / speed
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 입력
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * 탭 한 번.
   *
   * **재생 중에는 받지 않는다.** 재생과 입력이 겹치면 화면에 켜진 타일이 내가
   * 누른 것인지 게임이 보여주는 것인지 알 수 없고, 그 순간 이 게임의 규칙이
   * 사라진다. 그래서 phase 가 'input' 일 때만 통과시킨다.
   */
  private handleDown(event: PointerEvent): void {
    if (this.phase !== 'input') return

    const point = this.pixel.toLogical(event.clientX, event.clientY)
    const tile = this.tileAt(point.x, point.y)
    if (tile === null) return

    // 맞았든 틀렸든 눌린 표시는 먼저 켠다. 틀렸을 때 "내가 어딜 눌렀는지"가
    // 보이지 않으면 왜 끝났는지 알 수 없다.
    this.pressTile = tile
    this.pressSec = PRESS_SEC

    if (tile !== this.pattern[this.inputIndex]) {
      this.phase = 'wrong'
      this.wrongTile = tile
      this.timer = WRONG_SEC
      // 거절(refuse)이 아니라 피격(hit)이다. 누른 것 자체는 받아들여졌고, 그
      // 결과로 판이 끝난 것이라 게임 안의 사건 쪽이다(§12.13).
      sound.play('hit')
      return
    }

    this.inputIndex += 1
    this.hopSec = 0

    if (this.inputIndex >= this.pattern.length) {
      this.phase = 'clear'
      this.timer = CLEAR_SEC
      // 라운드를 끝낸 순간은 이 게임의 성공 지점이다. 입력 소리(tap)를 함께 내지
      // **않는다** — 같은 프레임에 두 소리를 겹쳐 내면 둘 다 뭉개져 어느 쪽도
      // 신호가 되지 못한다.
      sound.play('catch')
      return
    }

    sound.play('tap')
  }

  /** 논리 좌표가 어느 타일 위인지. 아래 그림자 판까지 눌리는 자리로 친다. */
  private tileAt(x: number, y: number): number | null {
    for (let index = 0; index < TILE_COUNT; index += 1) {
      const rect = TILE_RECTS[index]
      const inX = x >= rect.x && x < rect.x + TILE_SIZE
      const inY = y >= rect.y && y < rect.y + TILE_SIZE + DEPTH
      if (inX && inY) return index
    }

    return null
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 그리기
  // ──────────────────────────────────────────────────────────────────────────

  private render(): void {
    this.pixel.begin(CSS_LETTERBOX)
    this.pixel.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT, CSS_FIELD)

    this.drawHeader()
    this.drawPet()

    for (let index = 0; index < TILE_COUNT; index += 1) this.drawTile(index)

    this.pixel.fillText(this.statusText(), GAME_WIDTH / 2, STATUS_Y, CSS_LIGHT, 14)
  }

  /** 라운드 번호와, 그 라운드 안에서 몇 번째까지 왔는지. */
  private drawHeader(): void {
    this.pixel.fillText(`라운드 ${this.round}`, GAME_WIDTH / 2, ROUND_TEXT_Y, CSS_LIGHT, 22)

    const count = this.pattern.length
    if (count === 0) return

    const stride = DOT_SIZE + DOT_GAP
    const left = Math.round((GAME_WIDTH - (count * stride - DOT_GAP)) / 2)
    const filled = this.progress()
    // 재생과 입력을 다른 색으로 칠한다. 같은 색이면 점이 차오르는 것만 보이고
    // 지금이 보는 차례인지 누르는 차례인지가 점에서는 읽히지 않는다.
    const onColor = this.phase === 'watch' ? CSS_DIM : CSS_LIGHT

    for (let index = 0; index < count; index += 1) {
      const color = index < filled ? onColor : CSS_OUTLINE
      this.pixel.fillRect(left + index * stride, DOT_Y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE, color)
    }
  }

  /** 진행 표시에 채울 개수. 재생 중에는 보여준 개수, 입력 중에는 맞힌 개수다. */
  private progress(): number {
    if (this.phase === 'watch') {
      return Math.min(this.pattern.length, Math.max(0, this.watchIndex + 1))
    }
    if (this.phase === 'clear' || this.phase === 'won') return this.pattern.length
    return this.inputIndex
  }

  /**
   * 이 판이 틀려서 끝났는가(또는 끝나는 중인가).
   *
   * 얼굴과 자세가 같은 조건을 보므로 한 곳에 둔다. 두 벌로 두면 한쪽만 고쳐져
   * 시무룩한 얼굴로 만세를 하는 프레임이 생긴다.
   */
  private failed(): boolean {
    return this.phase === 'wrong' || (this.phase === 'ended' && !this.wonAll)
  }

  private drawPet(): void {
    // 단계마다 크기가 다르므로 좌표도 단계에서 읽는다. 어른 값으로 그리면 아기가
    // 타일 격자 위로 46px 떠서 공중에 선다.
    const metrics = PET_METRICS[this.host.petStage]

    // 틀린 판은 시무룩한 얼굴로 끝난다. 1px 내려앉는 것만으로는 표정이 없던 시절의
    // 신호이고, 이제는 얼굴이 그 말을 대신할 수 있다. 기분 0 도 같은 자리다 —
    // 이유는 CatchGame 의 같은 줄에 적어 두었다(face.ts 의 우선순위).
    const face = this.failed() || this.host.moodZero ? 'sad' : 'base'

    this.pixel.drawSprite(
      this.host.sprites.pets[this.host.petStage][face],
      GAME_WIDTH / 2 - metrics.centerX,
      PET_FEET_Y - metrics.feetY - this.petLift(),
    )
  }

  /**
   * 펫이 바닥선에서 얼마나 떠 있는가(양수 = 위로, **정수 픽셀**).
   *
   * 소수 좌표로 그리면 도트가 흐려진다(명세 §12.3). 맞힐 때마다 한 번 뛰고,
   * 틀리면 1px 내려앉아 시무룩해진다.
   */
  private petLift(): number {
    if (this.failed()) return -1

    if (this.hopSec !== null) {
      const t = Math.min(1, this.hopSec / HOP_SEC)
      // sin 반주기라 t=1 에서 정확히 0 이다. idle 로 돌아갈 때 튀지 않는다.
      return Math.round(HOP_PX * Math.sin(Math.PI * t))
    }

    const phase = (this.elapsedSec / IDLE_BOB_PERIOD_SEC) * Math.PI * 2
    return Math.round(Math.sin(phase) * IDLE_BOB_PX)
  }

  private tileState(index: number): TileState {
    if (this.phase === 'wrong' && this.wrongTile === index) return 'wrong'
    if (this.pressSec > 0 && this.pressTile === index) return 'pressed'
    if (this.litTile === index) return 'lit'
    return 'idle'
  }

  /**
   * 타일 하나.
   *
   * 켜짐을 "색을 밝게"로 만들지 않는다 — 이 팔레트에는 같은 색상의 밝은 짝이
   * 없어서(palette.ts 주석) 밝기만 올릴 수단이 아예 없다. 대신 가장 밝은 색으로
   * 테를 두르고 2px 떠오르게 한다. 눌림은 반대로 그림자 판 자리까지 내려앉는다.
   */
  private drawTile(index: number): void {
    const rect = TILE_RECTS[index]
    const state = this.tileState(index)

    let dy = 0
    if (state === 'lit') dy = -LIFT
    else if (state === 'pressed' || state === 'wrong') dy = DEPTH

    // 아래 판. 타일이 내려앉을 자리를 미리 어둡게 깔아 두는 것이 "눌린다"를
    // 만든다. 이 판이 없으면 눌린 타일이 그냥 아래로 밀린 것으로 보인다.
    this.pixel.fillRect(rect.x, rect.y + DEPTH, TILE_SIZE, TILE_SIZE, CSS_OUTLINE)
    this.pixel.fillRect(rect.x, rect.y + dy, TILE_SIZE, TILE_SIZE, CSS_OUTLINE)

    const innerX = rect.x + FRAME
    const innerY = rect.y + dy + FRAME
    const innerSize = TILE_SIZE - FRAME * 2

    if (state === 'wrong') {
      // 깜빡임이 꺼진 프레임에는 원래 색을 둔다. 붉은색만 껌뻑이면 어느 타일을
      // 눌렀는지가 사라져 "무엇을 틀렸는지"가 남지 않는다.
      const color = this.wrongBlinkOn() ? CSS_WRONG : TILE_CSS[index]
      this.pixel.fillRect(innerX, innerY, innerSize, innerSize, color)
      return
    }

    if (state === 'idle') {
      this.pixel.fillRect(innerX, innerY, innerSize, innerSize, TILE_CSS[index])
      return
    }

    this.pixel.fillRect(innerX, innerY, innerSize, innerSize, CSS_LIGHT)
    this.pixel.fillRect(
      rect.x + FRAME * 2,
      rect.y + dy + FRAME * 2,
      TILE_SIZE - FRAME * 4,
      TILE_SIZE - FRAME * 4,
      TILE_CSS[index],
    )
  }

  private wrongBlinkOn(): boolean {
    return Math.floor((WRONG_SEC - this.timer) / WRONG_BLINK_SEC) % 2 === 0
  }

  private statusText(): string {
    if (this.phase === 'wrong') return '틀렸어! 아쉽다'
    if (this.phase === 'won') return '완벽해!'
    if (this.phase === 'clear') return '좋아! 그대로야'
    if (this.phase === 'input') return '따라 해 봐!'
    if (this.phase === 'ended') return this.wonAll ? '완벽해!' : '틀렸어! 아쉽다'
    return '잘 봐!'
  }
}
