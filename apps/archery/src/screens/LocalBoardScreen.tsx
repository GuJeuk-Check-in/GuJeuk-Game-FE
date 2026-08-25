import { useCallback } from 'react'
import { GameCanvas, GameShell, Icon, ResultOverlay } from '@gujuck/ui'
import type { CanvasStage } from '@gujuck/game-core'
import { ArcheryGame } from '../game/ArcheryGame'
import { ARROWS_PER_ROUND, useLocalRound } from '../useLocalRound'

interface Props {
  onExit: () => void
}

/**
 * 혼자 쏘기. 서버 없이 이 기기에서만 돈다.
 *
 * 온라인과 달리 바람도 여기서 뽑는다. 상대가 없어도 감을 익힐 수 있어야 해서
 * 남긴 화면이다.
 */
export function LocalBoardScreen({ onExit }: Props) {
  const round = useLocalRound()

  const handleMount = useCallback(
    (stage: CanvasStage) => {
      const game = new ArcheryGame({
        stage,
        onShotLanded: round.onShotLanded,
        onChange: round.onSnapshot,
      })
      round.attach(game)

      return () => game.destroy()
    },
    // 마운트 시 한 번만 붙인다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <GameShell
      header={
        <div className="ar-header">
          <div className="ar-title">연습</div>
          <div className="ar-meta">
            <span className="ar-chip">
              <Icon name="arrow" size={15} label="남은 화살" />
              {ARROWS_PER_ROUND - round.shots.length}
            </span>
            <span className="ar-chip">
              <Icon name="star" size={15} label="점수" />
              {round.total}
            </span>
            <span className="ar-chip">
              <Icon name="wind" size={15} label="바람" />
              {windLabel(round.wind)}
            </span>
            <button className="gj-btn ar-btn--sm" onClick={onExit}>
              나가기
            </button>
          </div>
        </div>
      }
      footer={
        <div className="ar-footer">
          <span className="ar-shots">
            {Array.from({ length: ARROWS_PER_ROUND }, (_, index) => (
              <span
                key={index}
                className={`ar-shot ${round.shots[index] === undefined ? '' : 'is-done'}`}
              >
                {round.shots[index] ?? '·'}
              </span>
            ))}
          </span>
          <div className="ar-status">{statusText(round.finished, round.snapshot.flying)}</div>
        </div>
      }
    >
      <GameCanvas onMount={handleMount} />

      <ResultOverlay
        // 마지막 화살이 꽂히는 것을 보고 나서 띄운다.
        open={round.finished && !round.snapshot.busy}
        title={`${round.total}점`}
        icon="target"
        description={`${ARROWS_PER_ROUND}발 만점은 ${ARROWS_PER_ROUND * 10}점이에요.`}
        primaryLabel="다시 쏘기"
        onPrimary={round.reset}
        secondaryLabel="나가기"
        onSecondary={onExit}
      />
    </GameShell>
  )
}

function statusText(finished: boolean, flying: boolean): string {
  if (finished) return '끝났어요'
  if (flying) return '날아가는 중…'
  return '아무 데나 눌러 뒤로 당겼다 놓으세요'
}

function windLabel(wind: number): string {
  if (Math.abs(wind) < 0.05) return '무풍'
  return `${wind > 0 ? '→' : '←'} ${Math.abs(wind).toFixed(1)}`
}
