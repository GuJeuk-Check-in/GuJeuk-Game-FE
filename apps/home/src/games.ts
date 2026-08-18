export interface GameLink {
  id: string
  name: string
  description: string
  emoji: string
  url: string
  /** 아직 배포 전이면 카드가 비활성으로 보인다. */
  ready: boolean
}

/**
 * 게임 목록.
 *
 * 게임마다 Vercel 프로젝트가 따로 있어 도메인도 각각이다. 그래서 허브는
 * 라우팅이 아니라 외부 링크로 넘긴다. URL을 코드에 박으면 프리뷰 환경에서
 * 항상 운영 도메인으로 튕기므로 환경변수로 받고, 없으면 카드를 비활성 처리한다.
 */
const RAW: readonly Omit<GameLink, 'url' | 'ready'>[] = [
  {
    id: 'tic-tac-toe',
    name: '틱택토',
    description: '세 칸을 먼저 잇는 사람이 이겨요',
    emoji: '⭕',
  },
  {
    id: 'alkkagi',
    name: '알까기',
    description: '상대 돌을 판 밖으로 밀어내세요',
    emoji: '⚫',
  },
  {
    id: 'archery',
    name: '양궁',
    description: '바람을 읽고 과녁 정중앙을 노려요',
    emoji: '🏹',
  },
]

const URLS: Record<string, string | undefined> = {
  'tic-tac-toe': import.meta.env.VITE_URL_TIC_TAC_TOE,
  alkkagi: import.meta.env.VITE_URL_ALKKAGI,
  archery: import.meta.env.VITE_URL_ARCHERY,
}

export const GAMES: readonly GameLink[] = RAW.map((game) => {
  const url = URLS[game.id]
  return { ...game, url: url ?? '#', ready: Boolean(url) }
})
