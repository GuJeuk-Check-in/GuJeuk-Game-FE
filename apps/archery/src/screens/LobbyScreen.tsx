import { useCallback, useEffect, useState } from 'react'
import type { RankingEntry } from '@gujuck/api'
import { GameShell, Icon } from '@gujuck/ui'
import { authApi } from '../api'
import type { OnlineProfile } from '../useMatch'

interface Props {
  profile: OnlineProfile | null
  notice: string
  onCreateRoom: () => void
  onJoinRoom: (code: string) => void
  onPlayLocal: () => void
  onLogout: () => void
}

export function LobbyScreen({
  profile,
  notice,
  onCreateRoom,
  onJoinRoom,
  onPlayLocal,
  onLogout,
}: Props) {
  const [code, setCode] = useState('')
  const [ranking, setRanking] = useState<RankingEntry[]>([])

  const loadRanking = useCallback(() => {
    authApi
      .ranking('ARCHERY')
      // 랭킹은 부가 정보다. 못 불러와도 방은 만들 수 있어야 하므로 조용히 넘긴다.
      .then(setRanking)
      .catch(() => setRanking([]))
  }, [])

  useEffect(loadRanking, [loadRanking])

  return (
    <GameShell
      header={
        <div className="ar-lobby__head">
          <div>
            <div className="ar-lobby__name">{profile?.nickname ?? '게스트'}</div>
            <div className="ar-lobby__rating">레이팅 {profile?.rating ?? '-'}</div>
          </div>
          <button className="gj-btn ar-btn--sm" onClick={onLogout}>
            <Icon name="logout" size={15} />
            로그아웃
          </button>
        </div>
      }
    >
      <div className="ar-lobby">
        {notice && <p className="ar-notice">{notice}</p>}

        <button className="gj-btn gj-btn--primary" onClick={onCreateRoom}>
          <Icon name="plus" size={17} />방 만들기
        </button>

        <form
          className="ar-join"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = code.trim()
            if (trimmed) onJoinRoom(trimmed)
          }}
        >
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="방 코드"
            maxLength={6}
            aria-label="방 코드"
          />
          <button className="gj-btn" type="submit" disabled={!code.trim()}>
            참여
          </button>
        </form>

        <button className="gj-btn gj-btn--ghost" onClick={onPlayLocal}>
          <Icon name="target" size={16} />
          혼자 쏘기
        </button>

        <div className="ar-rank__title">
          <Icon name="trophy" size={15} />
          랭킹
        </div>
        {ranking.length === 0 ? (
          <p className="ar-rank__empty">아직 기록이 없어요. 첫 승자가 되어보세요.</p>
        ) : (
          <ol className="ar-rank">
            {ranking.map((entry) => (
              <li key={entry.rank} className="ar-rank__row">
                <span className="ar-rank__no">{entry.rank}</span>
                <span className="ar-rank__name">{entry.nickname}</span>
                <span className="ar-rank__score">{entry.rating}</span>
                <span className="ar-rank__wl">
                  {entry.wins}승 {entry.losses}패
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </GameShell>
  )
}
