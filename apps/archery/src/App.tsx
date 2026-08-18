import { useCallback, useRef, useState } from 'react'
import { GameCanvas, GameShell, ResultOverlay } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { ArcheryGame } from './game/ArcheryGame'
import type { ArcherySnapshot } from './game/ArcheryGame'
import './App.css'

const INITIAL: ArcherySnapshot = {
  score: 0,
  arrowsLeft: 5,
  wind: 0,
  lastHit: null,
  finished: false,
}

export default function App() {
  const gameRef = useRef<ArcheryGame | null>(null)
  const [snapshot, setSnapshot] = useState<ArcherySnapshot>(INITIAL)

  const handleMount = useCallback((stage: CanvasStage) => {
    const game = new ArcheryGame({ stage, onChange: setSnapshot })
    gameRef.current = game

    return () => {
      game.destroy()
      gameRef.current = null
    }
  }, [])

  const restart = () => {
    gameRef.current?.reset()
  }

  return (
    <GameShell
      header={
        <div className="ar-header">
          <div className="ar-title">양궁</div>
          <div className="ar-meta">
            <span className="ar-chip">🏹 {snapshot.arrowsLeft}</span>
            <span className="ar-chip">⭐ {snapshot.score}</span>
            <span className="ar-chip">{windLabel(snapshot.wind)}</span>
          </div>
        </div>
      }
      footer={
        <div className="ar-footer">
          <div className="ar-status">
            {snapshot.lastHit === null
              ? '활을 뒤로 당겼다 놓으세요'
              : snapshot.lastHit > 0
                ? `명중! +${snapshot.lastHit}점`
                : '빗나갔어요'}
          </div>
          <button type="button" className="gj-btn" onClick={restart}>
            처음부터
          </button>
        </div>
      }
    >
      <GameCanvas onMount={handleMount} />

      <ResultOverlay
        open={snapshot.finished}
        title={`${snapshot.score}점`}
        description={`화살 ${INITIAL.arrowsLeft}발을 모두 쐈어요.`}
        primaryLabel="다시 하기"
        onPrimary={restart}
      />
    </GameShell>
  )
}

function windLabel(wind: number): string {
  if (Math.abs(wind) < 0.05) return '무풍'
  const arrow = wind > 0 ? '→' : '←'
  return `${arrow} ${Math.abs(wind).toFixed(1)}`
}
