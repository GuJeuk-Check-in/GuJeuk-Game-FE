import { GameShell, Icon } from '@gujuck/ui'
import { GAMES } from './games'
import './App.css'

export default function App() {
  return (
    <GameShell
      header={
        <div className="hm-header">
          <div className="hm-logo">구즉 게임</div>
          <div className="hm-tagline">들러서 한 판 하고 포인트를 모아요</div>
        </div>
      }
    >
      <div className="hm-body">
        <ul className="hm-list">
          {GAMES.map((game) => (
            <li key={game.id}>
              <a
                className={`hm-card ${game.ready ? '' : 'is-off'}`}
                style={{ '--card-accent': game.accent } as React.CSSProperties}
                href={game.url}
                aria-disabled={!game.ready}
                onClick={(event) => {
                  if (!game.ready) event.preventDefault()
                }}
              >
                <span className="hm-card__icon">
                  <Icon name={game.icon} size={22} />
                </span>
                <span className="hm-card__text">
                  <span className="hm-card__name">{game.name}</span>
                  <span className="hm-card__desc">
                    {game.ready ? game.description : '준비 중이에요'}
                  </span>
                </span>
                <span className="hm-card__arrow">
                  <Icon name="chevron-right" size={18} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </GameShell>
  )
}
