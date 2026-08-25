import { createApiClient, createAuthApi, tokenStore } from '@gujuck/api'

/** 개발 기본값은 서버의 로컬 포트다. 배포 환경에서는 VITE_API_BASE로 덮어쓴다. */
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8090'

export const authApi = createAuthApi(
  createApiClient({
    baseUrl: API_BASE,
    onUnauthorized: () => tokenStore.clear(),
  }),
)
