import { useCallback, useEffect, useState } from 'react'
import type { Profile, RankingEntry } from '@gujuck/api'
import { authApi } from '../api'

interface Props {
  profile: Profile | null
  notice: string
  onCreateRoom: () => void
  onJoinRoom: (code: string) => void
  onLogout: () => void
}

export function LobbyScreen({ profile, notice, onCreateRoom, onJoinRoom, onLogout }: Props) {
  const [code, setCode] = useState('')
  const [ranking, setRanking] = useState<RankingEntry[]>([])

  const loadRanking = useCallback(() => {
    authApi
      .ranking()
      .then(setRanking)
      // 랭킹은 부가 정보다. 못 불러와도 방은 만들 수 있어야 하므로 조용히 넘긴다.
      .catch(() => setRanking([]))
  }, [])

  useEffect(loadRanking, [loadRanking])

  return (
    <div className="ak-lobby">
      <header className="ak-lobby__head">
        <div>
          <div className="ak-lobby__name">{profile?.nickname ?? '게스트'}</div>
          <div className="ak-lobby__rating">레이팅 {profile?.rating ?? '-'}</div>
        </div>
        <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onLogout}>
          로그아웃
        </button>
      </header>

      {notice && <p className="ak-notice">{notice}</p>}

      <section className="ak-card">
        <h2 className="ak-card__title">대전</h2>
        <button className="ak-btn ak-btn--primary" onClick={onCreateRoom}>
          방 만들기
        </button>

        <div className="ak-join">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="방 코드"
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
          />
          <button className="ak-btn" onClick={() => onJoinRoom(code)} disabled={code.length < 4}>
            입장
          </button>
        </div>
      </section>

      <section className="ak-card">
        <h2 className="ak-card__title">랭킹</h2>
        {ranking.length === 0 ? (
          <p className="ak-card__lead">아직 기록이 없습니다.</p>
        ) : (
          <ol className="ak-rank">
            {ranking.map((entry) => (
              <li key={entry.nickname} className="ak-rank__row">
                <span className="ak-rank__no">{entry.rank}</span>
                <span className="ak-rank__name">{entry.nickname}</span>
                <span className="ak-rank__score">{entry.rating}</span>
                <span className="ak-rank__wl">
                  {entry.wins}승 {entry.losses}패
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
