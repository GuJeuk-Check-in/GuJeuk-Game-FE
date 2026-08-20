import type { ApiClient } from './client'

export interface Profile {
  nickname: string
  rating: number
  wins: number
  losses: number
}

export interface AuthResult extends Profile {
  token: string
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
    ranking: () => client.get<RankingEntry[]>('/ranking'),
  }
}

export type AuthApi = ReturnType<typeof createAuthApi>
