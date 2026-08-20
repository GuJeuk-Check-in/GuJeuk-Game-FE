import { useCallback, useState } from 'react'
import { GameCanvas, GameShell, ResultOverlay } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import type { Skill } from '@gujuck/api'
import { AlkkagiGame } from '../game/AlkkagiGame'
import type { Match } from '../useMatch'

const SKILL_LABEL: Record<Skill, string> = {
  GROW: '커지기',
  ANCHOR: '고정',
}

const SKILL_HINT: Record<Skill, string> = {
  GROW: '칠 돌을 고르세요. 날아가는 동안 커집니다.',
  ANCHOR: '지킬 돌을 고르세요. 상대는 부딪혀 보기 전까지 모릅니다.',
}

const LABEL: Record<string, string> = {
  KNOCKOUT: '상대 돌을 모두 떨어뜨렸습니다',
  RESIGN: '기권으로 끝났습니다',
  DISCONNECT: '상대가 돌아오지 않았습니다',
}

export function BoardScreen({ match }: { match: Match }) {
  const {
    phase,
    myColor,
    opponent,
    snapshot,
    result,
    notice,
    opponentPlaced,
    setSnapshot,
    attachGame,
  } = match

  const [game, setGame] = useState<AlkkagiGame | null>(null)
  const [placed, setPlaced] = useState(false)

  // GameCanvas는 이 콜백을 마운트 시 한 번만 부른다. 돌려주는 함수에서 게임을
  // 확실히 정리해야 StrictMode 재마운트에서 루프가 두 벌 돌지 않는다.
  const handleMount = useCallback(
    (stage: CanvasStage) => {
      const instance = new AlkkagiGame({
        stage,
        myColor,
        onChange: setSnapshot,
        onFlickRequest: match.flick,
        onSkillRequest: match.useSkill,
        onSettled: match.turnEnd,
      })

      setGame(instance)
      attachGame(instance)

      return () => {
        instance.destroy()
        setGame(null)
        attachGame(null)
      }
    },
    [myColor, setSnapshot, attachGame, match.flick, match.turnEnd, match.useSkill],
  )

  const confirmPlacement = () => {
    if (!game) return
    match.place(game.getPlacement())
    setPlaced(true)
  }

  const myTurn = snapshot.turn === myColor && !snapshot.settling
  const placing = phase === 'placing'

  return (
    <GameShell
      header={
        <div className="ak-header">
          <div className="ak-title">
            알까기
            <span className="ak-vs">
              {opponent ? `vs ${opponent.nickname} (${opponent.rating})` : ''}
            </span>
          </div>
          <div className="ak-counts">
            <span className="ak-chip ak-chip--black">● {snapshot.black}</span>
            <span className="ak-chip ak-chip--white">● {snapshot.white}</span>
          </div>
        </div>
      }
      footer={
        <div className="ak-footer">
          <div className="ak-status">
            {snapshot.armingSkill
              ? SKILL_HINT[snapshot.armingSkill]
              : placing
                ? placed
                  ? opponentPlaced
                    ? '곧 시작합니다…'
                    : '상대가 배치하는 중…'
                  : snapshot.placementValid
                    ? '배치를 마쳤으면 확인을 누르세요.'
                    : '겹치지 않게, 내 진영 안에 놓아주세요.'
                : snapshot.settling
                  ? '돌이 구르는 중…'
                  : myTurn
                    ? '내 차례입니다. 돌을 당겼다 놓으세요.'
                    : '상대 차례입니다.'}
          </div>

          <div className="ak-actions">
            {placing && !placed && (
              <button
                className="ak-btn ak-btn--primary ak-btn--sm"
                onClick={confirmPlacement}
                disabled={!snapshot.placementValid}
              >
                배치 확인
              </button>
            )}
            {phase === 'playing' &&
              (['GROW', 'ANCHOR'] as const).map((skill) => (
                <button
                  key={skill}
                  className={`ak-btn ak-btn--sm${snapshot.armingSkill === skill ? ' ak-btn--primary' : ''}`}
                  onClick={() => game?.armSkill(skill)}
                  disabled={!snapshot.usableSkills.includes(skill)}
                >
                  {SKILL_LABEL[skill]}
                </button>
              ))}
            {phase === 'playing' && (
              <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={match.resign}>
                기권
              </button>
            )}
          </div>
        </div>
      }
    >
      <GameCanvas onMount={handleMount} />

      {notice && <div className="ak-toast">{notice}</div>}

      <ResultOverlay
        open={phase === 'over'}
        title={result ? (result.won ? '승리' : '패배') : '무효'}
        description={
          result ? (
            <>
              <div>{LABEL[result.reason] ?? ''}</div>
              <div className="ak-delta">
                레이팅 {result.rating} ({result.ratingDelta >= 0 ? '+' : ''}
                {result.ratingDelta})
              </div>
            </>
          ) : (
            notice
          )
        }
        primaryLabel="로비로"
        onPrimary={match.backToLobby}
      />
    </GameShell>
  )
}
