import type { CSSProperties } from 'react'
import './Home.css'

// 각 게임의 프로덕션 URL. 비밀값이 아니라 공개 주소라 환경변수 대신 직접 적어둔다
// (환경변수 설정 누락으로 링크가 깨지는 사고를 피하기 위함).

interface Game {
  id: string
  emoji: string
  name: string
  desc: string
  color: string
  bg: string
  url: string
}

const GAMES: Game[] = [
  {
    id: 'pet',
    emoji: '🐾',
    name: '펫 게임',
    desc: '나만의 펫을 키우고\n포인트를 모아요',
    color: '#7F77DD',
    bg: '#F1EEFF',
    url: 'https://gujuck-pet-game.vercel.app',
  },
  {
    id: 'run',
    emoji: '🏃',
    name: '달리기 게임',
    desc: '최대 4명이 함께\n달려요',
    color: '#FF7A45',
    bg: '#FFF2EA',
    url: 'https://gujuck-run-game.vercel.app',
  },
  {
    id: 'tap',
    emoji: '🌿',
    name: '탭 가든',
    desc: '색을 맞춰 탭하며\n점수를 쌓아요',
    color: '#2FB182',
    bg: '#EAFBF3',
    url: 'https://gujuck-tap-garden-game.vercel.app',
  },
  {
    id: 'strawberry',
    emoji: '🍓',
    name: '과일 게임',
    desc: '떨어지는 과일을\n받아요',
    color: '#E8345A',
    bg: '#FFF0F3',
    url: 'https://gujuck-strawberry-catch-game.vercel.app',
  },
]

type CardStyle = CSSProperties & { '--accent': string; '--bg': string }

export default function App() {
  return (
    <div className="page">
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
      <div className="inner">
        <header className="hero">
          <div className="mascotRow">
            {GAMES.map((g, i) => (
              <span key={g.id} style={{ animationDelay: `${i * 0.15}s` }}>{g.emoji}</span>
            ))}
          </div>
          <div className="logo">🎮 구즉 게임 센터</div>
          <div className="sub">오늘은 어떤 게임을 해볼까요?</div>
        </header>

        <div className="grid">
          {GAMES.map((g, i) => {
            const style: CardStyle = {
              '--accent': g.color,
              '--bg': g.bg,
              animationDelay: `${0.05 + i * 0.08}s`,
            }
            return (
              <a key={g.id} href={g.url || '#'} className="card" style={style}>
                <div className="iconWrap"><span className="icon">{g.emoji}</span></div>
                <div className="cardName">{g.name}</div>
                <div className="cardDesc">{g.desc}</div>
                <div className="pill">하러 가기 <span className="arrow">→</span></div>
              </a>
            )
          })}
        </div>

        <footer className="footer">
          <span className="footerDot" />구즉 게임 타운<span className="footerDot" />
        </footer>
      </div>
    </div>
  )
}
