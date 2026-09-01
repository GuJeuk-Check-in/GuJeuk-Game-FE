import { useCallback, useRef } from 'react'
import { GameCanvas, GameShell } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { PetGame } from './game/PetGame'
import './App.css'

export default function App() {
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

  return (
    <GameShell header={<div className="app-title">펫타운</div>}>
      <GameCanvas onMount={handleMount} />
    </GameShell>
  )
}
