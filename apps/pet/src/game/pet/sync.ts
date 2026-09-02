// 로컬 캐시와 서버 세이브를 맞추는 규칙. (PET_SERVER_API.md §5 · §10)
//
// 이 게임은 **기관에서 한 기기를 여러 사람이 번갈아 쓴다.** 그래서 서버가
// 정본이고 로컬 저장은 그 세션 동안의 캐시다. 그런데 로그인할 때마다 서버 것을
// 그냥 덮어 씌우면, 지난 세션이 브라우저 강제 종료로 끝났을 때 올리지 못한
// 진행이 조용히 사라진다.
//
// 그것을 가르는 값이 baseSyncedAt 이다 — **로컬 세이브가 서버의 어느 시점에서
// 갈라져 나왔는지**를 적어 둔 것. 서버의 synced_at 과 같으면 로컬은 그 행의
// 연장선이므로 로컬이 새것이고, 다르면 그 사이에 다른 기기가 올린 것이므로
// 어느 쪽을 쓸지 사람에게 물어야 한다. 자동으로 합치지 않는 것이 규약이다.
//
// 판단만 여기서 하고 네트워크는 부르지 않는다. 이 규칙이 틀리면 진행이
// 사라지는데, fetch 가 섞여 있으면 그 규칙을 테스트할 수 없다.

/** 동기화 기준 시각이 사는 키의 접두사. 세이브와 같은 이유로 회원마다 나눈다. */
const SYNC_KEY_PREFIX = 'gj.pet.sync.v1'

export function syncKey(memberId: number): string {
  return `${SYNC_KEY_PREFIX}.${memberId}`
}

/**
 * 서버가 알려준 현재 상태.
 *
 * 'unreachable' 을 'absent' 와 **반드시 구분한다.** 둘을 합치면 서버가 잠깐
 * 죽었을 때 모든 사용자가 "펫이 없는 신규 사용자"로 보이고, 이름을 새로 지어
 * 처음부터 시작하게 된다.
 */
export type ServerState =
  { kind: 'absent' } | { kind: 'present'; syncedAt: number } | { kind: 'unreachable' }

/**
 * 로그인 직후 무엇을 할지.
 *
 * - `local`  로컬 캐시로 계속한다. 나중에 올린다.
 * - `server` 서버 것을 받아 쓴다.
 * - `ask`    둘 다 있고 갈라졌다. 사람이 고른다.
 * - `fresh`  아무 데도 없다. 새 펫을 만든다.
 * - `retry`  서버를 못 만났고 로컬에도 없다. **아무것도 하지 않는다.**
 */
export type Reconciliation = { kind: 'local' | 'server' | 'ask' | 'fresh' | 'retry' }

export interface ReconcileInput {
  /** 이 회원의 로컬 세이브가 있는가. 손상되어 복구된 경우는 없는 것으로 본다. */
  localPresent: boolean
  /** 로컬 세이브가 갈라져 나온 서버 시각. 모르면 null. */
  base: number | null
  server: ServerState
}

export function reconcile(input: ReconcileInput): Reconciliation {
  const { localPresent, base, server } = input

  if (server.kind === 'unreachable') {
    // 이미 이 사람의 진행이 여기 있으면 서버 없이도 논다. 명세 §10 의 "동기화
    // 실패가 플레이를 막으면 안 된다"가 이 경우다.
    if (localPresent) return { kind: 'local' }

    // 로컬에도 없으면 새 펫을 주고 싶어지지만 **그러면 안 된다.** 서버에 이미
    // 펫이 있는데 못 물어봤을 뿐일 수 있고, 그때 새로 시작하면 이름을 짓고 논
    // 다음에야 충돌로 알게 된다. 다시 시도하게 한다.
    return { kind: 'retry' }
  }

  if (server.kind === 'absent') {
    return localPresent ? { kind: 'local' } : { kind: 'fresh' }
  }

  if (!localPresent) return { kind: 'server' }

  // 로컬이 이 행에서 갈라져 나왔다면 로컬이 더 나중이다. 올리기는 30초마다라
  // 마지막 몇십 초는 언제나 로컬에만 있다 — 새로고침이 그것을 버리면 안 된다.
  if (base !== null && base === server.syncedAt) return { kind: 'local' }

  // 로그아웃은 로컬을 지우므로, 여기 로컬이 남아 있다는 것은 지난 세션이
  // 비정상으로 끝났다는 뜻이다. 그리고 서버 시각이 우리가 아는 것과 다르다 —
  // 그 사이 다른 기기가 올렸다. 어느 쪽이 최신인지 코드가 고르지 않는다.
  return { kind: 'ask' }
}

/**
 * 기준 시각을 읽는다. 없거나 숫자가 아니면 null.
 *
 * 숫자가 아닌 값을 통과시키면 `base === server.syncedAt` 이 영원히 거짓이 되어
 * 새로고침할 때마다 충돌을 묻게 된다.
 */
export function readSyncBase(storage: Storage, key: string): number | null {
  const raw = storage.getItem(key)
  if (raw === null) return null

  // 빈 문자열을 먼저 막는다. Number('') 는 0 이고 0 은 유한한 숫자라, 이 줄이
  // 없으면 빈 값이 "기준 시각 0" 으로 읽혀 새로고침마다 충돌을 묻게 된다.
  if (raw.trim() === '') return null

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 기준 시각을 적는다.
 *
 * 실패를 삼킨다. 이 값이 없으면 다음 로그인에서 한 번 더 물어보게 될 뿐이고,
 * 그것 때문에 진행이 사라지지는 않는다 — 세이브 쓰기와 달리 알릴 일이 아니다.
 */
export function writeSyncBase(storage: Storage, key: string, syncedAt: number): void {
  try {
    storage.setItem(key, String(syncedAt))
  } catch {
    /* noop */
  }
}

export function clearSyncBase(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    /* noop */
  }
}
