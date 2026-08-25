import { useState } from 'react'
import { GameShell } from '@gujuck/ui'
import { AuthScreen } from './screens/AuthScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { LocalBoardScreen } from './screens/LocalBoardScreen'
import { OnlineBoardScreen } from './screens/OnlineBoardScreen'
import { OfflineBar } from './components/OfflineBar'
import { useMatch } from './useMatch'
import './App.css'

/**
 * 화면 라우팅.
 *
 * 온라인 단계(auth/lobby/waiting/playing)는 useMatch가 서버 메시지에 따라
 * 정한다. 혼자 쏘기는 서버와 무관하므로 그 위에 얹는 별도 상태로 둔다 —
 * 로그인하지 않아도 들어갈 수 있어야 하기 때문이다.
 */
export default function App() {
  const match = useMatch()
  const [local, setLocal] = useState(false)

  if (local) {
    return <LocalBoardScreen onExit={() => setLocal(false)} />
  }

  if (match.phase === 'auth') {
    return <AuthScreen onAuthenticated={match.authenticated} onPlayLocal={() => setLocal(true)} />
  }

  if (match.phase === 'lobby') {
    return (
      <LobbyScreen
        profile={match.profile}
        notice={match.notice}
        connected={match.connected}
        onRetry={match.retry}
        onCreateRoom={match.createRoom}
        onJoinRoom={match.joinRoom}
        onPlayLocal={() => setLocal(true)}
        onLogout={match.logout}
      />
    )
  }

  if (match.phase === 'waiting') {
    return (
      <GameShell>
        {!match.connected && <OfflineBar onRetry={match.retry} onExit={match.backToLobby} float />}
        <div className="ar-center">
          <div className="ar-card">
            <h2 className="ar-card__title">방 코드</h2>
            <div className="ar-code">{match.roomCode}</div>
            <p className="ar-card__lead">상대에게 이 코드를 알려주세요.</p>
            {/* 전에는 이 화면이 notice를 그리지 않아 서버 안내와 에러가 전부 사라졌다. */}
            {match.notice && <p className="ar-notice">{match.notice}</p>}
            <button className="gj-btn" onClick={match.backToLobby}>
              취소
            </button>
          </div>
        </div>
      </GameShell>
    )
  }

  return <OnlineBoardScreen match={match} onExit={match.backToLobby} />
}
