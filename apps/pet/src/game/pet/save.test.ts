import { describe, expect, it } from 'vitest'

import type { PetSave } from '../types'
import { localDateKey } from './clock'
import {
  BACKUP_KEY_PREFIX,
  clearSave,
  createSave,
  loadSave,
  readServerSave,
  saveKey,
  writeSave,
} from './save'
import { TUTORIAL_START_STEP } from './tutorial'

/**
 * 가짜 저장소.
 *
 * loadSave 가 Storage 를 인자로 받는 이유가 이것이다. jsdom 없이 순수 함수로
 * 세이브 규칙을 검증할 수 있어야 한다.
 */
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

const NOW = Date.parse('2026-03-07T21:30:00+09:00')

/**
 * 이 테스트가 쓰는 회원의 자리.
 *
 * 키를 문자열로 적지 않고 saveKey 로 만든다 — 접두사를 바꾸면 이 파일도 같이
 * 따라와야 하는데, 손으로 적으면 그때 조용히 다른 칸을 보게 된다.
 */
const KEY = saveKey(7)

/** 저장된 세이브에서 필드 하나를 망가뜨린다. 손상 케이스를 손으로 적으면 오타가 난다. */
function corrupt(mutate: (save: Record<string, unknown>) => void): string {
  const save = JSON.parse(JSON.stringify(createSave('구즉이', NOW))) as Record<string, unknown>
  mutate(save)
  return JSON.stringify(save)
}

describe('createSave', () => {
  it('새 펫은 스탯이 가득 차 있고 진행이 비어 있다', () => {
    const save = createSave('구즉이', NOW)

    expect(save.version).toBe(1)
    expect(save.pet).toEqual({ name: '구즉이', bornAt: NOW, level: 1, exp: 0 })
    expect(save.stats).toEqual({ hunger: 100, mood: 100, clean: 100, energy: 100 })
    expect(save.wallet.coins).toBe(0)
    expect(save.inventory).toEqual({})
    expect(save.sleep).toBeNull()
    // 시작 단계 번호의 출처는 tutorial.ts 하나다. 여기에 0 을 적으면 두 벌이 된다.
    expect(save.tutorial).toEqual({ step: TUTORIAL_START_STEP, done: false })
    expect(save.lastSeenAt).toBe(NOW)
  })

  it('daily 는 로컬 시각 기준 오늘로 초기화된다', () => {
    const save = createSave('구즉이', NOW)

    expect(save.daily).toEqual({
      date: localDateKey(NOW),
      coinsEarned: 0,
      checkedIn: false,
      pets: 0,
    })
  })

  it('localDateKey 은 UTC 가 아니라 로컬 날짜를 쓴다', () => {
    // UTC 로 자르면 한국 시각 오전 9시 이전이 전날이 되어 "자정에 초기화"가 깨진다.
    const morning = new Date(2026, 2, 7, 1, 0, 0).getTime()
    expect(localDateKey(morning)).toBe('2026-03-07')
  })
})

describe('왕복', () => {
  it('write 한 세이브를 load 하면 값이 그대로 돌아온다', () => {
    const storage = fakeStorage()
    const save = createSave('구즉이', NOW)

    writeSave(storage, KEY, save)
    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.save).toEqual(save)
  })

  it('진행이 쌓인 세이브도 값을 잃지 않는다', () => {
    const storage = fakeStorage()
    const save: PetSave = {
      ...createSave('구즉이', NOW),
      pet: { name: '구즉이', bornAt: NOW - 90_000, level: 7, exp: 213.5 },
      stats: { hunger: 41.25, mood: 88, clean: 0, energy: 63.75 },
      wallet: { coins: 320 },
      inventory: { apple: 3, cake: 1 },
      room: {
        wallpaper: 'wall-mint',
        floor: 'floor-wood',
        placed: [{ item: 'plant', x: 24, y: 96 }],
      },
      sleep: { since: NOW - 3600_000 },
      tutorial: { step: 6, done: true },
      daily: { date: '2026-03-07', coinsEarned: 180, checkedIn: true, pets: 4 },
    }

    writeSave(storage, KEY, save)
    const result = loadSave(storage, KEY, NOW)

    expect(result).toEqual({ kind: 'ok', save })
  })
})

describe('빈 저장소', () => {
  it('아무것도 없으면 empty 다 — 백업을 만들지 않는다', () => {
    const storage = fakeStorage()

    expect(loadSave(storage, KEY, NOW)).toEqual({ kind: 'empty' })
    expect(storage.length).toBe(0)
  })
})

describe('손상 복구', () => {
  it('깨진 JSON 은 recovered 이고 원본이 백업 키에 남는다', () => {
    const broken = '{"version":1,"pet":{'
    const storage = fakeStorage({ [KEY]: broken })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(storage.getItem(result.backupKey)).toBe(broken)
    expect(result.backupKey.startsWith(BACKUP_KEY_PREFIX)).toBe(true)
    // 조용히 초기화하지 않는다. 이유가 사용자에게 전달되어야 한다.
    expect(result.reason).not.toBe('')
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('stats.hunger 가 없으면 recovered 이고 이유에 그 경로가 나온다', () => {
    const raw = corrupt((save) => {
      const stats = save.stats as Record<string, unknown>
      delete stats.hunger
    })
    const storage = fakeStorage({ [KEY]: raw })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(result.reason).toContain('stats.hunger')
    expect(storage.getItem(result.backupKey)).toBe(raw)
  })

  it('숫자 자리에 문자열이 오면 통과시키지 않는다', () => {
    const raw = corrupt((save) => {
      save.lastSeenAt = '어제'
    })
    const storage = fakeStorage({ [KEY]: raw })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(result.reason).toContain('lastSeenAt')
  })

  it('NaN 이 섞인 스탯도 손상으로 본다', () => {
    // JSON 에 NaN 리터럴은 없지만, 예전 코드가 null 로 직렬화해 남길 수 있다.
    const raw = corrupt((save) => {
      const stats = save.stats as Record<string, unknown>
      stats.energy = null
    })
    const storage = fakeStorage({ [KEY]: raw })

    expect(loadSave(storage, KEY, NOW).kind).toBe('recovered')
  })

  it('백업 키에 원본의 lastSeenAt 이 들어간다', () => {
    const raw = corrupt((save) => {
      const pet = save.pet as Record<string, unknown>
      delete pet.level
    })
    const storage = fakeStorage({ [KEY]: raw })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(result.backupKey).toBe(`${BACKUP_KEY_PREFIX}${NOW}`)
  })

  it('기존 백업을 덮어쓰지 않고 새 키를 쓴다', () => {
    const older = '이미 있던 백업'
    const raw = corrupt((save) => {
      delete save.daily
    })
    const storage = fakeStorage({
      [KEY]: raw,
      [`${BACKUP_KEY_PREFIX}${NOW}`]: older,
    })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(result.backupKey).not.toBe(`${BACKUP_KEY_PREFIX}${NOW}`)
    expect(storage.getItem(`${BACKUP_KEY_PREFIX}${NOW}`)).toBe(older)
    expect(storage.getItem(result.backupKey)).toBe(raw)
  })

  it('백업이 여러 번 쌓여도 서로를 덮지 않는다', () => {
    const first = corrupt((save) => {
      delete save.stats
    })
    const second = corrupt((save) => {
      delete save.wallet
    })
    const storage = fakeStorage({ [KEY]: first })

    const a = loadSave(storage, KEY, NOW)
    storage.setItem(KEY, second)
    const b = loadSave(storage, KEY, NOW)

    expect(a.kind).toBe('recovered')
    expect(b.kind).toBe('recovered')
    if (a.kind !== 'recovered' || b.kind !== 'recovered') return
    expect(a.backupKey).not.toBe(b.backupKey)
    expect(storage.getItem(a.backupKey)).toBe(first)
    expect(storage.getItem(b.backupKey)).toBe(second)
  })
})

describe('배치된 가구', () => {
  it('모르는 가구 id 는 그 항목만 버리고 나머지 진행은 지킨다', () => {
    // 가구를 추가한 신버전에서 놓은 세이브를 구버전 번들이 여는 상황이다. 여기서
    // 세이브를 통째로 초기화하면 3주 키운 펫이 화분 하나 때문에 사라진다(§1).
    const raw = corrupt((save) => {
      const room = save.room as Record<string, unknown>
      room.placed = [
        { item: 'plant', x: 10, y: 20 },
        { item: 'sofa', x: 30, y: 40 },
      ]
      save.wallet = { coins: 320 }
    })
    const storage = fakeStorage({ [KEY]: raw })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.save.room.placed).toEqual([{ item: 'plant', x: 10, y: 20 }])
    expect(result.save.wallet.coins).toBe(320)
  })

  it('배치 항목의 좌표가 숫자가 아니면 손상으로 본다', () => {
    // 모르는 id 와 달리 이건 버전이 오르며 생길 수 있는 모양이 아니라 깨진 값이다.
    const raw = corrupt((save) => {
      const room = save.room as Record<string, unknown>
      room.placed = [{ item: 'plant', x: '왼쪽', y: 20 }]
    })
    const storage = fakeStorage({ [KEY]: raw })

    expect(loadSave(storage, KEY, NOW).kind).toBe('recovered')
  })
})

describe('튜토리얼 단계', () => {
  it('정수가 아닌 step 은 잘라서 들인다 — 세이브를 버리지 않는다', () => {
    // 소수 step 은 배열 인덱스로 쓰이는 순간 undefined 가 되어 화면을 죽인다
    // (tutorial.ts 의 currentStep). 그렇다고 초기화하기엔 너무 값싼 필드다.
    const raw = corrupt((save) => {
      save.tutorial = { step: 2.5, done: false }
    })
    const storage = fakeStorage({ [KEY]: raw })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.save.tutorial.step).toBe(2)
  })
})

describe('미래 버전', () => {
  const future = JSON.stringify({
    ...createSave('구즉이', NOW),
    version: 2,
    // v2 에서 생겼다고 가정하는 필드. 옛 코드가 이걸 이해할 방법은 없다.
    friends: ['봄이'],
  })

  it('코드보다 높은 버전은 로드를 거부한다', () => {
    const storage = fakeStorage({ [KEY]: future })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(result.reason).toContain('v2')
  })

  it('원본을 덮어쓰지 않고 백업에 온전히 남긴다', () => {
    const storage = fakeStorage({ [KEY]: future })

    const result = loadSave(storage, KEY, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    // 문자열이 한 글자도 바뀌지 않아야 한다. v2 를 아는 코드가 그대로 읽어야 하기 때문이다.
    expect(storage.getItem(result.backupKey)).toBe(future)
    expect(storage.getItem(KEY)).toBeNull()
  })

  it('거부한 뒤 새로 시작해도 백업은 그대로다', () => {
    const storage = fakeStorage({ [KEY]: future })

    const result = loadSave(storage, KEY, NOW)
    writeSave(storage, KEY, createSave('구즉이', NOW))

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(storage.getItem(result.backupKey)).toBe(future)
  })
})

describe('writeSave', () => {
  it('저장 실패를 삼키지 않는다', () => {
    const storage = fakeStorage()
    const failing: Storage = {
      ...storage,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }

    expect(() => writeSave(failing, KEY, createSave('구즉이', NOW))).toThrow('QuotaExceededError')
  })
})

describe('회원마다 다른 칸', () => {
  /**
   * **칸이 하나면 다음 사람이 앞사람의 펫을 덮어쓴다.**
   *
   * 기관에서 한 기기를 여러 사람이 번갈아 쓴다는 것이 이 게임의 전제다
   * (PET_SERVER_API.md §2). 로그아웃이 늦거나 브라우저가 갑자기 죽어도 서로의
   * 진행이 섞이지 않아야 한다.
   */
  it('한 사람의 세이브가 다른 사람에게 보이지 않는다', () => {
    const storage = fakeStorage()
    const mine = saveKey(7)
    const yours = saveKey(8)

    writeSave(storage, mine, createSave('내펫', NOW))

    expect(loadSave(storage, yours, NOW)).toEqual({ kind: 'empty' })
    expect(loadSave(storage, mine, NOW).kind).toBe('ok')
  })

  it('한 사람이 나가도 다른 사람 것은 남는다', () => {
    const storage = fakeStorage()
    writeSave(storage, saveKey(7), createSave('앞사람', NOW))
    writeSave(storage, saveKey(8), createSave('뒷사람', NOW))

    clearSave(storage, saveKey(7))

    expect(loadSave(storage, saveKey(7), NOW)).toEqual({ kind: 'empty' })
    expect(loadSave(storage, saveKey(8), NOW).kind).toBe('ok')
  })

  /**
   * 로그인 이전에 쓰던 익명 키는 **읽지 않는다.** 그 값이 누구 것인지 알 수 없어서,
   * 읽으면 공용 기기에서 아무나 그 펫을 이어받는다.
   */
  it('익명 키에 있던 세이브는 아무에게도 보이지 않는다', () => {
    const storage = fakeStorage({ 'gj.pet.v1': JSON.stringify(createSave('주인없음', NOW)) })

    expect(loadSave(storage, saveKey(7), NOW)).toEqual({ kind: 'empty' })
  })
})

describe('readServerSave', () => {
  /**
   * **서버에서 온 값도 손상된 로컬 세이브와 똑같이 다룬다.**
   *
   * 서버는 세이브를 해석하지 않고 보관만 하므로(§6) 모양을 보증해 주지 않는다.
   * 그대로 화면에 넣으면 남의 기기에서 올라온 이상한 값이 그 자리에서 렌더링을
   * 죽인다.
   */
  it('멀쩡한 세이브는 그대로 읽는다', () => {
    const save = createSave('구즉이', NOW)
    expect(readServerSave(JSON.parse(JSON.stringify(save)))).toEqual(save)
  })

  it('모양이 어긋나면 null 이다', () => {
    expect(readServerSave(null)).toBeNull()
    expect(readServerSave('세이브')).toBeNull()
    expect(readServerSave({})).toBeNull()
    expect(readServerSave(JSON.parse(corrupt((save) => (save.stats = { hunger: 1 }))))).toBeNull()
  })

  /**
   * 미래 버전은 읽지 않는다. 로컬과 같은 규칙이다 — 옛 코드로 해석해서 덮어쓰는
   * 것이 세이브를 날리는 가장 흔한 경로다.
   */
  it('더 최신 버전은 읽지 않는다', () => {
    expect(readServerSave(JSON.parse(corrupt((save) => (save.version = 99))))).toBeNull()
  })
})
