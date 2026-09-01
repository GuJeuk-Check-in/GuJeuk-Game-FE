import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { GameCanvas, GameShell } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { PetGame } from './game/PetGame'
import {
  FOODS,
  HOUR_MS,
  OFFLINE_CAP_MS,
  WELCOME_BACK_MIN_MS,
  expForNextLevel,
} from './game/pet/economy'
import type { MinigameId } from './game/pet/economy'
import { FOOD_IDS } from './game/pet/foods'
import { shouldShowWelcomeBack } from './game/pet/stats'
import type { ActionOutcome } from './game/pet/actions'
import type { Settlement } from './game/pet/minigames'
import { DEFAULT_ROOM, roomAt, roomIndex } from './game/rooms'
import type { ActionId } from './game/rooms'
import type { FoodId, RoomId } from './game/types'
import { PALETTE_CSS } from './game/palette'
import { NamePrompt } from './components/NamePrompt'
import { StatBar } from './components/StatBar'
import { WelcomeBackCard } from './components/WelcomeBackCard'
import { RoomNav } from './components/RoomNav'
import { ActionBar } from './components/ActionBar'
import { InventorySheet } from './components/InventorySheet'
import { PlayMenu } from './components/PlayMenu'
import { MinigameScreen } from './components/MinigameScreen'
import { ResultCard } from './components/ResultCard'
import { Toast } from './components/Toast'
import { usePet } from './usePet'
import type { ActionKind } from './usePet'
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

/** 개발용 지급 버튼이 한 번에 주는 개수. 명세 §9 의 튜토리얼 2단계와 같은 3개다. */
const DEV_GRANT_COUNT = 3

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

export default function App() {
  const {
    save,
    report,
    recovered,
    persistError,
    start,
    act,
    checkPlay,
    finishGame,
    jump,
    grant,
    dismissReport,
  } = usePet()
  const gameRef = useRef<PetGame | null>(null)

  // 현재 방은 **세이브에 넣지 않는다.** 명세 §10 의 스키마에 없는 필드이고,
  // 넣으면 스키마 변경 + 마이그레이션이 된다. 어느 방에 있었는지는 잃으면 안 되는
  // 진행이 아니다 — 새로고침하면 거실에서 시작하는 것으로 충분하다.
  const [cursor, setCursor] = useState(() => roomIndex(DEFAULT_ROOM))
  const room = roomAt(cursor)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [phase, setPhase] = useState<PlayPhase | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastSeq = useRef(0)

  // 캔버스가 만들어지는 시점에 현재 방을 알려주기 위한 최신 값. 상태를 그대로
  // 읽으면 handleMount 가 매 렌더마다 새 함수가 되어야 한다.
  const roomIdRef = useRef<RoomId>(room.id)
  roomIdRef.current = room.id

  // GameCanvas는 이 콜백을 마운트 시 한 번만 부른다. 돌려주는 함수에서
  // 게임을 확실히 정리해야 StrictMode 재마운트에서 루프가 두 벌 돌지 않는다.
  const handleMount = useCallback((stage: CanvasStage) => {
    const game = new PetGame(stage)
    // 첫 방은 여기서 직접 세운다. 아래 effect 는 게임이 생기기 전에 한 번 지나갈
    // 수 있고, 그것만 믿으면 다른 방에서 새로고침했을 때 배경이 어긋난다.
    game.setRoom(roomIdRef.current)
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
  }, [phase])

  const dismissToast = useCallback(() => setToast(null), [])

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
  const showOutcome = (outcome: ActionOutcome) => {
    toastSeq.current += 1
    setToast({
      id: toastSeq.current,
      message: outcome.message,
      // 레벨업은 따로 알린다. 한 줄에 붙이면 "배불러!"에 묻혀 지나간다.
      detail: outcome.leveledUpTo === null ? null : `레벨업! Lv.${outcome.leveledUpTo}`,
    })

    // 실제로 통했을 때만 반응한다. 거절에도 튀면 무엇이 먹혔는지 알 수 없다.
    if (outcome.changed) gameRef.current?.bounce()
  }

  const run = (kind: ActionKind, food?: FoodId) => {
    const outcome = act(kind, food)
    if (outcome) showOutcome(outcome)
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
    // 상점 버튼은 아직 비활성이라 여기까지 오지 않는다(ActionBar).
    if (id === 'shop') return

    run(id === 'sleep' && save.sleep !== null ? 'wake' : id)
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
      </div>
      <div className="pt-hud__stats">
        <StatBar label="밥" tone="hunger" value={save.stats.hunger} />
        <StatBar label="기분" tone="mood" value={save.stats.mood} />
        <StatBar label="청결" tone="clean" value={save.stats.clean} />
        <StatBar label="기운" tone="energy" value={save.stats.energy} />
      </div>
    </div>
  )

  const playing = phase !== null && phase.kind === 'playing' ? phase : null

  /**
   * 게임 중에는 액션 바를 내린다.
   *
   * 한 손으로 하는 게임이라 화면 아래가 곧 조작 영역이다. 그 자리에 먹이주기가
   * 남아 있으면 점프하려다 밥을 준다. 세로 공간이 캔버스로 돌아가는 것도 이득이다
   * — 도트는 중간 배율이 없어 몇 px 이 배율 한 단계를 가른다(§14 의 M2 기록).
   */
  const footer = playing ? null : (
    <div className="pt-footer">
      <ActionBar actions={room.actions} sleeping={save.sleep !== null} onAction={handleAction} />

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
            {/* 상점도 튜토리얼도 아직 없어(M4) 음식을 얻을 길이 없다. 이 버튼이
              없으면 M2 완료 기준("사과를 먹이면 게이지가 오른다")을 확인할 수 없다. */}
            <span className="pt-devbar__label">지급</span>
            {FOOD_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="gj-btn pt-devbar__btn"
                onClick={() => grant(id, DEV_GRANT_COUNT)}
              >
                {FOODS[id].label} {DEV_GRANT_COUNT}개
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
        <div className="pt-stage">
          {/* 게임 중에는 방 캔버스를 통째로 내린다. 겹쳐 두면 보이지도 않는 방
              루프가 계속 돌고, 캔버스 두 장이 같은 화면에서 배율을 다투게 된다.
              내리면 PetGame.destroy 가 불려 루프와 리스너가 확실히 정리된다. */}
          {playing ? (
            <MinigameScreen
              game={playing.game}
              onEnd={(score) => handleEnd(playing.game, score)}
              onExit={() => setPhase(null)}
            />
          ) : (
            <RoomNav
              room={room}
              prevLabel={roomAt(cursor - 1).label}
              nextLabel={roomAt(cursor + 1).label}
              onPrev={() => setCursor((at) => at - 1)}
              onNext={() => setCursor((at) => at + 1)}
            >
              <GameCanvas onMount={handleMount} />
            </RoomNav>
          )}

          {/* 저장이 막혀 있으면 알린다. 조용히 두면 진행이 남는다고 믿은 채 계속 논다. */}
          {persistError ? (
            <p className="pt-banner" role="status">
              {persistError}
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

          {playing === null && report && shouldShowWelcomeBack(report) ? (
            <WelcomeBackCard report={report} petName={save.pet.name} onClose={dismissReport} />
          ) : null}
        </div>
      </GameShell>
    </div>
  )
}
