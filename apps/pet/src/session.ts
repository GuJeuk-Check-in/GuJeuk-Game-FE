// 지금 이 기기에서 누가 놀고 있는가. (PET_SERVER_API.md §2 · §10)
//
// 다른 게임은 토큰만 있으면 되지만 펫타운은 **회원 id 가 필요하다.** 세이브를
// 브라우저에 캐시하는데 그 키에 누구 것인지를 적어야 하기 때문이다. 기관에서
// 한 기기를 여러 사람이 번갈아 쓰므로, 칸이 하나면 다음 사람이 앞사람의 펫을
// 덮어쓴다.

import { tokenStore } from '@gujuck/api'
import type { AuthResult } from '@gujuck/api'
import { isSessionStale } from './idle'

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
  /**
   * 마지막으로 조작이 있었던 시각.
   *
   * **탭이 닫힌 뒤에도 세션이 살아 있는 것을 막는 값이다.** 유휴 타이머는 탭이
   * 열려 있을 때만 도는데, 공용 기기에서 다 놀았다는 신호는 대개 창을 닫는
   * 것이다. 이 값이 없으면 다음 사람이 같은 주소를 열었을 때 앞사람으로
   * 로그인된 화면을 그대로 받는다.
   */
  lastActiveAt: number
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

    const { memberId, nickname, token, lastActiveAt } = parsed as Record<string, unknown>
    if (typeof memberId !== 'number' || !Number.isFinite(memberId)) return null
    if (typeof nickname !== 'string' || typeof token !== 'string') return null
    // lastActiveAt 이 없는 기록은 이 값을 넣기 전에 만들어진 것이다. 신선한지
    // 알 수 없으므로 없는 것으로 본다 — 한 번 더 로그인하는 값이 남의 세션을
    // 물려받는 것보다 싸다.
    if (typeof lastActiveAt !== 'number' || !Number.isFinite(lastActiveAt)) return null

    return { memberId, nickname, token, lastActiveAt }
  } catch {
    return null
  }
}

/**
 * 지금 로그인한 사람. 없거나, 토큰이 어긋나거나, **오래됐으면** null 이다.
 *
 * 오래됨을 보는 이유가 중요하다. 이 기록은 localStorage 에 있어 **탭을 닫아도
 * 남고**, 유휴 타이머는 탭이 열려 있을 때만 돈다. 검사하지 않으면 앞사람이 창을
 * 닫고 자리를 뜬 뒤 다음 사람이 같은 주소를 열었을 때 앞사람으로 로그인된 화면을
 * 그대로 받는다 — 유휴 로그아웃을 넣은 이유가 통째로 사라진다.
 *
 * 어긋나거나 오래된 기록을 여기서 지우지는 않는다. 읽기 함수가 지우면 언제
 * 지워졌는지 추적할 수 없고, 어차피 다음 로그인이 통째로 덮어쓴다.
 *
 * `now` 를 인자로 받는 것은 판정을 테스트할 수 있게 하려는 것이다(이 앱의
 * 테스트는 node 환경이라 시각을 주입해야 한다). React 의 lazy initializer 는
 * 인자 없이 부르므로 기본값이 그대로 쓰인다.
 */
export function currentSession(now: number = Date.now()): Session | null {
  const stored = read()
  if (!stored) return null
  if (stored.token !== tokenStore.get()) return null
  if (isSessionStale(stored.lastActiveAt, now)) return null

  return { memberId: stored.memberId, nickname: stored.nickname }
}

/** 로그인 성공. 토큰과 신원을 같이 적는다. */
export function beginSession(result: AuthResult): Session {
  tokenStore.set(result.token)

  const stored: Stored = {
    token: result.token,
    memberId: result.memberId,
    nickname: result.nickname,
    lastActiveAt: Date.now(),
  }

  write(stored)

  return { memberId: stored.memberId, nickname: stored.nickname }
}

/**
 * 마지막 조작 시각을 갱신한다. 유휴 타이머가 매 초 부른다.
 *
 * **매번 쓰지 않는다.** localStorage 쓰기는 동기라 렌더를 막고, 이 값이 몇 초
 * 낡아도 판정(5분)에 영향이 없다. 대신 탭이 갑자기 죽어도 마지막 기록이 최대
 * 이 간격만큼만 낡는다.
 */
const TOUCH_INTERVAL_MS = 10_000

let touchedAt = 0

export function touchSession(at: number): void {
  if (at - touchedAt < TOUCH_INTERVAL_MS) return

  const stored = read()
  // 기록이 없거나 남의 것이면 건드리지 않는다. 여기서 되살리면 방금 끝난
  // 세션이 조작 하나로 살아 돌아온다.
  if (!stored || stored.token !== tokenStore.get()) return

  touchedAt = at
  write({ ...stored, lastActiveAt: at })
}

function write(stored: Stored): void {
  try {
    storage()?.setItem(SESSION_KEY, JSON.stringify(stored))
  } catch {
    /* 저장 못 해도 이번 세션은 메모리로 돈다 */
  }
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
  // 다음 세션이 이 값 때문에 첫 갱신을 건너뛰지 않게 되돌린다.
  touchedAt = 0
  storage()?.removeItem(SESSION_KEY)
  tokenStore.clear()
  // 복사해서 도는 것은 듣는 쪽이 자기를 떼는 경우 때문이다. 도는 중에 Set 을
  // 건드리면 남은 하나를 건너뛴다.
  for (const listener of [...listeners]) listener(reason)
}
