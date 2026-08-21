import { GameShell, ResultOverlay } from '@gujuck/ui'
import { Board } from '../components/Board'
import { MARKS_PER_PLAYER } from '../game/rules'
import { AI, HUMAN, useGame } from '../game/useGame'
import type { Mark, Mode } from '../game/types'

interface Props {
  onExit: () => void
}

/**
 * 로컬 대전. 서버 없이 이 기기에서만 돈다.
 *
 * 온라인 화면과 달리 규칙을 직접 굴린다(useGame → rules.ts). 상대가 없어도
 * 규칙을 익힐 수 있어야 해서 남겨둔 화면이다.
 */
export function LocalBoardScreen({ onExit }: Props) {
  const game = useGame()
  const { state, outcome, finished, mode, vanishing } = game

  return (
    <GameShell
      header={
        <div className="ttt-header">
          <div className="ttt-title">연습</div>
          <div className="ttt-modes">
            <ModeButton current={mode} value="solo" label="AI" onSelect={game.changeMode} />
            <ModeButton current={mode} value="duo" label="2인" onSelect={game.changeMode} />
            <button className="gj-btn ttt-btn--sm" onClick={onExit}>
              나가기
            </button>
          </div>
        </div>
      }
      footer={
        <div className="ttt-footer">
          <div className="ttt-status">{statusText(mode, state.turn, outcome.winner)}</div>
          <div className="ttt-rule">
            한 사람당 {MARKS_PER_PLAYER}개까지 · 넘치면 가장 오래된 말이 사라져요
          </div>
        </div>
      }
    >
      <Board
        board={state.board}
        winningLine={outcome.line}
        vanishing={finished ? null : vanishing}
        disabled={finished}
        onPlace={game.place}
      />

      <ResultOverlay
        open={finished}
        title={resultTitle(mode, outcome.winner)}
        description="세 칸을 먼저 이었어요."
        primaryLabel="다시 하기"
        onPrimary={game.reset}
        secondaryLabel="나가기"
        onSecondary={onExit}
      />
    </GameShell>
  )
}

interface ModeButtonProps {
  current: Mode
  value: Mode
  label: string
  onSelect: (mode: Mode) => void
}

function ModeButton({ current, value, label, onSelect }: ModeButtonProps) {
  return (
    <button
      type="button"
      className={`gj-btn ttt-mode ${current === value ? 'is-on' : ''}`}
      onClick={() => onSelect(value)}
    >
      {label}
    </button>
  )
}

function statusText(mode: Mode, turn: Mark, winner: Mark | null): string {
  if (winner !== null) return `${winner} 승리`
  if (mode === 'solo') return turn === HUMAN ? '내 차례 (X)' : 'AI가 생각 중…'
  return `${turn} 차례`
}

function resultTitle(mode: Mode, winner: Mark | null): string {
  if (mode === 'solo') return winner === AI ? '졌어요 😢' : '이겼어요! 🎉'
  return `${winner} 승리! 🎉`
}
