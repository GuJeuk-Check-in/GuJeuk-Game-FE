import { useCallback, useRef, useState } from 'react'
import { GameCanvas, GameShell, ResultOverlay } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { AlkkagiGame } from './game/AlkkagiGame'
import type { AlkkagiSnapshot } from './game/AlkkagiGame'
import './App.css'

const INITIAL: AlkkagiSnapshot = {
  turn: 'black',
  black: 4,
  white: 4,
  winner: null,
  settling: false,
}

export default function App() {
  const gameRef = useRef<AlkkagiGame | null>(null)
  const [snapshot, setSnapshot] = useState<AlkkagiSnapshot>(INITIAL)

  // GameCanvas는 이 콜백을 마운트 시 한 번만 부른다. 돌려주는 함수에서
  // 게임을 확실히 정리해야 StrictMode 재마운트에서 루프가 두 벌 돌지 않는다.
  const handleMount = useCallback((stage: CanvasStage) => {
    const game = new AlkkagiGame({ stage, onChange: setSnapshot })
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
        <div className="ak-header">
          <div className="ak-title">알까기</div>
          <div className="ak-counts">
            <span className="ak-chip ak-chip--black">● {snapshot.black}</span>
            <span className="ak-chip ak-chip--white">● {snapshot.white}</span>
          </div>
        </div>
      }
      footer={
        <div className="ak-footer">
          <div className="ak-status">
            {snapshot.winner
              ? `${label(snapshot.winner)} 승리`
              : snapshot.settling
                ? '돌이 멈추는 중…'
                : `${label(snapshot.turn)} 차례 · 돌을 당겼다 놓으세요`}
          </div>
          <button type="button" className="gj-btn" onClick={restart}>
            다시 배치
          </button>
        </div>
      }
    >
      <GameCanvas onMount={handleMount} />

      <ResultOverlay
        open={snapshot.winner !== null}
        title={`${label(snapshot.winner ?? 'black')} 승리! 🎉`}
        description="상대 돌을 모두 판 밖으로 밀어냈어요."
        primaryLabel="다시 하기"
        onPrimary={restart}
      />
    </GameShell>
  )
}

function label(player: 'black' | 'white'): string {
  return player === 'black' ? '흑' : '백'
}
