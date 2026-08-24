import { useCallback, useRef } from 'react'
import { GameCanvas, GameShell, ResultOverlay } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { ArcheryGame } from './game/ArcheryGame'
import { ARROWS_PER_ROUND, useLocalRound } from './useLocalRound'
import './App.css'

export default function App() {
  const round = useLocalRound()
  const gameRef = useRef<ArcheryGame | null>(null)

  const handleMount = useCallback(
    (stage: CanvasStage) => {
      const game = new ArcheryGame({
        stage,
        onShotLanded: round.onShotLanded,
        onChange: round.onSnapshot,
      })
      gameRef.current = game
      round.attach(game)

      return () => {
        game.destroy()
        gameRef.current = null
      }
    },
    // 마운트 시 한 번만 붙인다. round의 콜백은 참조가 바뀌어도 같은 동작이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <GameShell
      header={
        <div className="ar-header">
          <div className="ar-title">양궁</div>
          <div className="ar-meta">
            <span className="ar-chip">🏹 {ARROWS_PER_ROUND - round.shots.length}</span>
            <span className="ar-chip">⭐ {round.total}</span>
            <span className="ar-chip">{windLabel(round.wind)}</span>
          </div>
        </div>
      }
      footer={
        <div className="ar-footer">
          <div className="ar-shots">
            {Array.from({ length: ARROWS_PER_ROUND }, (_, index) => (
              <span
                key={index}
                className={`ar-shot ${round.shots[index] === undefined ? '' : 'is-done'}`}
              >
                {round.shots[index] ?? '·'}
              </span>
            ))}
          </div>
          <div className="ar-status">{statusText(round.finished, round.snapshot.flying)}</div>
        </div>
      }
    >
      <GameCanvas onMount={handleMount} />

      <ResultOverlay
        open={round.finished}
        title={`${round.total}점`}
        description={`${ARROWS_PER_ROUND}발 만점은 ${ARROWS_PER_ROUND * 10}점이에요.`}
        primaryLabel="다시 쏘기"
        onPrimary={round.reset}
      />
    </GameShell>
  )
}

function statusText(finished: boolean, flying: boolean): string {
  if (finished) return '끝났어요'
  if (flying) return '날아가는 중…'
  return '활을 뒤로 당겼다 놓으세요'
}

function windLabel(wind: number): string {
  if (Math.abs(wind) < 0.05) return '무풍'
  return `${wind > 0 ? '→' : '←'} ${Math.abs(wind).toFixed(1)}`
}
