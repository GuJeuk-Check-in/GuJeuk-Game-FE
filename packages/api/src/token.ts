/**
 * 액세스 토큰 저장소.
 *
 * 게임마다 키를 다르게 쓰면(예전 레포가 그랬다: gujuk_pet_token) 게임을
 * 옮겨 다닐 때마다 다시 로그인해야 한다. 같은 서비스이므로 키를 하나로 둔다.
 */
const STORAGE_KEY = 'gujuck_token'

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      // 사파리 프라이빗 모드 등에서 localStorage 접근이 막히면 던진다.
      return null
    }
  },

  set(token: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, token)
    } catch {
      /* 저장 못 해도 이번 세션은 메모리 토큰으로 동작하게 둔다 */
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* noop */
    }
  },
}
