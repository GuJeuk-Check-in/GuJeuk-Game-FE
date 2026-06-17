import { useEffect, useRef } from 'react'
import { initGame } from './game/tapGardenGame'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    return initGame(canvasRef.current)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100vh',
        touchAction: 'none',
        cursor: 'pointer',
        fontFamily: "'Jua', 'Apple SD Gothic Neo', sans-serif",
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    />
  )
}
