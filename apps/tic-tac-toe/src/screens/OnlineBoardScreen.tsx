import { useEffect } from 'react'
import { GameShell, Icon, MuteButton, ResultOverlay, gameAudio } from '@gujuck/ui'
import { Board } from '../components/Board'
import { MARKS_PER_PLAYER } from '../game/rules'
import type { Match } from '../useMatch'

/** 종료 사유를 사람 말로. 모르는 값이 와도 화면이 비지 않게 기본값을 둔다. */
const REASON_LABEL: Record<string, string> = {
  LINE: '세 칸을 이었습니다',
  RESIGN: '기권했습니다',
  DISCONNECT: '상대의 연결이 끊겼습니다',
}

interface Props {
  match: Match
  onExit: () => void
}

export function OnlineBoardScreen({ match, onExit }: Props) {
  const { board, turn, myMark, vanishing, result, notice, opponent, profile } = match

  const myTurn = !result && turn === myMark
  // 사라질 칸은 지금 둘 사람 기준이다. 상대 차례엔 상대 것이 흐려진다.
  const vanishingCell = turn === 'X' ? vanishing.x : vanishing.o

  useEffect(() => {
    if (!result) return
    gameAudio.play(result.won ? 'ttt-win' : 'ttt-lose')
  }, [result])

  return (
    <GameShell
      header={
        <div className="ttt-header">
          <div className="ttt-title">
            틱택토
            <span className="ttt-vs">
              {profile?.nickname ?? '나'}({myMark}) vs {opponent?.nickname ?? '상대'}
            </span>
          </div>
          <div className="ttt-header__actions">
            <MuteButton className="ttt-btn--sm" />
            <button className="gj-btn ttt-btn--sm" onClick={match.resign} disabled={Boolean(result)}>
              <Icon name="flag" size={15} />
              기권
            </button>
          </div>
        </div>
      }
      footer={
        <div className="ttt-footer">
          <div className="ttt-status">
            {result ? '판이 끝났습니다' : myTurn ? `내 차례 (${myMark})` : '상대 차례…'}
          </div>
          <div className="ttt-rule">
            한 사람당 {MARKS_PER_PLAYER}개까지 · 넘치면 가장 오래된 말이 사라져요
          </div>
        </div>
      }
    >
      {notice && <div className="ttt-toast">{notice}</div>}

      <Board
        board={board}
        winningLine={result?.line ?? null}
        vanishing={vanishingCell >= 0 ? vanishingCell : null}
        // 내 차례가 아니면 아예 못 누르게 한다. 눌러도 서버가 막지만
        // 눌리는 것처럼 보이면 자기 차례로 착각한다.
        disabled={!myTurn}
        onPlace={match.place}
        turn={turn}
        xLabel={myMark === 'X' ? profile?.nickname ?? '나' : opponent?.nickname ?? '상대'}
        oLabel={myMark === 'O' ? profile?.nickname ?? '나' : opponent?.nickname ?? '상대'}
      />

      <ResultOverlay
        open={Boolean(result)}
        title={result?.won ? '이겼어요!' : '졌어요'}
        icon={result?.won ? 'trophy' : 'users'}
        tone={result?.won ? 'accent' : 'muted'}
        description={
          result && (
            <>
              <div>{REASON_LABEL[result.reason] ?? '판이 끝났습니다'}</div>
              <div className="ttt-delta">
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
