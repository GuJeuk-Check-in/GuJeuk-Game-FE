import { useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import { GameCanvas, GameShell } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { PetGame } from './game/PetGame'
import { HOUR_MS, OFFLINE_CAP_MS, WELCOME_BACK_MIN_MS, expForNextLevel } from './game/pet/economy'
import { shouldShowWelcomeBack } from './game/pet/stats'
import { PALETTE_CSS } from './game/palette'
import { NamePrompt } from './components/NamePrompt'
import { StatBar } from './components/StatBar'
import { WelcomeBackCard } from './components/WelcomeBackCard'
import { usePet } from './usePet'
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

export default function App() {
  const { save, report, recovered, persistError, start, jump, dismissReport } = usePet()
  const gameRef = useRef<PetGame | null>(null)

  // GameCanvas는 이 콜백을 마운트 시 한 번만 부른다. 돌려주는 함수에서
  // 게임을 확실히 정리해야 StrictMode 재마운트에서 루프가 두 벌 돌지 않는다.
  const handleMount = useCallback((stage: CanvasStage) => {
    const game = new PetGame(stage)
    gameRef.current = game

    return () => {
      game.destroy()
      gameRef.current = null
    }
  }, [])

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

  // import.meta.env.DEV 는 Vite 가 빌드 시점에 false 로 치환하므로, 프로덕션
  // 번들에서는 이 블록 전체가 통째로 떨어져 나간다.
  const footer = import.meta.env.DEV ? (
    <div className="pt-devbar">
      <span className="pt-devbar__label">시간 점프</span>
      {JUMP_MS.map((ms) => (
        <button key={ms} type="button" className="gj-btn pt-devbar__btn" onClick={() => jump(ms)}>
          +{ms / HOUR_MS}시간
        </button>
      ))}
    </div>
  ) : null

  return (
    <div className="pt-root" style={PALETTE_STYLE}>
      <GameShell header={header} footer={footer}>
        <div className="pt-stage">
          <GameCanvas onMount={handleMount} />
          {/* 저장이 막혀 있으면 알린다. 조용히 두면 진행이 남는다고 믿은 채 계속 논다. */}
          {persistError ? (
            <p className="pt-banner" role="status">
              {persistError}
            </p>
          ) : null}
          {report && shouldShowWelcomeBack(report) ? (
            <WelcomeBackCard report={report} petName={save.pet.name} onClose={dismissReport} />
          ) : null}
        </div>
      </GameShell>
    </div>
  )
}
