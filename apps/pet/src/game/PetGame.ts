import { GameLoop } from '@gujuck/game-core'
import type { CanvasStage } from '@gujuck/game-core'
import { PALETTE_DARKEST, PALETTE_LIGHTEST } from './palette'
import { DEFAULT_ROOM, ROOMS, roomIndex } from './rooms'
import type { RoomDef } from './rooms'
import { PET_SPRITE, furnitureSpriteName, loadSprites } from './sprites'
import type { SpriteSet } from './sprites'
// 배치의 한 칸 크기와 놓을 수 있는 범위는 규칙 모듈이 정한다. 렌더러가 자기 값을
// 따로 들면 규칙이 허용하는 자리와 화면이 그리는 자리가 갈린다(decor.ts 참조).
// 렌더러 → 규칙 방향의 import 라 §11 의 계층을 거스르지 않는다.
import { DECOR_AREA, FURNITURE_SIZE } from './pet/decor'
import type { FurnitureId, RoomDecor, RoomId } from './types'

/**
 * 논리 해상도. 방 배경 에셋이 정확히 이 크기로 그려져 있다.
 *
 * 화면 크기가 바뀌어도 이 값은 변하지 않는다. 좌표를 화면 크기에 맞춰 다시
 * 계산하면 리사이즈할 때마다 배치가 흔들린다 — 세계는 고정하고 그리기만 확대한다.
 */
export const LOGICAL_WIDTH = 360
export const LOGICAL_HEIGHT = 640

/**
 * idle 애니메이션. sin 파로 위아래로만 움직인다.
 *
 * 진폭은 **정수 픽셀로 반올림해서** 쓴다. 소수 좌표로 그리면 도트가 흐려지는데,
 * 1px 흐려진 도트는 "왜인지 모르게 화질이 나쁜" 화면이 된다.
 *
 * 눈 깜빡임은 넣지 않는다. 표정 오버레이 에셋이 아직 없다(M5). 없는 에셋을
 * 가정한 코드를 미리 써 두면 에셋이 나올 때쯤 아무도 그 코드를 믿지 않는다.
 */
const IDLE_BOB_PX = 2
const IDLE_BOB_PERIOD_SEC = 2.6

/**
 * 방 전환 슬라이드 길이(초).
 *
 * 짧게 잡은 이유는 이 게임의 한 세션이 1~3분이고 방 이동이 그 안에서 가장 자주
 * 하는 동작이기 때문이다. 전환이 길면 여섯 번째 이동부터 방해물이 된다. 이
 * 길이면 60Hz 에서 약 11프레임이고, 한 프레임에 33px 씩 움직인다.
 *
 * 슬라이드 좌표는 매 프레임 **정수로 반올림**한다. 가로로 흐르는 배경을 소수
 * 좌표로 그리면 360×640 도트 전체가 프레임마다 흐려졌다 선명해졌다 한다 —
 * 정지 화면의 1px 흐림보다 훨씬 눈에 띈다.
 */
const ROOM_SLIDE_SEC = 0.18

/**
 * 돌봄 반응(먹이기·씻기기·쓰다듬기)으로 짧게 튀는 동작.
 *
 * |sin| 파형으로 BOUNCE_HOPS 번 튀고 진폭이 (1 - 진행도) 로 줄어든다. 명세
 * §12.3 의 happy 가 "짧은 점프 2회"라서 두 번이고, 두 번째가 낮아야 착지로
 * 읽힌다. 회전·비정수 스케일은 도트를 뭉개므로 쓰지 않고 세로 이동만 한다.
 */
const BOUNCE_SEC = 0.5
const BOUNCE_HEIGHT_PX = 10
const BOUNCE_HOPS = 2

/**
 * 레터박스 색.
 *
 * 팔레트에서 가져온다. 여기에 색을 직접 적으면 팔레트가 두 벌로 갈리고,
 * 나중에 팔레트를 바꿀 때 이 한 곳만 예전 색으로 남는다.
 */
const LETTERBOX_CSS = `#${PALETTE_DARKEST}`
const ERROR_TEXT_CSS = `#${PALETTE_LIGHTEST}`

/**
 * 배치 모드의 점선이 쓰는 밝은 색.
 *
 * 값은 ERROR_TEXT_CSS 와 같지만 이름을 따로 둔다. 뜻이 다른 두 쓰임이 한 이름을
 * 나눠 쓰면, 나중에 오류 문구 색만 바꾸려는 사람이 가구 배치 테두리까지 바꾼다.
 */
const HIGHLIGHT_CSS = `#${PALETTE_LIGHTEST}`

/**
 * 가구를 놓을 수 있는 방.
 *
 * 거실 하나뿐이다(명세 §3 의 "거실 — 펫 쓰다듬기, 가구 배치"). 방마다 배치를
 * 따로 두려면 세이브의 room.placed 가 방별로 갈라져야 하는데, 그건 스키마 변경
 * 이고 마이그레이션이다(§10). 지금 필요하지 않은 값이다.
 */
export const DECOR_ROOM: RoomId = 'living'

/**
 * 배치 모드의 점선 테두리(marching ants).
 *
 * 한 칸이 1px 인 점선이 1초에 ANT_SPEED_PX 만큼 흐른다. **소수 좌표를 쓰지 않고
 * 정수 픽셀만 옮긴다** — 도트 화면에서 소수로 흐르는 점선은 프레임마다 흐려졌다
 * 선명해졌다 한다(ROOM_SLIDE_SEC 주석과 같은 이유).
 */
const ANT_DASH = 3
const ANT_PERIOD = 6
const ANT_SPEED_PX = 9

/** 끌고 있는 가구는 이만큼 떠오른다. 손에 들렸다는 신호이고, 정수 픽셀이다. */
const DRAG_LIFT_PX = 3

/** 세이브에 들어 있는 배치 한 칸. types.ts 의 RoomDecor 에서 그대로 가져온다. */
export type PlacedFurniture = RoomDecor['placed'][number]

/**
 * 배치 중에만 있는, 세이브에 없는 상태.
 *
 * **끌고 있는 좌표를 세이브에 쓰지 않는 이유**: 세이브가 바뀔 때마다
 * localStorage 에 JSON 한 덩어리를 쓴다(usePet). 손가락을 따라 매 프레임 쓰면
 * 초당 60번 직렬화가 돌고, 그동안 화면이 끊긴다. 손을 뗄 때 한 번만 규칙
 * 모듈(decor.ts)을 부르고, 끄는 동안의 그림은 여기서만 만든다.
 */
export interface DecorEdit {
  /** 고른 가구의 인덱스(save.room.placed 기준). 고른 게 없으면 null. */
  selected: number | null
  /** 지금 끌고 있는 것. 그 인덱스는 저장된 자리 대신 이 좌표에 그린다. */
  drag: { index: number; x: number; y: number } | null
  /** 가방에서 꺼내 손끝을 따라다니는 것. 아직 방에 놓이지 않았다. */
  ghost: { item: FurnitureId; x: number; y: number } | null
}

interface Viewport {
  /** 논리 픽셀 하나가 장치 픽셀 몇 개인지. 반드시 정수다. */
  scale: number
  offsetX: number
  offsetY: number
}

/** 진행 중인 방 전환. 끝나면 null 로 돌아간다. */
interface Slide {
  /** 떠나는 방. 들어오는 방은 this.room 이다. */
  from: RoomDef
  /** +1 이면 새 방이 오른쪽에서 들어온다(▶), -1 이면 왼쪽에서(◀). */
  dir: 1 | -1
  /** 진행도 0~1. */
  t: number
}

/**
 * 새 방이 어느 쪽에서 들어오는가.
 *
 * ROOMS 는 좌우로 순환한다. 거실(0)에서 상점(5)으로 가는 것은 오른쪽으로 5칸이
 * 아니라 왼쪽으로 1칸이다. 짧은 쪽을 고르지 않으면 ◀ 를 눌렀는데 화면이
 * 오른쪽으로 흐른다.
 */
export function slideDirection(from: RoomId, to: RoomId): 1 | -1 {
  const forward = (roomIndex(to) - roomIndex(from) + ROOMS.length) % ROOMS.length
  return forward * 2 <= ROOMS.length ? 1 : -1
}

/**
 * 펫타운.
 *
 * 물리·렌더링 엔진에 의존하는 코드는 이 파일 아래에만 둔다.
 * @gujuck/game-core 로는 절대 올리지 않는다 — 그 엔진을 쓰지 않는 게임까지
 * 번들에 끌고 가게 되고, lint가 막는다.
 *
 * 이 클래스는 **규칙을 모른다.** 스탯도 세이브도 여기 없다(game/pet/* 가 갖는다).
 * 여기가 하는 일은 방을 깔고 그 위에 펫을 세워 숨 쉬게 하는 것, 그리고 밖에서
 * 시키는 대로 방을 바꾸고(setRoom) 반응을 보여주는 것(bounce)뿐이다.
 *
 * **방마다 클래스나 컴포넌트를 만들지 않는다.** 방이 다른 점은 배경 그림과 펫이
 * 서는 자리뿐이고, 그 둘은 rooms.ts 에 데이터로 들어 있다(rooms.ts 첫머리 참조).
 */
export class PetGame {
  private readonly stage: CanvasStage
  private readonly loop: GameLoop

  private sprites: SpriteSet | null = null
  private loadError: Error | null = null

  /**
   * destroy() 가 불린 뒤인지.
   *
   * 스프라이트 로딩은 비동기라 언마운트 뒤에 도착할 수 있다. StrictMode 의
   * 마운트 → 언마운트 → 재마운트에서 첫 번째 게임의 콜백이 살아 돌아와 죽은
   * 인스턴스의 상태를 채우는 것을 막는다.
   */
  private disposed = false

  /** idle 파형의 위상. 벽시계가 아니라 누적된 갱신 시간이다(탭이 숨으면 멈춘다). */
  private elapsedSec = 0

  /** 지금 보고 있는 방. 첫 화면은 거실이다(rooms.ts 의 DEFAULT_ROOM). */
  private room: RoomDef = ROOMS[roomIndex(DEFAULT_ROOM)]

  private slide: Slide | null = null

  /** 튀는 동작이 시작된 뒤 흐른 시간(초). 튀고 있지 않으면 null. */
  private bounceSec: number | null = null

  /**
   * 거실에 놓인 가구. **세이브를 직접 읽지 않는다** — 밖에서 setDecor 로 넣어
   * 준다. 이 클래스가 세이브를 알게 되면 규칙과 그리기가 다시 붙는다.
   */
  private placed: readonly PlacedFurniture[] = []

  /** 배치 모드일 때만 값이 있다. 아니면 null. */
  private edit: DecorEdit | null = null

  constructor(stage: CanvasStage) {
    this.stage = stage

    this.loop = new GameLoop({
      update: (dtSec) => this.update(dtSec),
      render: () => this.render(),
    })

    // 로딩을 기다리지 않고 루프를 먼저 돌린다. 스프라이트가 도착하기 전에는
    // 배경색만 그려지고, 도착한 프레임부터 방이 나타난다.
    loadSprites().then(
      (sprites) => {
        if (!this.disposed) this.sprites = sprites
      },
      (error: unknown) => {
        if (this.disposed) return

        this.loadError = error instanceof Error ? error : new Error(String(error))
        // 조용히 빈 화면으로 두지 않는다. 화면에는 사람이 읽을 문구를, 콘솔에는
        // 어느 파일이 실패했는지를 남긴다.
        console.error(this.loadError)
      },
    )

    this.loop.start()
  }

  /** 생성한 루프·리스너는 반드시 여기서 전부 정리한다. */
  destroy(): void {
    // 늦게 도착하는 로딩 콜백보다 먼저 세운다. 순서가 바뀌면 정리된 게임이
    // 다시 상태를 갖는다.
    this.disposed = true
    // 진행 중인 연출도 끊는다. 남겨 둬도 루프가 없어 진행되지는 않지만,
    // "정리된 인스턴스는 아무 상태도 들고 있지 않다"를 지켜야 나중에 재사용
    // 코드가 붙었을 때 죽은 전환이 되살아나지 않는다.
    this.slide = null
    this.bounceSec = null
    this.edit = null
    this.loop.destroy()
  }

  /**
   * 배경과 펫 위치를 그 방으로 바꾼다.
   *
   * 세이브에 없는 방 id 가 오면 rooms.ts 의 roomIndex 가 던진다. 조용히 거실로
   * 돌리지 않는 것은 그쪽의 의도적인 계약이다.
   *
   * **전환 중에 왔던 방으로 되돌아가면 새 슬라이드를 t=0 으로 시작하지 않고 지금
   * 것을 되감는다.** t=0 으로 다시 시작하면 화면 밖으로 나가던 방이 다음 프레임에
   * 한가운데로 되튀고, 펫은 들어오는 방 위에만 그리므로 그 0.18초 동안 펫이 없는
   * 방만 남는다. 화살표를 빠르게 되짚으면(길게 눌러 반복 입력이 들어와도) 바로
   * 재현된다. 되감기는 나가던 방을 그 자리에서 그대로 돌려세운다.
   */
  setRoom(id: RoomId): void {
    if (this.disposed) return

    const next = ROOMS[roomIndex(id)]
    if (next.id === this.room.id) return

    const current = this.slide

    if (current !== null && current.from.id === id) {
      // 되감기. 지금 화면의 두 방이 자리를 맞바꾸므로 진행도도 뒤집는다(1 - t).
      // 그러면 이 프레임의 두 방 위치가 직전 프레임과 정확히 같아 점프가 없다.
      // dir 을 slideDirection 으로 다시 구하지 않는 것은, 방이 3칸 떨어져 있어
      // 양쪽 거리가 같을 때(6개 중 3칸) 왕복이 같은 방향으로 계산되기 때문이다.
      // 되돌아가는 화면은 왔던 길을 거꾸로 가는 것이 눈에 맞다.
      this.slide = {
        from: this.room,
        dir: current.dir === 1 ? -1 : 1,
        t: 1 - Math.min(1, current.t),
      }
      this.room = next
      return
    }

    // 슬라이드에는 떠나는 방의 배경 그림이 필요하다. 아직 로딩 전이면 그릴 것이
    // 없으므로 즉시 전환한다 — 첫 프레임에 setRoom 이 불리는 경우가 그렇다.
    //
    // 같은 방향으로 계속 넘기는 경우(전환 중 ▶ 를 한 번 더)는 여기로 와서 t=0
    // 으로 다시 시작한다. 이어 붙이려면 화면에 걸치는 방이 셋이 되어 그리는
    // 쪽까지 필름처럼 바꿔야 하는데, 되짚기와 달리 화면이 뒤로 튀지는 않으므로
    // (다음 방이 진행 방향에서 들어온다) 그 값은 지금 치르지 않는다.
    this.slide =
      this.sprites === null
        ? null
        : { from: this.room, dir: slideDirection(this.room.id, id), t: 0 }
    this.room = next
  }

  /**
   * 돌봄 반응. 짧게 위로 튀었다 내려온다.
   *
   * 이미 튀고 있어도 처음부터 다시 시작한다. 진행 중이면 무시하도록 두면 연타
   * 했을 때 두 번째 행동이 아무 반응 없이 지나가 "먹인 게 맞나" 싶어진다.
   */
  bounce(): void {
    if (this.disposed) return
    this.bounceSec = 0
  }

  /** 방에 놓인 가구를 통째로 갈아 끼운다. 세이브의 room.placed 를 그대로 넘긴다. */
  setDecor(placed: readonly PlacedFurniture[]): void {
    if (this.disposed) return
    this.placed = placed
  }

  /** 배치 모드의 임시 상태. 모드를 나가면 null 을 넣는다. */
  setDecorEdit(edit: DecorEdit | null): void {
    if (this.disposed) return
    this.edit = edit
  }

  /**
   * 화면 좌표(클라이언트 픽셀)를 논리 좌표로 옮긴다.
   *
   * 배치 조작은 React 쪽 div 가 받는데, 그 div 는 배율도 레터박스 여백도 모른다.
   * 그 계산을 화면이 다시 하면 viewport() 와 두 벌이 되어, 레터박스가 생기는
   * 기기에서만 가구가 손끝에서 어긋나 놓인다. 배치는 이 클래스가 쥔다.
   *
   * 배율을 stage.dpr 이 아니라 캔버스 폭 대 실제 폭의 비로 재는 것은, CSS 로
   * 캔버스가 늘어나 있는 경우까지 맞추기 위해서다.
   */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.stage.canvas.getBoundingClientRect()
    const { scale, offsetX, offsetY } = this.viewport()

    // 폭이 0 이면 아직 레이아웃 전이다. 0 으로 나누면 NaN 이 좌표로 흘러간다.
    const perClient = rect.width > 0 ? this.stage.canvas.width / rect.width : 1

    return {
      x: Math.round(((clientX - rect.left) * perClient - offsetX) / scale),
      y: Math.round(((clientY - rect.top) * perClient - offsetY) / scale),
    }
  }

  /**
   * 그 논리 좌표에 놓인 가구의 인덱스. 없으면 null.
   *
   * **뒤에서부터 본다.** 그리는 순서가 배열 순서라 나중 것이 위에 겹쳐 있고,
   * 눈에 보이는 쪽이 집혀야 한다. 앞에서부터 찾으면 겹친 자리에서 밑에 깔린
   * 가구가 집혀 "다른 게 움직인다".
   */
  hitTest(x: number, y: number): number | null {
    for (let index = this.placed.length - 1; index >= 0; index -= 1) {
      const spot = this.placed[index]
      const inside =
        x >= spot.x && x < spot.x + FURNITURE_SIZE && y >= spot.y && y < spot.y + FURNITURE_SIZE
      if (inside) return index
    }
    return null
  }

  private update(dtSec: number): void {
    this.elapsedSec += dtSec

    if (this.slide !== null) {
      this.slide.t += dtSec / ROOM_SLIDE_SEC
      if (this.slide.t >= 1) this.slide = null
    }

    if (this.bounceSec !== null) {
      this.bounceSec += dtSec
      if (this.bounceSec >= BOUNCE_SEC) this.bounceSec = null
    }
  }

  /**
   * 화면 확대 배율과 레터박스 여백.
   *
   * **CSS 픽셀이 아니라 장치 픽셀을 기준으로 정수배를 잡는다.** CanvasStage 는
   * ctx 에 setTransform(dpr) 을 걸어 두므로 보통은 CSS 픽셀만 쓰면 되지만,
   * dpr 이 1.25 · 1.5 인 기기(윈도우 배율 조정)에서는 CSS 픽셀의 정수 좌표가
   * 장치 픽셀의 정수 좌표가 아니다. 그러면 도트 격자가 장치 픽셀에 어긋나
   * 어떤 줄은 두 배로, 어떤 줄은 한 배로 그려진다. 장치 픽셀로 배율을 잡으면
   * 그런 일이 없고, 덤으로 dpr 2 기기에서는 0.5 CSS 픽셀 단위의 더 촘촘한
   * 배율 단계를 쓸 수 있다.
   */
  private viewport(): Viewport {
    const { canvas } = this.stage
    const raw = Math.min(canvas.width / LOGICAL_WIDTH, canvas.height / LOGICAL_HEIGHT)

    // 화면이 논리 해상도보다 작으면 배율이 0 이 되어 아무것도 안 보인다.
    // 1.5배 같은 소수 배율은 도트를 뭉개므로, 그 경우에는 ×1 로 그리고 넘치는
    // 만큼 잘리게 둔다. 뭉갠 화면보다 잘린 화면이 낫다.
    const scale = Math.max(1, Math.floor(raw))

    return {
      scale,
      offsetX: Math.floor((canvas.width - LOGICAL_WIDTH * scale) / 2),
      offsetY: Math.floor((canvas.height - LOGICAL_HEIGHT * scale) / 2),
    }
  }

  private render(): void {
    const { ctx, canvas } = this.stage
    const { scale, offsetX, offsetY } = this.viewport()

    // 캔버스 백버퍼 크기가 바뀌면 컨텍스트 상태가 통째로 초기화된다. 리사이즈
    // 시점을 따로 잡지 않고 매 프레임 다시 거는 편이 빠뜨릴 곳이 없다.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false

    ctx.fillStyle = LETTERBOX_CSS
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 배율과 여백이 모두 정수(장치 픽셀)이므로, 논리 좌표의 정수는 장치 픽셀의
    // 정수로 그대로 떨어진다. 여기서부터는 360×640 좌표로만 생각하면 된다.
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY)

    if (this.loadError !== null) {
      this.renderLoadError(ctx)
      return
    }

    const sprites = this.sprites
    if (sprites === null) return

    const slide = this.slide
    const dir = slide === null ? 1 : slide.dir
    // 반올림해서 정수 픽셀로만 움직인다. 이 한 줄이 전환 중 도트가 뭉개지는지를
    // 정한다(ROOM_SLIDE_SEC 주석 참조).
    const shift = slide === null ? LOGICAL_WIDTH : Math.round(Math.min(1, slide.t) * LOGICAL_WIDTH)

    // 들어오는 방은 dir 쪽 화면 밖(±360)에서 출발해 0 으로 온다.
    const roomX = dir * (LOGICAL_WIDTH - shift)

    // 자연 크기로 그린다. 폭·높이를 지정해 늘리면 에셋이 360×640 이 아닐 때
    // 소수 배율로 늘어나 도트가 뭉개진다. 어긋나면 잘리는 편이 눈에 띈다.
    if (slide !== null) {
      const fromX = -dir * shift
      ctx.drawImage(sprites.rooms[slide.from.asset], fromX, 0)
      // 떠나는 방에도 가구를 그린다. 배경만 흘러나가고 가구가 그 자리에서
      // 사라지면 거실을 나가는 순간 가구가 증발한 것처럼 보인다.
      this.renderDecor(ctx, sprites, slide.from, fromX, false)
    }

    ctx.drawImage(sprites.rooms[this.room.asset], roomX, 0)
    // 가구는 배경 위, 펫 아래다. 펫 뒤에 두면 펫이 화분에 가려진다.
    this.renderDecor(ctx, sprites, this.room, roomX, true)

    // 펫은 들어오는 방 위에만 그린다. 떠나는 방에도 그리면 전환 도중 펫이 화면에
    // 두 마리 보인다.
    ctx.drawImage(
      sprites.pet,
      roomX + this.room.anchor.x - PET_SPRITE.centerX,
      this.room.anchor.y - PET_SPRITE.feetY - this.petLift(),
    )
  }

  /**
   * 방에 놓인 가구와 배치 모드의 표시.
   *
   * `live` 는 지금 보고 있는 방인지다. 전환 중 떠나는 방에는 가구만 그리고
   * 선택 테두리나 손끝의 가구는 그리지 않는다 — 조작은 언제나 들어와 있는 방을
   * 향하고, 두 방에 같은 테두리가 뜨면 어느 쪽을 만지고 있는지 알 수 없다.
   */
  private renderDecor(
    ctx: CanvasRenderingContext2D,
    sprites: SpriteSet,
    room: RoomDef,
    roomX: number,
    live: boolean,
  ): void {
    if (room.id !== DECOR_ROOM) return

    const edit = live ? this.edit : null

    // 놓을 수 있는 범위를 먼저 알린다. 눌러도 안 놓이는 자리를 눌러 보고 알게
    // 하지 않는다(§14 "거절도 반응인가").
    if (edit !== null) {
      this.renderAnts(
        ctx,
        roomX + DECOR_AREA.left - 2,
        DECOR_AREA.top - 2,
        DECOR_AREA.right - DECOR_AREA.left + FURNITURE_SIZE + 4,
        DECOR_AREA.bottom - DECOR_AREA.top + FURNITURE_SIZE + 4,
      )
    }

    this.placed.forEach((spot, index) => {
      // 세 조건을 풀어 쓰는 것은 타입 좁히기 때문이다. `edit?.drag?.index === index`
      // 로 물어도 컴파일러는 아래에서 edit.drag 가 null 이 아님을 알지 못한다.
      const dragging =
        edit !== null && edit.drag !== null && edit.drag.index === index ? edit.drag : null
      const x = roomX + (dragging ? dragging.x : spot.x)
      // 끌고 있는 것은 살짝 떠오른다. 손에 들렸다는 것이 이 3px 로 읽힌다.
      const y = (dragging ? dragging.y : spot.y) - (dragging ? DRAG_LIFT_PX : 0)

      ctx.drawImage(sprites.furniture[furnitureSpriteName(spot.item)], x, y)

      // 고른 것과 끌고 있는 것에 테두리를 두른다. 어느 가구를 만지고 있는지가
      // 보이지 않으면 "집기" 버튼이 무엇을 집는지 알 수 없다.
      if (dragging !== null || edit?.selected === index) {
        this.renderAnts(ctx, x - 1, y - 1, FURNITURE_SIZE + 2, FURNITURE_SIZE + 2)
      }
    })

    // 가방에서 꺼낸 가구는 마지막에, 전부 위에 그린다. 손끝에 들린 것이 다른
    // 가구 뒤로 숨으면 어디에 놓이는지 보이지 않는다.
    const ghost = edit?.ghost
    if (ghost) {
      const x = roomX + ghost.x
      const y = ghost.y - DRAG_LIFT_PX
      ctx.drawImage(sprites.furniture[furnitureSpriteName(ghost.item)], x, y)
      this.renderAnts(ctx, x - 1, y - 1, FURNITURE_SIZE + 2, FURNITURE_SIZE + 2)
    }
  }

  /**
   * 흐르는 점선 테두리.
   *
   * 배치 모드에서만 쓴다. 정지한 테두리로 두면 방 배경의 선과 구별되지 않아
   * "지금 배치 중"이라는 신호가 되지 못한다. 흐르는 방향이 하나뿐이라 어지럽지
   * 않고, 값싸다 — 한 변에 fillRect 가 몇 번 들어갈 뿐이다.
   */
  private renderAnts(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    // 바탕을 먼저 깔고 그 위에 밝은 점선을 얹는다. 두 색을 번갈아 계산하는 것보다
    // 짧고, 어두운 배경 위에서도 밝은 배경 위에서도 테두리가 읽힌다.
    ctx.fillStyle = LETTERBOX_CSS
    ctx.fillRect(x, y, width, 1)
    ctx.fillRect(x, y + height - 1, width, 1)
    ctx.fillRect(x, y, 1, height)
    ctx.fillRect(x + width - 1, y, 1, height)

    // 정수 픽셀로만 흐른다. 소수로 옮기면 점선이 프레임마다 흐려진다.
    const phase = Math.floor(this.elapsedSec * ANT_SPEED_PX) % ANT_PERIOD
    ctx.fillStyle = HIGHLIGHT_CSS

    for (let at = -phase; at < width; at += ANT_PERIOD) {
      const from = Math.max(0, at)
      const to = Math.min(width, at + ANT_DASH)
      if (to <= from) continue
      ctx.fillRect(x + from, y, to - from, 1)
      ctx.fillRect(x + width - to, y + height - 1, to - from, 1)
    }

    for (let at = -phase; at < height; at += ANT_PERIOD) {
      const from = Math.max(0, at)
      const to = Math.min(height, at + ANT_DASH)
      if (to <= from) continue
      ctx.fillRect(x + width - 1, y + from, 1, to - from)
      ctx.fillRect(x, y + height - to, 1, to - from)
    }
  }

  /**
   * 펫이 바닥선에서 얼마나 떠 있는가(양수 = 위로, 정수 픽셀).
   *
   * 튀는 동안에는 idle 흔들림을 섞지 않는다. 두 파형을 더하면 착지 지점이
   * ±2px 씩 흔들려 발이 바닥에 닿았다는 느낌이 사라진다.
   */
  private petLift(): number {
    if (this.bounceSec !== null) {
      const t = Math.min(1, this.bounceSec / BOUNCE_SEC)
      // (1 - t) 를 곱해 두 번째 점프가 낮아진다. t = 1 에서 정확히 0 이라
      // idle 로 돌아갈 때 튀지 않는다.
      return Math.round(BOUNCE_HEIGHT_PX * (1 - t) * Math.abs(Math.sin(Math.PI * BOUNCE_HOPS * t)))
    }

    const phase = (this.elapsedSec / IDLE_BOB_PERIOD_SEC) * Math.PI * 2
    return Math.round(Math.sin(phase) * IDLE_BOB_PX)
  }

  /**
   * 에셋을 못 불러왔을 때.
   *
   * 도트가 아니라 시스템 폰트로 그린다. 이 화면은 사용자가 아니라 개발자를
   * 향한 것이고, 읽히는 것이 예쁜 것보다 중요하다.
   */
  private renderLoadError(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = ERROR_TEXT_CSS
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('그림을 불러오지 못했어요', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 12)

    ctx.font = '11px sans-serif'
    ctx.fillText(
      '콘솔에 어느 파일이 실패했는지 남겼습니다',
      LOGICAL_WIDTH / 2,
      LOGICAL_HEIGHT / 2 + 12,
    )
  }
}
