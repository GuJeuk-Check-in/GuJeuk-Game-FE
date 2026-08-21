import { GameShell, ResultOverlay } from '@gujuck/ui'
import { MARKS_PER_PLAYER } from './game/rules'
import { AI, HUMAN, useGame } from './game/useGame'
import type { Mark, Mode } from './game/types'
import './App.css'

/**
 * 화면.
 *
 * ─── 이 파일이 지켜야 하는 것 ────────────────────────────────────────────
 * · 게임 규칙을 몰라야 한다. 판정도 수 선택도 여기서 하지 않는다.
 * · 화면 골격은 @gujuck/ui의 GameShell을 쓴다. 100dvh·safe-area 처리가
 *   거기 들어 있어 노치 기기에서 상하단이 잘리지 않는다.
 * · 결과 표시는 ResultOverlay를 쓴다. 게임마다 모달을 새로 만들지 않는다.
 * · CSS 클래스는 앱 접두사(ttt-)를 붙인다. 공통 UI의 gj- 를 덮어쓰지 않기 위함.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function App() {
  const game = useGame()
  const { state, outcome, finished, mode, vanishing } = game

  return (
    <GameShell
      header={
        <div className="ttt-header">
          <div className="ttt-title">틱택토</div>
          <div className="ttt-modes">
            <ModeButton current={mode} value="solo" label="AI 대전" onSelect={game.changeMode} />
            <ModeButton current={mode} value="duo" label="2인" onSelect={game.changeMode} />
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
      <div className="ttt-stage">
        <div className="ttt-board" role="grid" aria-label="틱택토 판">
          {state.board.map((cell, index) => {
            const isWin = outcome.line?.includes(index) ?? false
            // 지금 차례인 쪽이 한 수 두면 이 칸이 비워진다. 예고 없이 사라지면
            // 규칙을 모르는 사람은 버그로 받아들이므로 미리 흐리게 보여준다.
            const isVanishing = !finished && vanishing === index

            return (
              <button
                key={index}
                type="button"
                role="gridcell"
                className={`ttt-cell ${isWin ? 'is-win' : ''} ${isVanishing ? 'is-vanishing' : ''}`}
                onClick={() => game.place(index)}
                disabled={finished || cell !== null}
                aria-label={cellLabel(index, cell, isVanishing)}
              >
                {cell}
              </button>
            )
          })}
        </div>
      </div>

      <ResultOverlay
        open={finished}
        title={resultTitle(mode, outcome.winner)}
        description="세 칸을 먼저 이었어요."
        primaryLabel="다시 하기"
        onPrimary={game.reset}
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

function cellLabel(index: number, cell: Mark | null, vanishing: boolean): string {
  const where = `${index + 1}번 칸`
  if (cell === null) return `${where} 빈 칸`
  return vanishing ? `${where} ${cell}, 다음 수에 사라짐` : `${where} ${cell}`
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
