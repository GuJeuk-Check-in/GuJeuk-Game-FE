import { AuthScreen } from './screens/AuthScreen'
import { BoardScreen } from './screens/BoardScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { useMatch } from './useMatch'
import './App.css'

export default function App() {
  const match = useMatch()

  if (match.phase === 'auth') {
    return <AuthScreen onAuthenticated={match.authenticated} />
  }

  if (match.phase === 'lobby') {
    return (
      <LobbyScreen
        profile={match.profile}
        notice={match.notice}
        onCreateRoom={match.createRoom}
        onJoinRoom={match.joinRoom}
        onLogout={match.logout}
      />
    )
  }

  if (match.phase === 'waiting') {
    return (
      <div className="ak-center">
        <div className="ak-card">
          <h2 className="ak-card__title">방 코드</h2>
          <div className="ak-code">{match.roomCode}</div>
          <p className="ak-card__lead">상대에게 이 코드를 알려주세요.</p>
          <button className="ak-btn ak-btn--ghost" onClick={match.backToLobby}>
            취소
          </button>
        </div>
      </div>
    )
  }

  return <BoardScreen match={match} />
}
