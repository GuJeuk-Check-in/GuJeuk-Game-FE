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
import { FOOD_IDS } from './game/pet/foods'
import { shouldShowWelcomeBack } from './game/pet/stats'
import type { ActionOutcome } from './game/pet/actions'
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

interface ToastState {
  /** 같은 문구가 연달아 떠도 타이머가 새로 돌게 하는 값. Toast 의 key 로 쓴다. */
  id: number
  message: string
  detail: string | null
}

export default function App() {
  const { save, report, recovered, persistError, start, act, jump, grant, dismissReport } = usePet()
  const gameRef = useRef<PetGame | null>(null)

  // 현재 방은 **세이브에 넣지 않는다.** 명세 §10 의 스키마에 없는 필드이고,
  // 넣으면 스키마 변경 + 마이그레이션이 된다. 어느 방에 있었는지는 잃으면 안 되는
  // 진행이 아니다 — 새로고침하면 거실에서 시작하는 것으로 충분하다.
  const [cursor, setCursor] = useState(() => roomIndex(DEFAULT_ROOM))
  const room = roomAt(cursor)

  const [sheetOpen, setSheetOpen] = useState(false)
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
    // 놀이터·상점 버튼은 비활성이라 여기까지 오지 않는다(ActionBar).
    if (id === 'play' || id === 'shop') return

    run(id === 'sleep' && save.sleep !== null ? 'wake' : id)
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

  const footer = (
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
      <GameShell header={header} footer={footer}>
        <div className="pt-stage">
          <RoomNav
            room={room}
            prevLabel={roomAt(cursor - 1).label}
            nextLabel={roomAt(cursor + 1).label}
            onPrev={() => setCursor((at) => at - 1)}
            onNext={() => setCursor((at) => at + 1)}
          >
            <GameCanvas onMount={handleMount} />
          </RoomNav>

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

          {sheetOpen ? (
            <InventorySheet
              inventory={save.inventory}
              onPick={handlePick}
              onClose={() => setSheetOpen(false)}
            />
          ) : null}

          {report && shouldShowWelcomeBack(report) ? (
            <WelcomeBackCard report={report} petName={save.pet.name} onClose={dismissReport} />
          ) : null}
        </div>
      </GameShell>
    </div>
  )
}
