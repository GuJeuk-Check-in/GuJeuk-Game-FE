import { createApiClient, createAuthApi, createPetApi } from '@gujuck/api'
import { expireSession } from './session'

/** 개발 기본값은 서버의 로컬 포트다. 배포 환경에서는 VITE_API_BASE로 덮어쓴다. */
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8090'

/**
 * 401 이면 세션을 통째로 끝낸다.
 *
 * 다른 게임은 토큰만 지우는데, 펫타운은 신원 기록도 같이 버려야 한다 — 남겨
 * 두면 로그인하지 않은 채로 화면이 계속 돌고, 그동안의 진행은 어디에도 올라가지
 * 않는다. 공용 기기라 앞사람의 만료된 토큰이 남아 있는 상황이 흔하다.
 *
 * 로컬 세이브는 지우지 않는다. 그 사람이 다시 로그인하면 이어서 하면 되고,
 * 올리지 못한 진행을 여기서 버리면 그것이야말로 사고다.
 */
const client = createApiClient({
  baseUrl: API_BASE,
  onUnauthorized: expireSession,
})

export const authApi = createAuthApi(client)
export const petApi = createPetApi(client)
