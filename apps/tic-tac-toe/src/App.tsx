import { useCallback, useEffect, useState } from 'react'
import { GameShell, ResultOverlay } from '@gujuck/ui'
import { EMPTY_BOARD, bestMove, evaluate, nextMark } from './game/board'
import type { Board, Mark } from './game/board'
import './App.css'

type Mode = 'solo' | 'duo'

const HUMAN: Mark = 'X'
const AI: Mark = 'O'

export default function App() {
  const [mode, setMode] = useState<Mode>('solo')
  const [board, setBoard] = useState<Board>(EMPTY_BOARD)
  const [turn, setTurn] = useState<Mark>('X')

  const outcome = evaluate(board)
  const finished = outcome.winner !== null || outcome.draw

  const reset = useCallback(() => {
    setBoard(EMPTY_BOARD)
    setTurn('X')
  }, [])

  const play = useCallback((index: number, mark: Mark) => {
    setBoard((prev) => {
      if (prev[index] !== null) return prev
      const next = prev.slice()
      next[index] = mark
      return next
    })
    setTurn(nextMark(mark))
  }, [])

  // AI 차례가 되면 한 박자 쉬고 둔다. 즉시 두면 사람이 자기 수를 눈으로
  // 확인하기 전에 판이 바뀌어 무슨 일이 일어났는지 알기 어렵다.
  useEffect(() => {
    if (mode !== 'solo' || finished || turn !== AI) return

    const timer = window.setTimeout(() => {
      const move = bestMove(board, AI)
      if (move >= 0) play(move, AI)
    }, 320)

    return () => window.clearTimeout(timer)
  }, [mode, finished, turn, board, play])

  const handleCell = (index: number) => {
    if (finished || board[index] !== null) return
    if (mode === 'solo' && turn !== HUMAN) return
    play(index, turn)
  }

  const changeMode = (next: Mode) => {
    setMode(next)
    reset()
  }

  return (
    <GameShell
      header={
        <div className="ttt-header">
          <div className="ttt-title">틱택토</div>
          <div className="ttt-modes">
            <button
              type="button"
              className={`gj-btn ttt-mode ${mode === 'solo' ? 'is-on' : ''}`}
              onClick={() => changeMode('solo')}
            >
              AI 대전
            </button>
            <button
              type="button"
              className={`gj-btn ttt-mode ${mode === 'duo' ? 'is-on' : ''}`}
              onClick={() => changeMode('duo')}
            >
              2인
            </button>
          </div>
        </div>
      }
      footer={
        <div className="ttt-status">{statusText(mode, turn, outcome.winner, outcome.draw)}</div>
      }
    >
      <div className="ttt-stage">
        <div className="ttt-board" role="grid" aria-label="틱택토 판">
          {board.map((cell, index) => (
            <button
              key={index}
              type="button"
              role="gridcell"
              className={`ttt-cell ${outcome.line?.includes(index) ? 'is-win' : ''}`}
              onClick={() => handleCell(index)}
              disabled={finished || cell !== null}
              aria-label={`${index + 1}번 칸 ${cell ?? '빈 칸'}`}
            >
              {cell}
            </button>
          ))}
        </div>
      </div>

      <ResultOverlay
        open={finished}
        title={resultTitle(mode, outcome.winner, outcome.draw)}
        description={outcome.draw ? '더 둘 곳이 없어요.' : undefined}
        primaryLabel="다시 하기"
        onPrimary={reset}
      />
    </GameShell>
  )
}

function statusText(mode: Mode, turn: Mark, winner: Mark | null, draw: boolean): string {
  if (winner !== null) return `${winner} 승리`
  if (draw) return '무승부'
  if (mode === 'solo') return turn === HUMAN ? '내 차례 (X)' : 'AI가 생각 중…'
  return `${turn} 차례`
}

function resultTitle(mode: Mode, winner: Mark | null, draw: boolean): string {
  if (draw) return '무승부'
  if (mode === 'solo') return winner === HUMAN ? '이겼어요! 🎉' : '졌어요 😢'
  return `${winner} 승리! 🎉`
}
