import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { AuthResult } from '@gujuck/api'
import { GameCanvas, GameShell } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { DECOR_ROOM, PetGame } from './game/PetGame'
import type { DecorEdit } from './game/PetGame'
import {
  FOODS,
  HOUR_MS,
  OFFLINE_CAP_MS,
  TUTORIAL_APPLE_COUNT,
  TUTORIAL_COMPLETE_COIN,
  WELCOME_BACK_MIN_MS,
  expForNextLevel,
  stageForLevel,
} from './game/pet/economy'
import type { MinigameId } from './game/pet/economy'
import { FOOD_IDS } from './game/pet/foods'
import { shouldShowWelcomeBack } from './game/pet/stats'
import type { ActionOutcome } from './game/pet/actions'
import type { Settlement } from './game/pet/minigames'
import { FURNITURE_SIZE, clampToDecorArea } from './game/pet/decor'
import { canSkip, currentStep, isRoomUnlocked } from './game/pet/tutorial'
import { highlightAttrs } from './components/highlight'
import { DEFAULT_ROOM, roomAt, roomIndex } from './game/rooms'
import type { ActionId } from './game/rooms'
import type { FoodId, FurnitureId, ItemId, RoomId } from './game/types'
import { PALETTE_CSS } from './game/palette'
// 소리는 모듈 하나가 통째로 상태(AudioContext · 음소거)를 들고 있어서, 이름을
// 하나씩 가져오면 화면의 지역 변수와 이름이 겹친다(setMuted 가 그렇다). 어디서
// 부른 것인지 읽히도록 통째로 가져온다.
import * as sound from './game/sound'
import * as music from './game/music'
import { NamePrompt } from './components/NamePrompt'
import { StatBar } from './components/StatBar'
import { WelcomeBackCard } from './components/WelcomeBackCard'
import { RoomNav } from './components/RoomNav'
import { ActionBar } from './components/ActionBar'
import { InventorySheet } from './components/InventorySheet'
import { PlayMenu } from './components/PlayMenu'
import { MinigameScreen } from './components/MinigameScreen'
import { ResultCard } from './components/ResultCard'
import { ShopScreen } from './components/ShopScreen'
import { DecorateBar } from './components/DecorateBar'
import { TutorialOverlay } from './components/TutorialOverlay'
import { Toast } from './components/Toast'
import { AuthScreen } from './components/AuthScreen'
import { ConflictCard } from './components/ConflictCard'
import { LogoutSheet } from './components/LogoutSheet'
import { usePet } from './usePet'
import type { ActionKind } from './usePet'
import { beginSession, currentSession, onSessionEnd } from './session'
import type { Session } from './session'
import './App.css'

/**
 * 팔레트를 CSS 변수로 깐다.
 *
 * App.css 에 색을 직접 적으면 palette.ts 가 색의 유일한 출처가 아니게 되고,
 * 에셋 색과 UI 색이 조용히 어긋난다. 팔레트 순서는 palette.ts 가 바꾸지 말라고
 * 못 박아 둔 계약이므로 인덱스로 지목해도 안전하다.
 */
interface PaletteStyle extends CSSProperties {
  [key: `--pt-c${number}`]: string
}

const PALETTE_STYLE: PaletteStyle = PALETTE_CSS.reduce<PaletteStyle>((vars, color, index) => {
  vars[`--pt-c${index}`] = color
  return vars
}, {})

/**
 * 개발용 시간 점프 버튼.
 *
 * 값을 economy.ts 에서 파생시킨다. 이 버튼들이 짚는 것은 임의의 시간이 아니라
 * 복귀 카드 경계와 오프라인 상한이라서, 숫자로 다시 적으면 상한을 8시간으로
 * 내리는 순간 "상한을 확인하는 버튼"이 상한 너머를 가리키게 된다.
 */
const JUMP_MS = [HOUR_MS, WELCOME_BACK_MIN_MS, OFFLINE_CAP_MS, 2 * OFFLINE_CAP_MS] as const

/**
 * 미니게임의 이름·설명·점수 단위.
 *
 * 고르는 화면(PlayMenu)과 결과 화면(ResultCard)이 같은 말을 써야 해서 여기 한
 * 곳에 두고 양쪽에 내려보낸다. 각 컴포넌트가 자기 표를 들면 "간식받기"와
 * "간식 받기"처럼 갈라지고, 게임이 늘었을 때 한쪽만 고쳐진다.
 *
 * Record 로 둔 것은 게임이 추가되면 문구 누락을 타입이 잡게 하기 위함이다.
 */
const MINIGAME_TEXT: Record<MinigameId, { label: string; hint: string; unit: string }> = {
  catch: {
    label: '간식받기',
    hint: '떨어지는 간식을 받아요. 폭탄은 피하고!',
    unit: '점',
  },
  hop: {
    label: '폴짝 달리기',
    hint: '탭하면 점프, 길게 누르면 더 높이.',
    unit: 'm',
  },
  echo: {
    label: '따라하기',
    hint: '불빛 순서를 기억해서 그대로 눌러요.',
    unit: '라운드',
  },
}

/**
 * 메뉴에 뜨는 순서. 명세 §8 의 8.1 → 8.3 과 같다.
 *
 * **손으로 적은 배열을 두지 않고 위 표에서 뽑는다.** 배열은 원소 개수를 검사하지
 * 않아서, 네 번째 게임이 MinigameId 에 추가되면 MINIGAME_TEXT 는 컴파일 오류로
 * 막아 주지만 배열은 그대로 통과하고 그 게임만 메뉴에서 조용히 빠진 채 빌드된다.
 * 객체 리터럴의 문자열 키는 적은 순서를 유지하므로 여기 순서는 위 표의 순서다.
 */
const MINIGAME_ORDER = Object.keys(MINIGAME_TEXT) as MinigameId[]

/**
 * 돌봄 행동마다 낼 소리.
 *
 * 먹이기·씻기기에는 전용 소리가 있고 나머지(쓰다듬기·재우기·깨우기)는 tap 이다.
 * 재우기에 소리를 새로 만들지 않은 것은 이 화면 하나 때문에 sound.ts 의 소리표를
 * 늘리지 않기 위해서다 — 잠드는 소리는 다른 어디에서도 쓸 곳이 없다.
 *
 * Record 로 둔 것은 행동이 늘었을 때 빠뜨림을 타입이 잡게 하기 위함이다.
 * MINIGAME_TEXT 와 같은 이유다.
 */
const SOUND_OF: Record<ActionKind, sound.SoundName> = {
  feed: 'feed',
  wash: 'wash',
  pat: 'tap',
  sleep: 'tap',
  wake: 'tap',
}

/**
 * 놀이터 흐름의 현재 자리.
 *
 * 셋을 한 값으로 두면 "메뉴를 띄운 채 게임이 돌고 있다" 같은 조합이 아예
 * 만들어지지 않는다. 놀고 있지 않으면 null 이다.
 */
type PlayPhase =
  | { kind: 'menu' }
  | { kind: 'playing'; game: MinigameId }
  | { kind: 'result'; game: MinigameId; score: number; settlement: Settlement }

interface ToastState {
  /** 같은 문구가 연달아 떠도 타이머가 새로 돌게 하는 값. Toast 의 key 로 쓴다. */
  id: number
  message: string
  detail: string | null
}

/**
 * 배치 모드의 화면 상태. 배치 중이 아니면 null 이다.
 *
 * **세이브에 넣지 않는다.** 손에 무엇을 들었는지는 잃어도 되는 값이고, 세이브에
 * 넣으면 스키마 변경 + 마이그레이션이 된다(§10). 방 번호를 세이브에 넣지 않은
 * 것과 같은 판단이다.
 */
interface DecorUi {
  /** 가방에서 꺼내 손에 든 가구. 방을 누르면 이게 놓인다. */
  picked: FurnitureId | null
  /** 방에서 고른 가구의 인덱스(save.room.placed 기준). */
  selected: number | null
  /**
   * 끌고 있는 것. index 가 null 이면 아직 방에 없는 것(가방에서 꺼낸 것)이다.
   *
   * 좌표를 세이브가 아니라 여기 두는 이유는 PetGame.DecorEdit 주석에 적었다 —
   * 손끝을 따라 매 프레임 저장하면 초당 60번 직렬화가 돈다.
   */
  drag: { index: number | null; x: number; y: number } | null
}

/**
 * 손끝이 가구의 한가운데를 잡게 만드는 보정.
 *
 * 크기를 스프라이트가 아니라 decor.ts 에서 읽는다. 좌표의 뜻(왼쪽 위 기준, 한 칸
 * 48px)을 정하는 것은 배치 규칙이고, 화면이 그 값을 따로 들면 규칙 쪽 상한과
 * 화면의 중심 보정이 어긋나는 날이 온다.
 */
const FURNITURE_HALF = FURNITURE_SIZE / 2

/**
 * 화면 쪽 모양(DecorUi)을 그리는 쪽 모양(DecorEdit)으로 옮긴다.
 *
 * 둘이 다른 것은 일부러다. 캔버스는 "손에 든 것"과 "옮기는 중인 것"을 다르게
 * 그리는데, 조작 쪽에서는 둘 다 그냥 끌고 있는 하나다. 변환을 이 한 곳에 두면
 * 양쪽이 각자 자연스러운 모양을 쓸 수 있고, effect 와 마운트 두 경로가 같은
 * 규칙으로 상태를 세운다.
 */
function toDecorEdit(decor: DecorUi | null): DecorEdit | null {
  if (decor === null) return null

  const drag = decor.drag
  return {
    selected: decor.selected,
    drag: drag !== null && drag.index !== null ? { index: drag.index, x: drag.x, y: drag.y } : null,
    ghost:
      drag !== null && drag.index === null && decor.picked !== null
        ? { item: decor.picked, x: drag.x, y: drag.y }
        : null,
  }
}

/**
 * 로그인 껍데기.
 *
 * **펫타운은 로그인이 입장 조건이다**(PET_SERVER_API.md §2). 다른 게임처럼
 * "로그인 없이 해보기"를 두지 않는 것은, 기관에서 한 기기를 여러 사람이 번갈아
 * 쓰기 때문이다 — 익명으로 시작하면 그 진행이 누구 것인지 알 수 없다.
 */
export default function App() {
  const [session, setSession] = useState<Session | null>(currentSession)
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * 세션은 화면이 부르지 않은 순간에도 끝난다 — 자동 저장이 올리다 만난 401 이
   * 그렇다. 여기서 듣지 않으면 로그인이 끊긴 채로 화면만 계속 돌고, 그동안의
   * 진행은 어디에도 올라가지 않는다.
   */
  useEffect(
    () =>
      onSessionEnd((reason) => {
        setSession(null)
        setNotice(
          reason === 'expired'
            ? '로그인이 만료되어 나왔어요. 다시 로그인하면 이어서 놀 수 있어요.'
            : null,
        )
      }),
    [],
  )

  const enter = useCallback((result: AuthResult) => {
    setNotice(null)
    setSession(beginSession(result))
  }, [])

  if (!session) {
    return (
      <div className="pt-root" style={PALETTE_STYLE}>
        <GameShell>
          <div className="pt-center">
            <AuthScreen onAuthenticated={enter} notice={notice} />
          </div>
        </GameShell>
      </div>
    )
  }

  // **key 로 사람이 바뀌면 상태를 통째로 새로 만든다.** 앞사람의 방·가방·열려
  // 있던 카드가 남아 있으면 공용 기기에서는 그것만으로 사고다.
  return <PetTown key={session.memberId} session={session} />
}

function PetTown({ session }: { session: Session }) {
  const {
    save,
    report,
    recovered,
    persistError,
    start,
    act,
    checkPlay,
    finishGame,
    buyItem,
    placeFurniture,
    moveFurniture,
    pickUpFurniture,
    confirmTutorial,
    skipTutorial,
    tutorialFinishedAt,
    jump,
    grant,
    dismissReport,
    // 화면에는 이미 phase(놀이터 흐름)가 있다. 뜻이 전혀 다르므로 이름을 나눈다.
    phase: loadPhase,
    conflict,
    syncError,
    resolveConflict,
    logout,
    retryLoad,
  } = usePet(session)
  const gameRef = useRef<PetGame | null>(null)

  // 현재 방은 **세이브에 넣지 않는다.** 명세 §10 의 스키마에 없는 필드이고,
  // 넣으면 스키마 변경 + 마이그레이션이 된다. 어느 방에 있었는지는 잃으면 안 되는
  // 진행이 아니다 — 새로고침하면 거실에서 시작하는 것으로 충분하다.
  const [cursor, setCursor] = useState(() => roomIndex(DEFAULT_ROOM))
  const room = roomAt(cursor)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [decor, setDecor] = useState<DecorUi | null>(null)
  const [justBought, setJustBought] = useState<ItemId | null>(null)
  const [phase, setPhase] = useState<PlayPhase | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastSeq = useRef(0)

  /**
   * 음소거 표시. **값의 주인은 sound 모듈이고 여기는 그 사본이다.**
   *
   * 세이브가 아니라 별도 localStorage 키에 사는 값이라(§12.13) 훅이 들고 있지
   * 않다. 화면이 다시 그려지려면 React 가 아는 상태가 하나 필요해서 여기서 한 벌
   * 들고 있고, 바꾸는 것은 언제나 sound.setMuted 를 지난다 — 두 값이 갈리면
   * 버튼은 켜졌다고 하는데 소리가 안 나는 상태가 만들어진다.
   */
  const [muted, setMuted] = useState(() => sound.isMuted())

  /** 나가기 확인 시트가 떠 있는가. 공용 기기라 잘못 눌러 나가는 것도 사고다. */
  const [leaving, setLeaving] = useState(false)

  /** 끌기를 시작한 손끝과 가구 왼쪽 위의 차. 이걸 안 재면 잡는 순간 가구가 튄다. */
  const grabRef = useRef({ dx: FURNITURE_HALF, dy: FURNITURE_HALF })

  // 캔버스가 만들어지는 시점에 현재 방을 알려주기 위한 최신 값. 상태를 그대로
  // 읽으면 handleMount 가 매 렌더마다 새 함수가 되어야 한다.
  const roomIdRef = useRef<RoomId>(room.id)
  roomIdRef.current = room.id

  // 같은 이유로 배치도 최신 값을 들고 있는다. 방과 달리 이건 세이브가 늦게
  // 도착할 수 있어서(로딩), 마운트 때 비어 있는 것이 정상이다.
  const placed = save?.room.placed
  const placedRef = useRef(placed)
  placedRef.current = placed

  // 배치 편집 상태도 같은 이유로 최신 값을 들고 있는다. 세 조각(방 · 놓인 가구 ·
  // 편집 상태) 중 둘만 마운트에서 복원하면, 배치 중에 캔버스가 다시 붙었을 때
  // 점선 테두리와 손에 든 가구만 사라진다.
  const decorRef = useRef<DecorUi | null>(null)

  /**
   * 캔버스에 넘길 펫의 겉모습.
   *
   * **레벨을 단계로 바꾸지 않고 그대로 넘긴다.** 방 캔버스는 붙어 있는 내내
   * 레벨업을 지켜보는 쪽이라, 단계를 미리 굳혀 넘기면 화면이 그 갱신까지 책임지게
   * 된다. 레벨만 넘기면 갱신 시점이 PetGame.setPet 안으로 들어간다(§6). 미니게임
   * 호스트는 반대로 판이 도는 동안 단계가 고정이라 이미 정해진 단계를 받는다.
   * 어느 쪽이든 판정 자체는 economy.ts 의 stageForLevel 한 곳에서만 한다.
   * 기분 0 도 마찬가지로 사실만 넘기고 어떤 얼굴인지는 face.ts 가 정한다(§4).
   */
  const petLevel = save?.pet.level ?? null
  const petMoodZero = save !== null && save.stats.mood <= 0

  // 성장 단계와 기분도 마운트 때 세워야 한다. 미니게임에서 돌아오면 방 캔버스가
  // 통째로 다시 붙는데, 그때 넣어 주지 않으면 아래 effect 가 돌기 전 한 프레임이
  // 기본값(아기 · 멀쩡한 얼굴)으로 그려진다.
  const petViewRef = useRef<{ level: number; moodZero: boolean } | null>(null)
  petViewRef.current = petLevel === null ? null : { level: petLevel, moodZero: petMoodZero }

  // GameCanvas는 이 콜백을 마운트 시 한 번만 부른다. 돌려주는 함수에서
  // 게임을 확실히 정리해야 StrictMode 재마운트에서 루프가 두 벌 돌지 않는다.
  const handleMount = useCallback((stage: CanvasStage) => {
    const game = new PetGame(stage)
    // 첫 방은 여기서 직접 세운다. 아래 effect 는 게임이 생기기 전에 한 번 지나갈
    // 수 있고, 그것만 믿으면 다른 방에서 새로고침했을 때 배경이 어긋난다.
    game.setRoom(roomIdRef.current)
    if (placedRef.current) game.setDecor(placedRef.current)
    game.setDecorEdit(toDecorEdit(decorRef.current))
    if (petViewRef.current) game.setPet(petViewRef.current)
    gameRef.current = game

    return () => {
      game.destroy()
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    gameRef.current?.setRoom(room.id)
  }, [room.id])

  /**
   * 레벨과 기분이 바뀌면 캔버스에 알린다. 게임 클래스는 세이브를 모른다.
   *
   * 레벨업으로 단계가 바뀌는 순간이 이 경로를 지난다 — 미니게임 정산이나 먹이기
   * 직후에 세이브가 갈리고, 그 커밋에서 펫이 커진다.
   */
  useEffect(() => {
    if (petLevel === null) return
    gameRef.current?.setPet({ level: petLevel, moodZero: petMoodZero })
  }, [petLevel, petMoodZero])

  /**
   * 첫 사용자 제스처에서 오디오를 연다. **이 전에는 어떤 소리도 나지 않는다.**
   *
   * 모바일 브라우저는 사용자 제스처 없이 시작된 AudioContext 를 정지 상태로
   * 만든다(자동재생 정책). 앱 전체에서 한 번만 걸면 되므로 여기 한 곳에 둔다 —
   * 버튼마다 걸면 캔버스를 먼저 만진 사람은 영영 무음이 된다.
   *
   * **`once: true` 를 쓰지 않는다.** 탭을 백그라운드로 보냈다 돌아오면 컨텍스트가
   * suspended 로 남아 그 뒤로 계속 무음인데, unlock() 은 그 경우 resume 만 하고
   * 끝난다(sound.ts). 매 제스처마다 부르는 값이 그 복구보다 싸다.
   *
   * capture 로 잡는 것은 도중에 stopPropagation 하는 핸들러가 있어도 닿게 하려는
   * 것이다. 소리를 여는 것은 화면의 조작과 경쟁할 일이 아니다.
   */
  useEffect(() => {
    // 컨텍스트가 열린 뒤에야 음악을 걸 수 있다. **여기서 곡을 고르지 않는다** —
    // start() 는 화면이 마지막으로 요청한 곡을 이어 걸므로(music.ts 의 wanted),
    // 미니게임 도중에 캔버스를 탭해도 그 판의 곡이 홈 곡으로 갈아 끼워지지 않는다.
    //
    // **음소거로 시작한 세션에는 아무것도 열지 않는다.** 음악의 muted 는 볼륨만
    // 0 으로 두고 예약은 계속하므로, 켜 두면 들리지 않는 음을 세션 내내 합성한다.
    // 잠금 해제도 미룬다 — 음소거를 푸는 것 역시 버튼을 누르는 제스처라 그때
    // 열어도 늦지 않다(toggleMute).
    const open = () => {
      if (sound.isMuted()) return
      sound.unlock()
      music.start()
    }
    const options: AddEventListenerOptions = { capture: true, passive: true }

    window.addEventListener('pointerdown', open, options)
    window.addEventListener('keydown', open, options)

    return () => {
      window.removeEventListener('pointerdown', open, options)
      window.removeEventListener('keydown', open, options)
      // 예약된 음표가 남아 있으므로 반드시 멈춘다. StrictMode 재마운트에서
      // 두 벌이 겹쳐 돌면 화음이 어긋난 채로 두 곡이 흐른다.
      music.stop()
    }
  }, [])

  // 놓인 가구가 바뀌면 캔버스에 넣어 준다. 게임 클래스는 세이브를 모른다.
  useEffect(() => {
    if (placed) gameRef.current?.setDecor(placed)
  }, [placed])

  /** 배치 모드의 임시 상태를 캔버스로 넘긴다. 변환 규칙은 toDecorEdit 한 곳에 있다. */
  useEffect(() => {
    decorRef.current = decor
    gameRef.current?.setDecorEdit(toDecorEdit(decor))
  }, [decor])

  /**
   * 구매 반응은 잠깐이면 된다.
   *
   * 지우지 않으면 다음에 상점을 열었을 때도 그 줄이 켜져 있어, 방금 산 것처럼
   * 보인다. 길이는 토스트(2.6초)보다 짧게 잡았다 — 반응이 문구보다 오래 남으면
   * 무엇에 대한 반응인지 흐려진다.
   */
  useEffect(() => {
    if (justBought === null) return
    const timer = window.setTimeout(() => setJustBought(null), 900)
    return () => window.clearTimeout(timer)
  }, [justBought])

  const pushToast = useCallback((message: string, detail: string | null = null) => {
    toastSeq.current += 1
    setToast({ id: toastSeq.current, message, detail })
  }, [])

  /**
   * 튜토리얼이 끝난 순간을 축하한다.
   *
   * `tutorial.done` 이 아니라 "끝난 시각"을 보는 이유는 usePet 에 적었다 —
   * 플래그를 보면 새로고침할 때마다 다시 축하한다. 보상 액수는 economy.ts 에서
   * 읽는다. 여기 숫자를 적으면 상수를 고쳤을 때 문구만 옛 값으로 남는다.
   */
  useEffect(() => {
    if (tutorialFinishedAt === null) return
    pushToast('튜토리얼 끝! 이제 마음대로 놀아도 돼요.', `보너스 +${TUTORIAL_COMPLETE_COIN} 코인`)
    gameRef.current?.bounce()
    // 코인 소리가 아니라 레벨업 소리다. 지급도 있지만 이 순간의 뜻은 "다 배웠다"
    // 이고, 그건 이 게임에서 레벨업과 같은 급의 사건이다.
    sound.play('levelUp')
  }, [tutorialFinishedAt, pushToast])

  /**
   * 코인을 벌어 왔으면 펫이 기뻐한다.
   *
   * handleEnd 안에서 부르지 않는 이유: 게임이 도는 동안에는 방 캔버스가 아예
   * 마운트되어 있지 않아 gameRef 가 비어 있다. 결과 화면으로 바뀌는 커밋에서
   * 방이 다시 붙고, 자식 effect 가 부모보다 먼저 도므로 여기서는 gameRef 가 차 있다.
   */
  useEffect(() => {
    if (phase?.kind !== 'result') return
    if (phase.settlement.coins <= 0) return
    gameRef.current?.bounce()
    // 레벨이 올랐으면 코인 소리 대신 레벨업 소리다. 결과 카드에 두 줄이 함께
    // 뜨는데 소리까지 겹쳐 내면 둘 다 뭉개지고, 더 큰 소식은 레벨 쪽이다
    // (돌봄 쪽 showOutcome 과 같은 규칙).
    sound.play(phase.settlement.leveledUpTo === null ? 'coin' : 'levelUp')
  }, [phase])

  const dismissToast = useCallback(() => setToast(null), [])

  /**
   * 음소거 토글.
   *
   * 끄는 쪽에서는 아무 소리도 내지 않고, 켜는 쪽에서만 한 번 낸다. **켰다는
   * 사실을 소리로 확인시켜 주지 않으면** 볼륨이 0 인 기기에서 버튼만 바뀐 채로
   * "켰는데 안 들린다"가 되고, 그때 사람은 게임이 고장 났다고 생각한다.
   */
  const toggleMute = useCallback(() => {
    const next = !sound.isMuted()
    sound.setMuted(next)

    // 음소거로 시작한 세션에는 컨텍스트도 곡도 아직 없다. 이 클릭이 곧 사용자
    // 제스처라 여기서 열어도 자동재생 정책에 걸리지 않는다.
    if (!next) sound.unlock()

    // 배경음악도 같은 값을 따른다. 값을 넘기지 않고 읽어 가게 하는 것은 음소거의
    // 주인을 sound 하나로 두기 위해서다(music.ts 의 syncMuted). 이미 돌고 있는
    // 곡은 여기서 볼륨만 되돌아오고, 아직 없으면 아래 start() 가 처음 건다.
    music.syncMuted()
    if (!next) music.start()

    setMuted(next)
    if (!next) sound.play('tap')
  }, [])

  /**
   * 아직 서버에 물어보는 중이다.
   *
   * **여기서 이름 입력을 띄우면 안 된다.** 세이브가 null 이라는 것만으로는 펫이
   * 없는 것인지 아직 모르는 것인지 구분되지 않아서, 이미 펫이 있는 사람이 새
   * 펫을 만들게 된다(usePet 의 LoadPhase).
   */
  if (loadPhase === 'loading') {
    return (
      <div className="pt-root" style={PALETTE_STYLE}>
        <GameShell>
          <div className="pt-center">
            <p className="pt-gate" role="status">
              펫을 데려오는 중…
            </p>
          </div>
        </GameShell>
      </div>
    )
  }

  /**
   * 서버를 못 만났고 이 기기에도 진행이 없다.
   *
   * 새 펫을 주고 싶어지지만 그러면 안 된다 — 서버에 이미 펫이 있는데 못 물어본
   * 것일 수 있고, 그때는 이름을 짓고 한참 논 다음에야 충돌로 알게 된다.
   *
   * 나가기를 함께 두는 것은 공용 기기이기 때문이다. 서버가 오래 죽어 있으면 이
   * 사람은 못 놀지만, 다음 사람은 로그인부터 다시 해 볼 수 있어야 한다.
   */
  if (loadPhase === 'retry') {
    return (
      <div className="pt-root" style={PALETTE_STYLE}>
        <GameShell>
          <div className="pt-center">
            <div className="pt-gate__card">
              <p className="pt-gate__lead" role="alert">
                서버에 연결하지 못했어요. 진행이 서버에 있어서 연결되기 전에는 시작할 수 없습니다.
              </p>
              <button className="gj-btn gj-btn--primary" type="button" onClick={retryLoad}>
                다시 시도
              </button>
              <button className="gj-btn gj-btn--ghost" type="button" onClick={() => void logout()}>
                다른 사람으로 로그인
              </button>
            </div>
          </div>
        </GameShell>
      </div>
    )
  }

  if (!save) {
    return (
      <div className="pt-root" style={PALETTE_STYLE}>
        <GameShell>
          <div className="pt-center">
            <NamePrompt onSubmit={start} notice={recovered} />
          </div>
        </GameShell>
      </div>
    )
  }

  /** 액션 결과를 화면에 옮긴다. 거절이면 message 에 이유가 들어 있다(계약). */
  const showOutcome = (kind: ActionKind, outcome: ActionOutcome) => {
    // 레벨업은 따로 알린다. 한 줄에 붙이면 "배불러!"에 묻혀 지나간다.
    pushToast(
      outcome.message,
      outcome.leveledUpTo === null ? null : `레벨업! Lv.${outcome.leveledUpTo}`,
    )

    if (!outcome.changed) {
      // **거절에도 소리를 준다.** 아무 반응이 없으면 눌리지 않은 것처럼 느껴진다
      // (§14 "거절도 반응인가"). 튀지는 않는다 — 거절에도 튀면 무엇이 먹혔는지
      // 알 수 없다.
      sound.play('refuse')
      return
    }

    // 먹였을 때만 입을 벌린다. 나머지 돌봄은 튀기만 한다.
    if (kind === 'feed') gameRef.current?.eat()
    else gameRef.current?.bounce()

    // 레벨이 올랐으면 행동 소리 **대신** 레벨업 소리를 낸다. 같은 프레임에 둘을
    // 겹쳐 내면 둘 다 뭉개지고, 이 순간의 소식은 레벨업 쪽이다.
    sound.play(outcome.leveledUpTo === null ? SOUND_OF[kind] : 'levelUp')
  }

  const run = (kind: ActionKind, food?: FoodId) => {
    const outcome = act(kind, food)
    if (outcome) showOutcome(kind, outcome)
  }

  const handleAction = (id: ActionId) => {
    // 먹이주기만 한 단계를 더 거친다. 무엇을 먹일지 골라야 하기 때문이다.
    if (id === 'feed') {
      setSheetOpen(true)
      return
    }
    // 미니게임도 마찬가지다. 어느 게임을 할지 먼저 고른다.
    if (id === 'play') {
      setPhase({ kind: 'menu' })
      return
    }
    if (id === 'shop') {
      setShopOpen(true)
      return
    }

    run(id === 'sleep' && save.sleep !== null ? 'wake' : id)
  }

  /**
   * 방을 옮긴다.
   *
   * **잠금 판정은 tutorial.ts 한 곳에서만 한다.** 여기서 단계 번호를 비교하면
   * 해금 규칙이 두 벌이 되고, 명세 §3 의 표를 고칠 때 한쪽만 바뀐다.
   *
   * 잠긴 방으로 가려 하면 조용히 무시하지 않고 이유를 띄운다(§14 "거절도
   * 반응인가"). 화살표에 자물쇠가 붙어 있어도, 눌렀을 때 아무 일이 없으면
   * 고장으로 읽힌다.
   */
  const move = (delta: number) => {
    const target = roomAt(cursor + delta)

    if (!isRoomUnlocked(save, target.id)) {
      pushToast(`아직 잠긴 방이에요 — ${target.label}`, '튜토리얼을 조금 더 진행하면 열려요.')
      sound.play('refuse')
      return
    }

    // 방이 실제로 바뀌는 것만 소리를 낸다. 잠긴 방은 위에서 이미 거절 소리를 냈다.
    sound.play('tap')

    // 방을 나가면 배치 모드도 끝난다. 거실에만 놓을 수 있으므로(PetGame 의
    // DECOR_ROOM), 모드만 남기면 다른 방에서 눌러도 아무 일이 없는 상태가 된다.
    setDecor(null)
    setShopOpen(false)
    setCursor((at) => at + delta)
  }

  /** 상점에서 하나 산다. 산 것이 어디로 갔는지까지 알려야 "샀다"가 완결된다. */
  const handleBuy = (item: ItemId) => {
    const outcome = buyItem(item)
    if (!outcome) return

    pushToast(outcome.message, outcome.changed ? '가방에 넣어 두었어요.' : null)

    if (!outcome.changed) {
      // 돈이 모자라 못 산 것도 반응이 있어야 한다. 목록이 길어 토스트만으로는
      // 무엇이 거절됐는지 눈이 늦게 따라온다.
      sound.play('refuse')
      return
    }

    // 방금 산 줄이 잠깐 반응한다. 목록이 길어 토스트만으로는 어느 줄이
    // 팔렸는지 보이지 않는다.
    setJustBought(item)
    gameRef.current?.bounce()
    sound.play('coin')
  }

  /**
   * 판이 끝났다. 정산하고 결과 카드로 넘어간다.
   *
   * 에너지 차감도 보상 지급도 finishGame 한 번에 들어 있다. 여기서 코인을 더하는
   * 코드를 쓰면 규칙이 화면으로 새어 나오고, 서버 검증(2단계)에 옮겨 쓸 수 없게 된다.
   */
  const handleEnd = (game: MinigameId, score: number) => {
    const settlement = finishGame(game, score)
    if (!settlement) {
      setPhase(null)
      return
    }

    setPhase({ kind: 'result', game, score, settlement })
  }

  const handlePick = (food: FoodId) => {
    setSheetOpen(false)
    run('feed', food)
  }

  // ---- 가구 배치 ------------------------------------------------------------
  //
  // 좌표 변환과 충돌 판정은 전부 PetGame 이 한다. 여기서 배율과 레터박스를 다시
  // 계산하면 그 계산이 두 벌이 되어, 레터박스가 생기는 기기에서만 가구가 손끝에서
  // 어긋나 놓인다(PetGame.toLogical 주석).

  const startDecorate = () => {
    // 배치 중에 다른 판이 떠 있으면 방을 누를 수가 없다. 들어오면서 전부 닫는다.
    setSheetOpen(false)
    setShopOpen(false)
    setPhase(null)
    setDecor({ picked: null, selected: null, drag: null })
  }

  const handleDecorDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const game = gameRef.current
    if (!game || decor === null) return

    // 손가락이 캔버스 밖으로 나가도 이동·놓기가 계속 오게 잡아 둔다. 없으면
    // 화면 가장자리에서 끌던 가구가 그 자리에 얼어붙는다.
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = game.toLogical(event.clientX, event.clientY)

    if (decor.picked !== null) {
      // 가방에서 꺼낸 것은 손끝 한가운데에 들린다.
      grabRef.current = { dx: FURNITURE_HALF, dy: FURNITURE_HALF }
      const spot = clampToDecorArea(point.x - FURNITURE_HALF, point.y - FURNITURE_HALF)
      setDecor({ ...decor, selected: null, drag: { index: null, x: spot.x, y: spot.y } })
      return
    }

    const index = game.hitTest(point.x, point.y)
    if (index === null) {
      setDecor({ ...decor, selected: null, drag: null })
      return
    }

    // hitTest 가 준 인덱스는 캔버스가 들고 있는 배열 기준이고, 그 배열은 effect 가
    // 나중에 밀어 넣는다 — 세이브의 배열과 한 커밋 어긋날 수 있다. 손을 뗄 때와
    // 같은 모양으로 막아 둔다. 여기서 undefined 를 읽으면 포인터 핸들러 안에서
    // TypeError 가 나고, ErrorBoundary 가 없어 화면이 통째로 죽는다.
    const spot = save.room.placed[index]
    if (!spot) {
      setDecor({ ...decor, selected: null, drag: null })
      return
    }

    // 이미 놓인 것은 잡은 자리를 그대로 유지한다. 한가운데로 맞추면 잡는 순간
    // 가구가 손끝으로 튀어 "내가 옮긴 것"으로 읽히지 않는다.
    grabRef.current = { dx: point.x - spot.x, dy: point.y - spot.y }
    setDecor({ ...decor, selected: index, drag: { index, x: spot.x, y: spot.y } })
  }

  const handleDecorMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const game = gameRef.current
    if (!game || decor === null || decor.drag === null) return

    const point = game.toLogical(event.clientX, event.clientY)
    const { dx, dy } = grabRef.current
    const spot = clampToDecorArea(point.x - dx, point.y - dy)

    setDecor({ ...decor, drag: { index: decor.drag.index, x: spot.x, y: spot.y } })
  }

  /** 손을 뗄 때 한 번만 규칙 모듈을 부른다. 끄는 동안의 좌표는 화면에만 있다. */
  const handleDecorUp = () => {
    if (decor === null || decor.drag === null) return
    const drag = decor.drag

    if (drag.index === null) {
      const item = decor.picked
      setDecor({ picked: null, selected: null, drag: null })
      if (item === null) return

      const outcome = placeFurniture(item, drag.x, drag.y)
      if (outcome) {
        pushToast(outcome.message)
        // 놓였는지 거절됐는지가 소리로 먼저 온다. 가구는 손끝에 가려 있어서
        // 놓인 자리가 손을 뗀 뒤에야 보인다.
        sound.play(outcome.changed ? 'tap' : 'refuse')
      }
      return
    }

    const before = save.room.placed[drag.index]
    setDecor({ ...decor, drag: null })

    // 제자리에서 뗀 것은 "고른 것"이지 "옮긴 것"이 아니다. 그때도 moveTo 를
    // 부르면 탭할 때마다 "옮겼어요" 가 뜬다.
    if (!before || (before.x === drag.x && before.y === drag.y)) return

    const outcome = moveFurniture(drag.index, drag.x, drag.y)
    // 성공은 화면이 이미 말하고 있다(가구가 그 자리에 있다). 거절만 문구로 알린다.
    if (outcome && !outcome.changed) {
      pushToast(outcome.message)
      sound.play('refuse')
    }
  }

  /**
   * 손짓이 취소됐다. **놓지 않고 끌던 것만 버린다.**
   *
   * pointercancel 은 "이 제스처는 없던 일이다"라는 신호다(두 번째 손가락이 닿거나
   * 브라우저가 시스템 제스처로 가져갈 때 온다). 놓기와 같은 핸들러에 물려 두면
   * 사용자가 놓은 적 없는 자리에 가구가 놓이고 가방에서 한 개가 사라진다.
   *
   * 손에 든 것(picked)은 그대로 둔다. 취소는 "고른 것을 되돌리라"는 뜻이 아니다.
   */
  const handleDecorCancel = () => {
    setDecor((at) => (at === null ? at : { ...at, drag: null }))
  }

  const handlePickUp = () => {
    if (decor === null || decor.selected === null) return

    const outcome = pickUpFurniture(decor.selected)
    setDecor({ ...decor, selected: null, drag: null })
    if (outcome) {
      pushToast(outcome.message)
      sound.play(outcome.changed ? 'tap' : 'refuse')
    }
  }

  const playing = phase !== null && phase.kind === 'playing' ? phase : null

  /**
   * 위쪽 띠에 무엇을 띄울지. **로컬 저장 실패가 서버 동기화 실패보다 급하다.**
   *
   * 로컬이 막혔으면 지금 이 순간의 진행이 어디에도 없다. 서버만 막힌 것은 로컬에
   * 남아 있고 다음 로그인에 이어진다(sync.ts). 둘을 함께 쌓지 않는 것은 띠가 두
   * 줄이 되면 캔버스를 덮기 때문이다.
   */
  const banner = persistError ?? syncError

  const header = (
    <div className="pt-hud">
      <div className="pt-hud__row">
        <span className="pt-hud__name">{save.pet.name}</span>
        <span className="pt-hud__level">Lv.{save.pet.level}</span>
        <span className="pt-hud__exp">
          {Math.round(save.pet.exp)} / {expForNextLevel(save.pet.level)}
        </span>
        <span className="pt-hud__coins">
          <span aria-hidden="true">◎</span> {save.wallet.coins}
        </span>
        {/* 음소거는 HUD 의 기존 줄 안에 둔다. 줄을 새로 만들면 HUD 가 몇 px
            두꺼워지고, 그것만으로 캔버스의 정수 배율이 2 에서 1 로 떨어질 수
            있다(§14 의 M2 기록). 상태는 아이콘과 글자 둘로 보인다 — 아이콘만
            두면 지금이 켜진 것인지 끄는 버튼인지 갈린다. */}
        <button
          type="button"
          className={muted ? 'pt-hud__mute is-muted' : 'pt-hud__mute'}
          onClick={toggleMute}
          aria-pressed={muted}
        >
          <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
          <span className="pt-hud__mute-text">소리 {muted ? '끔' : '켬'}</span>
        </button>
        {/* 나가기는 **언제나 보이는 자리**에 있어야 한다. 묻히면 사람들이 그냥
            자리를 뜨고, 다음 사람이 앞사람 계정으로 계속 논다(§12 의 열린 질문 4).

            버튼 글자가 닉네임인 것은 한 자리에서 두 가지를 하기 때문이다 —
            지금 누구인지 보여주는 것과, 나가는 것. HUD 에 줄을 더하면 캔버스의
            정수 배율이 2 에서 1 로 떨어질 수 있어 자리를 새로 낼 수 없다. */}
        {/* 판이 도는 동안에는 내린다. 확인 시트가 캔버스를 덮으면 게임은 보이지도
            눌리지도 않는데 루프는 그대로 돌아 혼자 진행된다(아래 판들과 같은 이유).
            한 판은 길어야 1분이라 그때까지 기다려도 된다. */}
        {playing === null ? (
          <button
            type="button"
            className="pt-hud__leave"
            onClick={() => setLeaving(true)}
            aria-label={`${session.nickname} 님으로 로그인 중 — 나가기`}
          >
            <span aria-hidden="true">🚪</span>
            <span className="pt-hud__leave-text">{session.nickname}</span>
          </button>
        ) : null}
      </div>
      {/* 튜토리얼이 게이지를 가리킬 때 잡는 대상이다. StatBar 를 고치지 않고
          감싸는 것은, 강조가 스탯 표시의 일이 아니라 튜토리얼의 일이기 때문이다
          — 게이지는 자기가 강조될 수 있다는 것을 몰라야 한다. */}
      <div className="pt-hud__stats">
        <div {...highlightAttrs('hunger')}>
          <StatBar label="밥" tone="hunger" value={save.stats.hunger} />
        </div>
        <StatBar label="기분" tone="mood" value={save.stats.mood} />
        <div {...highlightAttrs('clean')}>
          <StatBar label="청결" tone="clean" value={save.stats.clean} />
        </div>
        <StatBar label="기운" tone="energy" value={save.stats.energy} />
      </div>
    </div>
  )

  /** 지금 튜토리얼 단계. 끝났으면 null 이고, 그러면 오버레이가 아예 없다. */
  const tutorialStep = currentStep(save)

  const welcomeBack = report !== null && shouldShowWelcomeBack(report)

  /**
   * 게임 중에는 액션 바를 내린다.
   *
   * 한 손으로 하는 게임이라 화면 아래가 곧 조작 영역이다. 그 자리에 먹이주기가
   * 남아 있으면 점프하려다 밥을 준다. 세로 공간이 캔버스로 돌아가는 것도 이득이다
   * — 도트는 중간 배율이 없어 몇 px 이 배율 한 단계를 가른다(§14 의 M2 기록).
   */
  const footer = playing ? null : (
    <div className="pt-footer">
      {decor ? (
        <DecorateBar
          inventory={save.inventory}
          picked={decor.picked}
          selected={decor.selected}
          placedCount={save.room.placed.length}
          onPick={(item) => setDecor({ ...decor, picked: item, selected: null, drag: null })}
          onPickUp={handlePickUp}
          onExit={() => setDecor(null)}
        />
      ) : (
        <ActionBar
          actions={room.actions}
          sleeping={save.sleep !== null}
          lockedReason={isRoomUnlocked(save, room.id) ? null : '아직 열리지 않은 방이에요.'}
          onAction={handleAction}
          // 꾸미기는 거실에서만 뜬다. 다른 방에 두면 눌러 봐야 놓을 수 없다.
          onDecorate={room.id === DECOR_ROOM ? startDecorate : undefined}
        />
      )}

      {/* import.meta.env.DEV 는 Vite 가 빌드 시점에 false 로 치환하므로, 프로덕션
          번들에서는 이 블록 전체가 통째로 떨어져 나간다. */}
      {/* 접어 둔다. 펼친 채로 두면 세로 공간을 먹어 캔버스의 정수 배율이 한 단계
          내려가고, 게임 화면이 실제보다 작게 보인다(도트라 중간 배율이 없다). */}
      {import.meta.env.DEV ? (
        <details className="pt-dev">
          <summary className="pt-dev__toggle">개발 도구</summary>
          <div className="pt-devbar">
            <span className="pt-devbar__label">시간 점프</span>
            {JUMP_MS.map((ms) => (
              <button
                key={ms}
                type="button"
                className="gj-btn pt-devbar__btn"
                onClick={() => jump(ms)}
              >
                +{ms / HOUR_MS}시간
              </button>
            ))}
            {/* M4 에서 상점이 열려 코인으로 살 수 있게 됐지만, 이 버튼은 남긴다.
              돌봄 규칙만 확인하려는데 매번 미니게임으로 코인을 벌어야 하면
              확인 한 번이 몇 분짜리가 된다.

              개수는 튜토리얼 2단계 지급(§9)과 같은 값을 그대로 가져온다. 숫자를
              다시 적고 "같은 3개다"라고 주석을 달면, 한쪽을 고치는 순간 그 주석이
              거짓이 된다. */}
            <span className="pt-devbar__label">지급</span>
            {FOOD_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="gj-btn pt-devbar__btn"
                onClick={() => grant(id, TUTORIAL_APPLE_COUNT)}
              >
                {FOODS[id].label} {TUTORIAL_APPLE_COUNT}개
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )

  return (
    <div className="pt-root" style={PALETTE_STYLE}>
      {/* 미니게임 중에도 HUD 를 켜 둔다. 한 번 접어 봤는데, 스테이지가 이미 642px
          이라 배율은 그대로 2 이면서 위아래 검은 띠만 172px 로 늘어났다. 같은
          자리를 비워 두느니 기운·배고픔을 보여주는 편이 낫다 — 판을 더 할 수
          있는지가 그 숫자로 결정된다. */}
      <GameShell header={header} footer={footer}>
        <div className={decor ? 'pt-stage is-decor' : 'pt-stage'}>
          {/* 게임 중에는 방 캔버스를 통째로 내린다. 겹쳐 두면 보이지도 않는 방
              루프가 계속 돌고, 캔버스 두 장이 같은 화면에서 배율을 다투게 된다.
              내리면 PetGame.destroy 가 불려 루프와 리스너가 확실히 정리된다. */}
          {playing ? (
            <MinigameScreen
              game={playing.game}
              // 방에서 보이던 그 펫이 그대로 나와야 한다. 여기서만 단계로 바꾸는
              // 것은 미니게임 호스트가 판이 도는 동안 **고정된 단계**를 요구하기
              // 때문이다(minigames/types.ts) — 레벨을 넘기면 세 게임이 저마다
              // 판정을 다시 하게 되고, 그때 §6 의 표가 여러 벌로 흩어진다.
              // 판정 자체는 economy.ts 의 stageForLevel 한 곳뿐이다.
              petStage={stageForLevel(save.pet.level)}
              // 기분도 같이 넘긴다. 방에서 시무룩하던 펫이 미니게임에 들어가는
              // 순간 멀쩡한 얼굴이 되면, 바뀐 것이 없는데 얼굴만 바뀐 셈이다.
              moodZero={petMoodZero}
              onEnd={(score) => handleEnd(playing.game, score)}
              onExit={() => setPhase(null)}
            />
          ) : (
            <RoomNav
              room={room}
              prevLabel={roomAt(cursor - 1).label}
              nextLabel={roomAt(cursor + 1).label}
              prevLocked={!isRoomUnlocked(save, roomAt(cursor - 1).id)}
              nextLocked={!isRoomUnlocked(save, roomAt(cursor + 1).id)}
              // 배치 중에는 스와이프를 끈다. 가구를 끄는 손짓이 그대로 스와이프
              // 조건을 만족해서, 화분을 옮기려 하면 방이 넘어간다.
              swipe={decor === null}
              onPrev={() => move(-1)}
              onNext={() => move(1)}
            >
              <GameCanvas onMount={handleMount} />

              {/* 배치 조작을 받는 면. 캔버스 위에 얹지만 화살표보다는 아래다
                  (RoomNav 가 화살표를 이 아이 뒤에 그린다). 배치 모드가 아닐
                  때는 아예 만들지 않는다 — 남겨 두면 펫을 쓰다듬는 탭까지
                  이 면이 먼저 삼킨다. */}
              {decor ? (
                <div
                  className="pt-decor__surface"
                  onPointerDown={handleDecorDown}
                  onPointerMove={handleDecorMove}
                  onPointerUp={handleDecorUp}
                  onPointerCancel={handleDecorCancel}
                />
              ) : null}
            </RoomNav>
          )}

          {/* 저장이 막혀 있으면 알린다. 조용히 두면 진행이 남는다고 믿은 채 계속 논다.

              로컬 저장 실패가 서버 동기화 실패보다 급하다. 로컬이 막혔으면 지금
              이 순간의 진행이 어디에도 없지만, 서버만 막힌 것은 로컬에 남아 있고
              다음 로그인에 이어진다(sync.ts). 둘을 한 자리에 쌓지 않는 것은 띠가
              두 줄이 되면 캔버스를 덮기 때문이다. */}
          {banner ? (
            <p className="pt-banner" role="status">
              {banner}
            </p>
          ) : null}

          {toast ? (
            <Toast
              key={toast.id}
              message={toast.message}
              detail={toast.detail}
              onDone={dismissToast}
            />
          ) : null}

          {/* 방 화면의 덮개는 게임 중에 띄우지 않는다. 이것들은 inset:0 에
              배경까지 깔린 판이라 캔버스 위에 얹히는 순간 게임이 보이지도,
              눌리지도 않게 된다 — 그런데 게임 루프는 그대로 돌아서 그 판은
              혼자 진행되어 정산까지 간다. 특히 복귀 카드는 사용자가 부르지
              않았는데도 뜬다: 게임 도중 화면을 껐다가 4시간 뒤에 켜면
              visibilitychange 가 경과 리포트를 만들고, 같은 순간 GameLoop 이
              스스로 다시 돌기 시작한다. 리포트는 버리지 않고 들고 있다가 판이
              끝난 뒤에 보여준다. */}
          {playing === null && sheetOpen ? (
            <InventorySheet
              inventory={save.inventory}
              // 빈 가방 문구가 "상점에서 사면 된다"인지 "아직 안 열렸다"인지가
              // 갈린다. 판정은 tutorial.ts 한 곳에서 한다.
              shopUnlocked={isRoomUnlocked(save, 'shop')}
              onPick={handlePick}
              onClose={() => setSheetOpen(false)}
            />
          ) : null}

          {phase !== null && phase.kind === 'menu' ? (
            <PlayMenu
              items={MINIGAME_ORDER.map((id) => {
                const text = MINIGAME_TEXT[id]
                const verdict = checkPlay(id)
                return {
                  id,
                  label: text.label,
                  hint: text.hint,
                  ok: verdict.ok,
                  reason: verdict.reason,
                }
              })}
              // 튜토리얼 중에는 에너지가 깎이지 않는다(§9). 예고하는 값과 실제로
              // 깎이는 값이 다르면 그것만으로 화면이 거짓말을 한다.
              energyFree={tutorialStep !== null}
              onPick={(game) => setPhase({ kind: 'playing', game })}
              onClose={() => setPhase(null)}
            />
          ) : null}

          {phase !== null && phase.kind === 'result' ? (
            <ResultCard
              label={MINIGAME_TEXT[phase.game].label}
              unit={MINIGAME_TEXT[phase.game].unit}
              score={phase.score}
              settlement={phase.settlement}
              // 한 판 더는 메뉴로 돌아간다. 같은 게임을 곧바로 다시 시작하면
              // 기운이 모자라 못 들어가는 경우에 갈 곳이 없어진다.
              onAgain={() => setPhase({ kind: 'menu' })}
              onClose={() => setPhase(null)}
            />
          ) : null}

          {playing === null && shopOpen ? (
            <ShopScreen
              coins={save.wallet.coins}
              inventory={save.inventory}
              justBought={justBought}
              onBuy={handleBuy}
              onClose={() => setShopOpen(false)}
            />
          ) : null}

          {playing === null && welcomeBack && report ? (
            <WelcomeBackCard report={report} petName={save.pet.name} onClose={dismissReport} />
          ) : null}

          {/* 충돌은 **닫을 수 없는 카드**다. 고르는 것 말고 할 일이 없다(§5).
              판이 도는 동안에는 띄우지 않는다 — 그 사이 올리기는 이미 멈춰
              있으므로(usePet 의 conflictRef) 판이 끝난 뒤에 물어도 늦지 않다. */}
          {playing === null && conflict ? (
            <ConflictCard
              when={conflict.when}
              local={{
                level: save.pet.level,
                coins: save.wallet.coins,
                at: save.lastSeenAt,
              }}
              server={conflict.server}
              petName={save.pet.name}
              onChoose={resolveConflict}
            />
          ) : null}

          {/* 충돌이 떠 있는 동안에는 나가기 시트를 내린다. 둘 다 화면을 덮는
              판이라 겹치면 "먼저 골라 주세요"라고 말해 놓고 고를 카드를 자기가
              가린다. 고르고 나면 leaving 이 그대로라 시트가 다시 떠서, 나가려던
              사람은 한 번만 더 누르면 된다. */}
          {playing === null && leaving && conflict === null ? (
            <LogoutSheet
              nickname={session.nickname}
              petName={save.pet.name}
              onConfirm={async () => {
                const result = await logout()
                // 성공하면 세션이 끝나 이 화면이 통째로 사라진다. 실패면 문구를
                // 시트가 직접 보여준다 — 무엇이 남았는지 알아야 한다(§10).
                return result.message
              }}
              onCancel={() => setLeaving(false)}
            />
          ) : null}
        </div>
      </GameShell>

      {/* 튜토리얼은 셸 **밖**에 둔다. 스테이지 안에 두면 HUD 의 게이지를 가리킬
          수 없다 — 2·3단계가 가리키는 것이 바로 그 게이지다.

          판이 떠 있는 동안에는 내린다. 가방·상점·미니게임은 저마다 자기 판을
          띄우는데, 그 판들은 통과 표식(data-pt-tutorial-pass)이 없어 오버레이가
          통째로 막아 버린다. 그러면 "사과를 먹여라"를 띄운 채 사과를 고를 수 없는
          상태가 된다. 판이 떠 있는 동안에는 그 판이 곧 지시다. */}
      {tutorialStep !== null &&
      phase === null &&
      !sheetOpen &&
      !shopOpen &&
      !welcomeBack &&
      conflict === null &&
      !leaving &&
      decor === null ? (
        <TutorialOverlay
          step={tutorialStep}
          canSkip={canSkip(save)}
          onConfirm={confirmTutorial}
          onSkip={skipTutorial}
        />
      ) : null}
    </div>
  )
}
