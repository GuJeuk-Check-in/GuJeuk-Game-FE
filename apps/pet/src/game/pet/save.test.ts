import { describe, expect, it } from 'vitest'

import type { PetSave } from '../types'
import { localDateKey } from './clock'
import { BACKUP_KEY_PREFIX, SAVE_KEY, createSave, loadSave, writeSave } from './save'

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
    expect(save.tutorial).toEqual({ step: 0, done: false })
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

    writeSave(storage, save)
    const result = loadSave(storage, NOW)

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
        placed: [{ item: 'bed', x: 24, y: 96 }],
      },
      sleep: { since: NOW - 3600_000 },
      tutorial: { step: 6, done: true },
      daily: { date: '2026-03-07', coinsEarned: 180, checkedIn: true, pets: 4 },
    }

    writeSave(storage, save)
    const result = loadSave(storage, NOW)

    expect(result).toEqual({ kind: 'ok', save })
  })
})

describe('빈 저장소', () => {
  it('아무것도 없으면 empty 다 — 백업을 만들지 않는다', () => {
    const storage = fakeStorage()

    expect(loadSave(storage, NOW)).toEqual({ kind: 'empty' })
    expect(storage.length).toBe(0)
  })
})

describe('손상 복구', () => {
  it('깨진 JSON 은 recovered 이고 원본이 백업 키에 남는다', () => {
    const broken = '{"version":1,"pet":{'
    const storage = fakeStorage({ [SAVE_KEY]: broken })

    const result = loadSave(storage, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(storage.getItem(result.backupKey)).toBe(broken)
    expect(result.backupKey.startsWith(BACKUP_KEY_PREFIX)).toBe(true)
    // 조용히 초기화하지 않는다. 이유가 사용자에게 전달되어야 한다.
    expect(result.reason).not.toBe('')
    expect(storage.getItem(SAVE_KEY)).toBeNull()
  })

  it('stats.hunger 가 없으면 recovered 이고 이유에 그 경로가 나온다', () => {
    const raw = corrupt((save) => {
      const stats = save.stats as Record<string, unknown>
      delete stats.hunger
    })
    const storage = fakeStorage({ [SAVE_KEY]: raw })

    const result = loadSave(storage, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(result.reason).toContain('stats.hunger')
    expect(storage.getItem(result.backupKey)).toBe(raw)
  })

  it('숫자 자리에 문자열이 오면 통과시키지 않는다', () => {
    const raw = corrupt((save) => {
      save.lastSeenAt = '어제'
    })
    const storage = fakeStorage({ [SAVE_KEY]: raw })

    const result = loadSave(storage, NOW)

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
    const storage = fakeStorage({ [SAVE_KEY]: raw })

    expect(loadSave(storage, NOW).kind).toBe('recovered')
  })

  it('백업 키에 원본의 lastSeenAt 이 들어간다', () => {
    const raw = corrupt((save) => {
      const pet = save.pet as Record<string, unknown>
      delete pet.level
    })
    const storage = fakeStorage({ [SAVE_KEY]: raw })

    const result = loadSave(storage, NOW)

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
      [SAVE_KEY]: raw,
      [`${BACKUP_KEY_PREFIX}${NOW}`]: older,
    })

    const result = loadSave(storage, NOW)

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
    const storage = fakeStorage({ [SAVE_KEY]: first })

    const a = loadSave(storage, NOW)
    storage.setItem(SAVE_KEY, second)
    const b = loadSave(storage, NOW)

    expect(a.kind).toBe('recovered')
    expect(b.kind).toBe('recovered')
    if (a.kind !== 'recovered' || b.kind !== 'recovered') return
    expect(a.backupKey).not.toBe(b.backupKey)
    expect(storage.getItem(a.backupKey)).toBe(first)
    expect(storage.getItem(b.backupKey)).toBe(second)
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
    const storage = fakeStorage({ [SAVE_KEY]: future })

    const result = loadSave(storage, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    expect(result.reason).toContain('v2')
  })

  it('원본을 덮어쓰지 않고 백업에 온전히 남긴다', () => {
    const storage = fakeStorage({ [SAVE_KEY]: future })

    const result = loadSave(storage, NOW)

    expect(result.kind).toBe('recovered')
    if (result.kind !== 'recovered') return
    // 문자열이 한 글자도 바뀌지 않아야 한다. v2 를 아는 코드가 그대로 읽어야 하기 때문이다.
    expect(storage.getItem(result.backupKey)).toBe(future)
    expect(storage.getItem(SAVE_KEY)).toBeNull()
  })

  it('거부한 뒤 새로 시작해도 백업은 그대로다', () => {
    const storage = fakeStorage({ [SAVE_KEY]: future })

    const result = loadSave(storage, NOW)
    writeSave(storage, createSave('구즉이', NOW))

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

    expect(() => writeSave(failing, createSave('구즉이', NOW))).toThrow('QuotaExceededError')
  })
})
