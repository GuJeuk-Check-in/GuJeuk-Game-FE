/**
 * 백엔드 연동 레이어.
 *
 * 프레임워크·렌더링 엔진과 무관하다. React 게임(틱택토)이든 캔버스
 * 게임(알까기·양궁)이든 같은 클라이언트를 쓴다. 게임별 엔드포인트는
 * 각 앱이 이 클라이언트 위에 얹는다.
 */
export { createApiClient, ApiError } from './client'
export type { ApiClient, ApiClientOptions } from './client'
export { tokenStore } from './token'
