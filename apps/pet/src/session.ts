// 지금 이 기기에서 누가 놀고 있는가. (PET_SERVER_API.md §2 · §10)
//
// 다른 게임은 토큰만 있으면 되지만 펫타운은 **회원 id 가 필요하다.** 세이브를
// 브라우저에 캐시하는데 그 키에 누구 것인지를 적어야 하기 때문이다. 기관에서
// 한 기기를 여러 사람이 번갈아 쓰므로, 칸이 하나면 다음 사람이 앞사람의 펫을
// 덮어쓴다.

import { tokenStore } from '@gujuck/api'
import type { AuthResult } from '@gujuck/api'

const SESSION_KEY = 'gj.pet.session.v1'

export interface Session {
  memberId: number
  nickname: string
}

/**
 * 저장해 두는 모양. **토큰을 같이 적는다.**
 *
 * 토큰 자체는 tokenStore 가 들고 있고 그 키는 게임 넷이 공유한다. 그래서 다른
 * 탭에서 다른 사람이 로그인하면 토큰만 바뀌고 이 기록은 앞사람인 채로 남는다 —
 * 그 상태로 GET /pet 을 부르면 **뒷사람의 펫이 앞사람의 로컬 키에 담긴다.**
 * 여기에 적어 둔 토큰과 지금 토큰을 대조해 그때는 로그인부터 다시 하게 한다.
 *
 * 같은 사람이 다른 게임에서 다시 로그인해도 토큰이 바뀌므로 한 번 더 로그인하게
 * 된다. 공용 기기에서는 그쪽이 안전한 방향이라 그대로 둔다.
 */
interface Stored extends Session {
  token: string
}

/**
 * 세션이 끝난 이유. **화면이 "나갔다"와 "쫓겨났다"를 구분해 알려야 한다.**
 *
 * 쫓겨난 사람은 자기가 뭘 눌러서 그렇게 된 것이 아니므로, 이유를 읽지 못하면
 * 게임이 고장 났다고 생각한다. 'idle'(한동안 조작이 없어 자동으로 나감)과
 * 'expired'(토큰 만료)는 둘 다 그런 경우이고, 사람에게는 서로 다른 사건이다.
 */
export type SessionEndReason = 'logout' | 'idle' | 'expired'

type Listener = (reason: SessionEndReason) => void

const listeners = new Set<Listener>()

/**
 * localStorage 접근은 그 자체가 던질 수 있다(사파리 사생활 보호 모드).
 * 로그인 화면조차 못 뜨면 안 되므로 여기서 삼킨다.
 */
function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function read(): Stored | null {
  const store = storage()
  if (!store) return null

  const raw = store.getItem(SESSION_KEY)
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { memberId, nickname, token } = parsed as Record<string, unknown>
    if (typeof memberId !== 'number' || !Number.isFinite(memberId)) return null
    if (typeof nickname !== 'string' || typeof token !== 'string') return null

    return { memberId, nickname, token }
  } catch {
    return null
  }
}

/**
 * 지금 로그인한 사람. 없거나 토큰이 어긋나면 null 이다.
 *
 * 어긋난 기록은 여기서 지우지 않는다. 읽기 함수가 지우면 언제 지워졌는지
 * 추적할 수 없고, 어차피 다음 로그인이 통째로 덮어쓴다.
 */
export function currentSession(): Session | null {
  const stored = read()
  if (!stored) return null
  if (stored.token !== tokenStore.get()) return null

  return { memberId: stored.memberId, nickname: stored.nickname }
}

/** 로그인 성공. 토큰과 신원을 같이 적는다. */
export function beginSession(result: AuthResult): Session {
  tokenStore.set(result.token)

  const stored: Stored = {
    token: result.token,
    memberId: result.memberId,
    nickname: result.nickname,
  }

  storage()?.setItem(SESSION_KEY, JSON.stringify(stored))

  return { memberId: stored.memberId, nickname: stored.nickname }
}

/**
 * 로그아웃. **세이브를 지우는 것은 이 함수가 하지 않는다.**
 *
 * 순서가 규칙이기 때문이다 — 서버에 올리고, 성공했을 때만 로컬을 지운다
 * (§10). 그 판단은 세이브를 들고 있는 쪽(usePet)이 하고, 여기는 신원만 버린다.
 *
 * 이유를 인자로 받는 것은 화면이 안내 문구를 고를 수 있게 하려는 것이다. 버튼을
 * 눌러 나간 사람에게는 할 말이 없지만, 자동으로 나간 사람에게는 있다.
 */
export function endSession(reason: 'logout' | 'idle' = 'logout'): void {
  clear(reason)
}

/**
 * 토큰이 만료됐다. api 클라이언트가 401 을 보면 부른다.
 *
 * endSession 과 같은 일을 하지만 이름을 나눈 것은, 화면이 "나갔다"와 "쫓겨났다"를
 * 구분해 알려야 하기 때문이다. 쫓겨난 사람은 자기가 뭘 눌러서 그렇게 된 것이
 * 아니므로 이유를 읽어야 한다.
 */
export function expireSession(): void {
  clear('expired')
}

/**
 * 세션이 끝날 때 알림을 받는다. 되돌리는 함수를 준다.
 *
 * 401 은 화면이 부르지 않은 순간에도 온다(자동 저장 중의 올리기 등). 그때
 * 화면이 스스로 알아채지 못하면 로그인이 끊긴 채로 계속 노는 상태가 된다.
 */
export function onSessionEnd(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function clear(reason: SessionEndReason): void {
  storage()?.removeItem(SESSION_KEY)
  tokenStore.clear()
  // 복사해서 도는 것은 듣는 쪽이 자기를 떼는 경우 때문이다. 도는 중에 Set 을
  // 건드리면 남은 하나를 건너뛴다.
  for (const listener of [...listeners]) listener(reason)
}
