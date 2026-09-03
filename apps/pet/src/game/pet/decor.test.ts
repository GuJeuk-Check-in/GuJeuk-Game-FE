import { describe, expect, it } from 'vitest'

import type { FurnitureId, PetSave } from '../types'
import { localDateKey } from './clock'
import { FURNITURE, HOUR_MS } from './economy'
import {
  DECOR_AREA,
  FURNITURE_SIZE,
  MAX_PLACED,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  clampToDecorArea,
  moveTo,
  pickUp,
  place,
} from './decor'

// 로컬 시각으로 고정한다. daily.date 가 로컬 기준이라 UTC 로 잡으면 CI 의
// 타임존에 따라 결과가 흔들린다(§10).
const T0 = new Date(2026, 0, 15, 9, 0, 0, 0).getTime()

// 놓을 수 있는 자리의 네 끝. 숫자를 다시 적지 않는다 — 규칙이 바뀌면 테스트도
// 따라 움직여야 하고, 손으로 적은 값은 그때 조용히 어긋난다.
const MIN_X = DECOR_AREA.left
const MIN_Y = DECOR_AREA.top
const MAX_X = DECOR_AREA.right
const MAX_Y = DECOR_AREA.bottom

function makeSave(overrides: Partial<PetSave> = {}): PetSave {
  return {
    version: 1,
    pet: { name: '구즉이', bornAt: T0 - 24 * HOUR_MS, level: 1, exp: 0 },
    stats: { hunger: 50, mood: 50, clean: 50, energy: 50 },
    wallet: { coins: 100 },
    inventory: { plant: 1 },
    room: { wallpaper: 'default', floor: 'default', placed: [] },
    sleep: null,
    tutorial: { step: 2, done: false },
    daily: { date: localDateKey(T0), coinsEarned: 0, expEarned: 0, checkedIn: true, pets: 0 },
    lastSeenAt: T0,
    ...overrides,
  }
}

/** 가구 n 개가 놓여 있고 가방에 화분 하나가 남아 있는 세이브. */
function withPlaced(count: number): PetSave {
  const placed = Array.from({ length: count }, (_, i) => ({
    item: 'cushion' as FurnitureId,
    x: 10 + i,
    y: 20 + i,
  }))
  return makeSave({ room: { wallpaper: 'default', floor: 'default', placed } })
}

/** 입력이 변형되지 않았는지 보는 유일한 방법은 부르기 전 값을 통째로 떠 두는 것이다. */
function snapshot(save: PetSave): string {
  return JSON.stringify(save)
}

describe('DECOR_AREA — 놓을 수 있는 범위', () => {
  it('방 안에 있고 가구가 통째로 들어간다', () => {
    expect(MIN_X).toBeGreaterThanOrEqual(0)
    expect(MIN_Y).toBeGreaterThanOrEqual(0)
    expect(MAX_X + FURNITURE_SIZE).toBeLessThanOrEqual(ROOM_WIDTH)
    expect(MAX_Y + FURNITURE_SIZE).toBeLessThanOrEqual(ROOM_HEIGHT)
  })

  it('UI 가 얹히는 위아래 띠는 빼 둔다', () => {
    // 거기 놓은 가구는 방 이름표와 화살표에 가려 보이지 않고, 보이지 않으면 다시
    // 집을 수도 없다. 규칙이 그 자리를 허용하면 서버 검증도 그대로 승인한다.
    expect(MIN_Y).toBeGreaterThan(0)
    expect(MAX_Y + FURNITURE_SIZE).toBeLessThan(ROOM_HEIGHT)
  })

  it('규칙과 화면 미리보기가 같은 함수로 자른다', () => {
    // place 가 자른 자리와 clampToDecorArea 가 보여준 자리가 다르면 "손끝에 보이던
    // 자리와 놓인 자리가 다르다"가 된다.
    const save = makeSave()
    const preview = clampToDecorArea(0, 9999)

    expect(place(save, 'plant', 0, 9999).next.room.placed[0]).toEqual({
      item: 'plant',
      x: preview.x,
      y: preview.y,
    })
  })
})

describe('MAX_PLACED', () => {
  it('카탈로그 9종을 다 늘어놓지는 못하지만 방이 채워질 만큼은 된다', () => {
    // 값을 바꿀 때 근거(decor.ts 주석)를 다시 읽게 만드는 울타리다.
    expect(MAX_PLACED).toBeGreaterThanOrEqual(4)
    expect(MAX_PLACED).toBeLessThan(Object.keys(FURNITURE).length + 4)
  })
})

describe('place — 놓기', () => {
  it('가방에서 1 줄고 방에 좌표 그대로 들어간다', () => {
    const save = makeSave()
    const { next, changed, message } = place(save, 'plant', 100, 200)

    expect(changed).toBe(true)
    expect(next.inventory.plant).toBe(0)
    expect(next.room.placed).toEqual([{ item: 'plant', x: 100, y: 200 }])
    expect(message).toContain(FURNITURE.plant.label)
  })

  it('가방에 없으면 거절한다', () => {
    const save = makeSave({ inventory: {} })
    const outcome = place(save, 'plant', 100, 200)

    expect(outcome.changed).toBe(false)
    expect(outcome.next).toEqual(save)
    expect(outcome.next.room.placed).toHaveLength(0)
    // 무엇을 해야 하는지 알 수 있는 문구여야 한다.
    expect(outcome.message).toContain('상점')
  })

  it('개수가 0 으로 남아 있는 가구도 없는 것으로 본다', () => {
    // feed 가 다 쓴 음식의 키를 0 으로 남겨 두므로 가구도 같은 모양이 될 수 있다.
    const save = makeSave({ inventory: { plant: 0 } })

    expect(place(save, 'plant', 0, 0).changed).toBe(false)
  })

  it(`${MAX_PLACED}개까지 놓이고 그다음은 거절하며 몇 개까지인지 알려준다`, () => {
    const save = withPlaced(MAX_PLACED - 1)
    const last = place(save, 'plant', 50, 50)

    expect(last.changed).toBe(true)
    expect(last.next.room.placed).toHaveLength(MAX_PLACED)

    // 가방에 하나 더 있어야 상한 때문에 막혔다는 것을 확인할 수 있다.
    const full = place({ ...last.next, inventory: { plant: 1 } }, 'plant', 60, 60)

    expect(full.changed).toBe(false)
    expect(full.next.room.placed).toHaveLength(MAX_PLACED)
    // 가방도 줄지 않아야 한다. 줄면 가구가 통째로 사라진다.
    expect(full.next.inventory.plant).toBe(1)
    expect(full.message).toContain(`${MAX_PLACED}`)
  })

  it('가방 확인이 개수 상한보다 먼저다', () => {
    // 둘 다 막힌 상태다. "8개까지예요"를 보고 하나 치운 뒤에야 "가방에 없어요"가
    // 뜨면 사용자가 헛수고를 하고 나서 진짜 이유를 알게 된다.
    const save = { ...withPlaced(MAX_PLACED), inventory: {} }

    expect(place(save, 'plant', 0, 0).message).toContain('상점')
  })

  it('범위 밖 좌표는 놓을 수 있는 자리로 잘린다', () => {
    const save = makeSave({ inventory: { plant: 2 } })

    expect(place(save, 'plant', -80, -80).next.room.placed[0]).toEqual({
      item: 'plant',
      x: MIN_X,
      y: MIN_Y,
    })
    expect(place(save, 'plant', 9999, 9999).next.room.placed[0]).toEqual({
      item: 'plant',
      x: MAX_X,
      y: MAX_Y,
    })
  })

  it('경계 좌표는 그대로 남는다', () => {
    const save = makeSave()

    expect(place(save, 'plant', MAX_X, MAX_Y).next.room.placed[0]).toEqual({
      item: 'plant',
      x: MAX_X,
      y: MAX_Y,
    })
  })

  it('소수 좌표는 정수로 반올림된다', () => {
    // 소수 좌표는 도트를 흐리게 한다(§11).
    const save = makeSave()

    expect(place(save, 'plant', 100.4, 200.6).next.room.placed[0]).toEqual({
      item: 'plant',
      x: 100,
      y: 201,
    })
  })

  it('NaN·Infinity 좌표는 유한한 값으로 바뀌어 들어간다', () => {
    // NaN 이 세이브에 실려 나가면 다음 로드에서 save.ts 의 검증에 걸리고, 그
    // 처리는 "백업 후 새로 시작"이다. 가구 하나 때문에 진행 전체가 초기화된다.
    // NaN 은 크기 비교가 전부 false 라 범위 검사를 그냥 빠져나간다.
    const save = makeSave({ inventory: { plant: 2 } })

    expect(place(save, 'plant', Number.NaN, 100).next.room.placed[0]).toEqual({
      item: 'plant',
      x: MIN_X,
      y: 100,
    })
    expect(place(save, 'plant', 100, Number.POSITIVE_INFINITY).next.room.placed[0]).toEqual({
      item: 'plant',
      x: 100,
      y: MAX_Y,
    })
  })
})

describe('moveTo — 옮기기', () => {
  it('그 자리의 가구만 좌표가 바뀐다', () => {
    const save = withPlaced(3)
    const { next, changed } = moveTo(save, 1, 200, 300)

    expect(changed).toBe(true)
    expect(next.room.placed[1]).toEqual({ item: 'cushion', x: 200, y: 300 })
    expect(next.room.placed[0]).toEqual(save.room.placed[0])
    expect(next.room.placed[2]).toEqual(save.room.placed[2])
  })

  it('가방과 개수는 건드리지 않는다', () => {
    const save = withPlaced(2)
    const { next } = moveTo(save, 0, 10, 10)

    expect(next.inventory).toEqual(save.inventory)
    expect(next.room.placed).toHaveLength(2)
  })

  it('좌표는 place 와 같은 규칙으로 잘린다', () => {
    const save = withPlaced(1)

    expect(moveTo(save, 0, -5, 9999).next.room.placed[0]).toEqual({
      item: 'cushion',
      x: MIN_X,
      y: MAX_Y,
    })
  })

  it('범위 밖 인덱스는 거절한다', () => {
    const save = withPlaced(2)

    for (const index of [-1, 2, 99, 0.5]) {
      const outcome = moveTo(save, index, 0, 0)
      expect(outcome.changed).toBe(false)
      expect(outcome.next).toEqual(save)
    }
  })
})

describe('pickUp — 치우기', () => {
  it('방에서 빠지고 가방에 1 돌아온다', () => {
    const save = withPlaced(2)
    const { next, changed, message } = pickUp(save, 0)

    expect(changed).toBe(true)
    expect(next.room.placed).toHaveLength(1)
    expect(next.room.placed[0]).toEqual(save.room.placed[1])
    expect(next.inventory.cushion).toBe(1)
    expect(message).toContain(FURNITURE.cushion.label)
  })

  it('범위 밖 인덱스는 거절한다', () => {
    const save = withPlaced(1)

    for (const index of [-1, 1, 1.5]) {
      const outcome = pickUp(save, index)
      expect(outcome.changed).toBe(false)
      expect(outcome.next).toEqual(save)
    }
  })

  it('빈 방에서는 아무것도 치울 수 없다', () => {
    expect(pickUp(makeSave(), 0).changed).toBe(false)
  })
})

describe('place · pickUp 왕복', () => {
  it('놓았다 치우면 가방 개수와 방이 처음으로 돌아온다', () => {
    const save = makeSave({ inventory: { plant: 3 } })

    const placed = place(save, 'plant', 120, 340)
    expect(placed.next.inventory.plant).toBe(2)

    const back = pickUp(placed.next, 0)

    expect(back.next.inventory.plant).toBe(3)
    expect(back.next.room.placed).toEqual([])
    // 지갑·스탯 같은 나머지가 왕복으로 흔들리면 안 된다.
    expect(back.next).toEqual(save)
  })

  it('여러 개를 놓았다 순서를 섞어 치워도 개수가 보존된다', () => {
    let save = makeSave({ inventory: { plant: 2, cushion: 1 } })

    save = place(save, 'plant', 0, 0).next
    save = place(save, 'cushion', 100, 100).next
    save = place(save, 'plant', 200, 200).next
    expect(save.room.placed).toHaveLength(3)

    // 가운데(쿠션)를 먼저 치운다. 인덱스가 밀리는 것을 확인하는 것이 목적이다.
    save = pickUp(save, 1).next
    expect(save.inventory.cushion).toBe(1)
    expect(save.room.placed.map((entry) => entry.item)).toEqual(['plant', 'plant'])

    save = pickUp(save, 0).next
    save = pickUp(save, 0).next

    expect(save.inventory.plant).toBe(2)
    expect(save.room.placed).toEqual([])
  })
})

describe('불변성', () => {
  it('모든 함수가 입력 save 를 변형하지 않는다', () => {
    const save = withPlaced(2)
    const before = snapshot(save)

    place(save, 'plant', 10, 10)
    place(save, 'teddy', 10, 10)
    moveTo(save, 0, 300, 300)
    moveTo(save, 99, 0, 0)
    pickUp(save, 1)
    pickUp(save, 99)

    expect(snapshot(save)).toBe(before)
  })
})
