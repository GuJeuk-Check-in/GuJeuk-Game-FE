import type { ApiClient } from './client'

/**
 * 전적과 레이팅을 나누는 기준. 서버의 GameType과 이름이 같아야 한다.
 *
 * 게임마다 실력의 의미가 다르므로 레이팅도 게임별로 따로 쌓인다. 알까기를
 * 잘한다고 틱택토를 잘하는 게 아니다.
 */
export type GameName = 'ALKKAGI' | 'TIC_TAC_TOE' | 'ARCHERY'

export interface Profile {
  nickname: string
  rating: number
  wins: number
  losses: number
}

/**
 * 가입·로그인 결과.
 *
 * 신원만 담는다. 레이팅은 게임마다 다르므로 여기에 하나만 실을 수 없다.
 * 각 게임은 접속한 뒤 자기 소켓의 READY 메시지로 자기 게임의 숫자를 받는다.
 */
export interface AuthResult {
  token: string
  nickname: string
}

export interface RankingEntry extends Profile {
  rank: number
}

export interface Credentials {
  nickname: string
  password: string
}

/**
 * 계정·랭킹 엔드포인트.
 *
 * 게임 앱이 경로 문자열을 직접 들고 있으면 서버에서 경로를 바꿀 때 앱마다
 * 찾아다녀야 한다. 경로는 이 파일에만 둔다.
 */
export function createAuthApi(client: ApiClient) {
  return {
    signUp: (credentials: Credentials) => client.post<AuthResult>('/auth/sign-up', credentials),
    login: (credentials: Credentials) => client.post<AuthResult>('/auth/login', credentials),
    /** 게임을 반드시 지정한다. 기본값을 두면 엉뚱한 게임 랭킹을 띄우게 된다. */
    ranking: (game: GameName) => client.get<RankingEntry[]>(`/ranking?game=${game}`),
  }
}

export type AuthApi = ReturnType<typeof createAuthApi>
