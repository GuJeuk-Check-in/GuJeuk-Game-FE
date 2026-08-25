import { useCallback } from 'react'
import { GameCanvas, GameShell, Icon, ResultOverlay } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { ArcheryGame } from '../game/ArcheryGame'
import type { Match } from '../useMatch'

/** 종료 사유를 사람 말로. 모르는 값이 와도 화면이 비지 않게 기본값을 둔다. */
const REASON_LABEL: Record<string, string> = {
  SCORE: '총점으로 갈렸습니다',
  RESIGN: '기권했습니다',
  DISCONNECT: '상대의 연결이 끊겼습니다',
}

interface Props {
  match: Match
  onExit: () => void
}

export function OnlineBoardScreen({ match, onExit }: Props) {
  const { board, result, notice, opponent, profile } = match

  const handleMount = useCallback(
    (stage: CanvasStage) => {
      const game = new ArcheryGame({
        stage,
        onShotLanded: match.handleShotLanded,
        // 조준 중 상태는 온라인에서 따로 쓰지 않는다. 차례 표시는 서버 값을 쓴다.
        onChange: () => {},
      })
      match.attachGame(game)

      return () => {
        match.attachGame(null)
        game.destroy()
      }
    },
    // 마운트 시 한 번만 붙인다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <GameShell
      header={
        <div className="ar-header">
          <div className="ar-title">
            양궁
            <span className="ar-vs">
              {profile?.nickname ?? '나'} vs {opponent?.nickname ?? '상대'}
            </span>
          </div>
          <button className="gj-btn ar-btn--sm" onClick={match.resign} disabled={Boolean(result)}>
            <Icon name="flag" size={15} />
            기권
          </button>
        </div>
      }
      footer={
        <div className="ar-footer">
          <div className="ar-scoreline">
            <ShotRow
              label="나"
              shots={board.myShots}
              total={board.myTotal}
              count={board.arrowsPerRound}
              mine
            />
            <ShotRow
              label={opponent?.nickname ?? '상대'}
              shots={board.theirShots}
              total={board.theirTotal}
              count={board.arrowsPerRound}
            />
          </div>
          <div className="ar-status">
            {board.suddenDeath && <span className="ar-sudden">서든데스</span>}
            {result
              ? '대결이 끝났습니다'
              : board.yourTurn
                ? '내 차례 · 당겼다 놓으세요'
                : '상대 차례…'}
            <span className="ar-wind">
              <Icon name="wind" size={14} label="바람" />
              {windLabel(board.wind)}
            </span>
          </div>
        </div>
      }
    >
      {notice && <div className="ar-toast">{notice}</div>}

      <GameCanvas onMount={handleMount} />

      <ResultOverlay
        open={Boolean(result)}
        title={result?.won ? '이겼어요!' : '졌어요'}
        icon={result?.won ? 'trophy' : 'target'}
        tone={result?.won ? 'accent' : 'muted'}
        description={
          result && (
            <>
              <div>{REASON_LABEL[result.reason] ?? '대결이 끝났습니다'}</div>
              <div className="ar-final">
                {result.myTotal} : {result.theirTotal}
              </div>
              <div className="ar-delta">
                {result.ratingDelta >= 0 ? '+' : ''}
                {result.ratingDelta} → {result.rating}
              </div>
            </>
          )
        }
        primaryLabel="로비로"
        onPrimary={onExit}
      />
    </GameShell>
  )
}

interface ShotRowProps {
  label: string
  shots: number[]
  total: number
  count: number
  mine?: boolean
}

function ShotRow({ label, shots, total, count, mine }: ShotRowProps) {
  // 서든데스로 발수가 늘어날 수 있으므로 실제 쏜 수가 더 많으면 그쪽을 따른다.
  const slots = Math.max(count, shots.length)

  return (
    <div className={`ar-scorerow ${mine ? 'is-mine' : ''}`}>
      <span className="ar-scorerow__name">{label}</span>
      <span className="ar-shots">
        {Array.from({ length: slots }, (_, index) => (
          <span key={index} className={`ar-shot ${shots[index] === undefined ? '' : 'is-done'}`}>
            {shots[index] ?? '·'}
          </span>
        ))}
      </span>
      <span className="ar-scorerow__total">{total}</span>
    </div>
  )
}

function windLabel(wind: number): string {
  if (Math.abs(wind) < 0.05) return '무풍'
  return `${wind > 0 ? '→' : '←'} ${Math.abs(wind).toFixed(1)}`
}
