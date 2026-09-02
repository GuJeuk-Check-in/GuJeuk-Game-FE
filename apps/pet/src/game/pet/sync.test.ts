import { describe, expect, it } from 'vitest'

import { clearSyncBase, readSyncBase, reconcile, syncKey, writeSyncBase } from './sync'
import type { ServerState } from './sync'

/**
 * reconcile 이 틀리면 **진행이 사라진다.** 그런데 그 사고는 두 사람이 두 기기를
 * 쓰다가, 혹은 브라우저가 갑자기 죽은 다음에야 드러나서 손으로는 재현하기
 * 어렵다. 표의 여섯 칸을 전부 못 박아 둔다.
 */
describe('reconcile', () => {
  const absent: ServerState = { kind: 'absent' }
  const unreachable: ServerState = { kind: 'unreachable' }
  const present = (syncedAt: number): ServerState => ({ kind: 'present', syncedAt })

  it('아무 데도 없으면 새로 시작한다', () => {
    expect(reconcile({ localPresent: false, base: null, server: absent })).toEqual({
      kind: 'fresh',
    })
  })

  it('서버에만 있으면 서버 것을 받는다', () => {
    expect(reconcile({ localPresent: false, base: null, server: present(100) })).toEqual({
      kind: 'server',
    })
  })

  it('서버에 없고 로컬에만 있으면 로컬로 간다', () => {
    // 서버 행이 지워진 경우다. 여기서 막으면 그 사람은 영영 올릴 수 없다(§5).
    expect(reconcile({ localPresent: true, base: 100, server: absent })).toEqual({ kind: 'local' })
  })

  /**
   * 새로고침이 방금 논 것을 버리면 안 된다.
   *
   * 올리기는 30초마다라 마지막 몇십 초는 언제나 로컬에만 있다. 기준 시각이 서버와
   * 같다는 것은 그 사이 아무도 올리지 않았다는 뜻이고, 그러면 로컬이 더 나중이다.
   */
  it('기준 시각이 서버와 같으면 로컬이 더 나중이다', () => {
    expect(reconcile({ localPresent: true, base: 100, server: present(100) })).toEqual({
      kind: 'local',
    })
  })

  it('기준 시각이 서버와 다르면 묻는다', () => {
    expect(reconcile({ localPresent: true, base: 100, server: present(250) })).toEqual({
      kind: 'ask',
    })
  })

  /**
   * 기준을 모르는데 양쪽에 있으면 그것도 갈라진 것이다.
   *
   * "모르니까 서버를 믿자"로 가면, 기준 시각만 잃어버린 사람의 로컬 진행이
   * 조용히 사라진다. 사라지는 쪽이 있을 때는 언제나 사람에게 묻는다.
   */
  it('기준을 모르는 채로 양쪽에 있으면 묻는다', () => {
    expect(reconcile({ localPresent: true, base: null, server: present(250) })).toEqual({
      kind: 'ask',
    })
  })

  it('서버를 못 만나도 로컬이 있으면 논다', () => {
    // 명세 §10 의 "동기화 실패가 플레이를 막으면 안 된다".
    expect(reconcile({ localPresent: true, base: 100, server: unreachable })).toEqual({
      kind: 'local',
    })
  })

  /**
   * **못 만난 것과 없는 것을 절대 같이 다루지 않는다.**
   *
   * 합치면 서버가 잠깐 죽었을 때 모든 사용자가 신규 사용자로 보이고, 이름을 새로
   * 지어 처음부터 시작하게 된다. 그 뒤에 올리면 충돌이 나겠지만, 그때는 이미
   * 새 펫에 정이 붙은 다음이다.
   */
  it('서버를 못 만났고 로컬도 없으면 아무것도 하지 않는다', () => {
    expect(reconcile({ localPresent: false, base: null, server: unreachable })).toEqual({
      kind: 'retry',
    })

    expect(reconcile({ localPresent: false, base: null, server: absent })).not.toEqual({
      kind: 'retry',
    })
  })
})

describe('기준 시각 저장', () => {
  function fakeStorage(seed: Record<string, string> = {}): Storage {
    const map = new Map<string, string>(Object.entries(seed))
    return {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => Array.from(map.keys())[index] ?? null,
      removeItem: (key: string) => {
        map.delete(key)
      },
      setItem: (key: string, value: string) => {
        map.set(key, value)
      },
    }
  }

  const KEY = syncKey(7)

  it('쓴 값을 그대로 읽는다', () => {
    const storage = fakeStorage()
    writeSyncBase(storage, KEY, 1788262700123)
    expect(readSyncBase(storage, KEY)).toBe(1788262700123)
  })

  it('없으면 null 이다', () => {
    expect(readSyncBase(fakeStorage(), KEY)).toBeNull()
  })

  /**
   * 숫자가 아닌 값을 통과시키면 `base === server.syncedAt` 이 영원히 거짓이 되어
   * 새로고침할 때마다 충돌을 묻게 된다. 사람은 그것을 게임의 고장으로 읽는다.
   */
  it('숫자가 아니면 null 이다', () => {
    expect(readSyncBase(fakeStorage({ [KEY]: '언젠가' }), KEY)).toBeNull()
    expect(readSyncBase(fakeStorage({ [KEY]: '' }), KEY)).toBeNull()
  })

  it('회원마다 다른 칸을 쓴다', () => {
    // 칸이 겹치면 뒷사람의 기준 시각이 앞사람의 것으로 읽혀 조용히 충돌이 난다.
    expect(syncKey(7)).not.toBe(syncKey(8))
  })

  it('지우면 없는 것과 같아진다', () => {
    const storage = fakeStorage()
    writeSyncBase(storage, KEY, 1)
    clearSyncBase(storage, KEY)
    expect(readSyncBase(storage, KEY)).toBeNull()
  })

  /**
   * 저장이 막혀도 던지지 않는다.
   *
   * 이 값이 없으면 다음 로그인에서 한 번 더 물어보게 될 뿐이고, 그것 때문에
   * 진행이 사라지지는 않는다 — 세이브 쓰기와 달리 화면을 깨뜨릴 일이 아니다.
   */
  it('저장이 막혀도 던지지 않는다', () => {
    const failing: Storage = {
      ...fakeStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }

    expect(() => writeSyncBase(failing, KEY, 1)).not.toThrow()
  })
})
