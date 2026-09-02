import { describe, expect, it } from 'vitest'

import type { ItemId, PetSave } from '../types'
import { localDateKey } from './clock'
import { FOODS, FURNITURE, HOUR_MS } from './economy'
import { buy, labelOf, priceOf } from './shop'

// 로컬 시각으로 고정한다. daily.date 가 로컬 기준이라 UTC 로 잡으면 CI 의
// 타임존에 따라 결과가 흔들린다(§10).
const T0 = new Date(2026, 0, 15, 9, 0, 0, 0).getTime()

function makeSave(overrides: Partial<PetSave> = {}): PetSave {
  return {
    version: 1,
    pet: { name: '구즉이', bornAt: T0 - 24 * HOUR_MS, level: 1, exp: 0 },
    stats: { hunger: 50, mood: 50, clean: 50, energy: 50 },
    wallet: { coins: 100 },
    inventory: {},
    room: { wallpaper: 'default', floor: 'default', placed: [] },
    sleep: null,
    tutorial: { step: 2, done: false },
    daily: { date: localDateKey(T0), coinsEarned: 0, checkedIn: true, pets: 0 },
    lastSeenAt: T0,
    ...overrides,
  }
}

/** 입력이 변형되지 않았는지 보는 유일한 방법은 부르기 전 값을 통째로 떠 두는 것이다. */
function snapshot(save: PetSave): string {
  return JSON.stringify(save)
}

describe('priceOf — 값 읽기', () => {
  it('음식은 FOODS, 가구는 FURNITURE 에서 읽는다', () => {
    expect(priceOf('apple')).toBe(FOODS.apple.price)
    expect(priceOf('cake')).toBe(FOODS.cake.price)
    expect(priceOf('cushion')).toBe(FURNITURE.cushion.price)
    expect(priceOf('fishbowl')).toBe(FURNITURE.fishbowl.price)
  })

  it('카탈로그의 모든 물건에 값이 있다', () => {
    // 카탈로그 키는 전부 ItemId 다. 새 물건을 추가하고 값을 빠뜨리면 여기서 던진다.
    for (const id of [...Object.keys(FOODS), ...Object.keys(FURNITURE)] as ItemId[]) {
      expect(priceOf(id)).toBeGreaterThan(0)
    }
  })

  it('어느 표에도 없는 id 는 0 이 아니라 예외다', () => {
    // 0 으로 돌려주면 카탈로그에서 빠진 물건이 공짜가 되고, 그 사실은 누군가
    // 무한히 사 간 뒤에야 드러난다. 타입으로는 못 만드는 값이라 캐스팅해서 넣는다.
    const missing = 'sofa' as unknown as ItemId

    expect(() => priceOf(missing)).toThrow()
  })
})

describe('labelOf — 이름 읽기', () => {
  // 음식·가구 갈래 판정은 내보내지 않는다. 그 판정이 맞는지는 이름과 값이 어느
  // 표에서 나왔는지로 확인한다 — 화면이 쓰는 경로가 그 둘이기 때문이다.
  it('이름은 카탈로그의 label 을 그대로 쓴다', () => {
    expect(labelOf('apple')).toBe(FOODS.apple.label)
    expect(labelOf('lamp')).toBe(FURNITURE.lamp.label)
  })

  it('어느 표에도 없는 id 는 조용히 넘기지 않고 던진다', () => {
    const missing = 'sofa' as unknown as ItemId

    expect(() => labelOf(missing)).toThrow()
  })
})

describe('buy — 구매', () => {
  it('코인이 가격만큼 줄고 가방에 한 개 들어온다', () => {
    const save = makeSave({ wallet: { coins: 100 } })
    const { next, changed, message } = buy(save, 'apple')

    expect(changed).toBe(true)
    expect(next.wallet.coins).toBe(100 - FOODS.apple.price)
    expect(next.inventory.apple).toBe(1)
    expect(message).toContain(FOODS.apple.label)
  })

  it('이미 가진 물건에는 개수가 더해진다', () => {
    const save = makeSave({ inventory: { apple: 2 } })

    expect(buy(save, 'apple').next.inventory.apple).toBe(3)
  })

  it('가구는 값이 FURNITURE 에서 나오고 가방에 쌓인다', () => {
    const save = makeSave({ wallet: { coins: 200 } })
    const first = buy(save, 'plant')
    const second = buy(first.next, 'plant')

    // 같은 가구를 여러 개 살 수 있어야 한다. 방에 화분 두 개를 놓을 수 있다.
    expect(second.changed).toBe(true)
    expect(second.next.inventory.plant).toBe(2)
    expect(second.next.wallet.coins).toBe(200 - FURNITURE.plant.price * 2)
  })

  it('가격과 코인이 정확히 같으면 살 수 있고 잔액이 0 이 된다', () => {
    // 경계값이다. `<=` 로 잘못 쓰면 딱 맞는 금액에서 거절한다.
    const save = makeSave({ wallet: { coins: FURNITURE.fishbowl.price } })
    const { next, changed } = buy(save, 'fishbowl')

    expect(changed).toBe(true)
    expect(next.wallet.coins).toBe(0)
    expect(next.inventory.fishbowl).toBe(1)
  })

  it('코인이 1 모자라면 거절하고 얼마가 모자란지 알려준다', () => {
    const save = makeSave({ wallet: { coins: FURNITURE.fishbowl.price - 1 } })
    const outcome = buy(save, 'fishbowl')

    expect(outcome.changed).toBe(false)
    expect(outcome.next).toEqual(save)
    // 얼마를 더 벌어야 하는지 모르면 상점 앞에서 멈춘다(§14 "거절도 반응인가").
    expect(outcome.message).toContain('1 모자라요')
  })

  it('코인이 0 이면 제일 싼 물건도 못 산다', () => {
    const save = makeSave({ wallet: { coins: 0 } })
    const outcome = buy(save, 'apple')

    expect(outcome.changed).toBe(false)
    expect(outcome.next.inventory.apple).toBeUndefined()
    expect(outcome.message).toContain(`${FOODS.apple.price}`)
  })

  it('구매로는 EXP 도 레벨도 오르지 않는다', () => {
    // §7 의 코인 획득처에 상점이 없듯, EXP 획득처에도 구매는 없다. 사고 파는
    // 것만으로 레벨이 오르면 미니게임을 돌 이유가 사라진다.
    const save = makeSave({ pet: { name: '구즉이', bornAt: T0, level: 1, exp: 99 } })
    const { next } = buy(save, 'apple')

    expect(next.pet.exp).toBe(99)
    expect(next.pet.level).toBe(1)
  })
})

describe('불변성', () => {
  it('buy 는 입력 save 를 변형하지 않는다', () => {
    const save = makeSave({ wallet: { coins: 500 }, inventory: { apple: 1 } })
    const before = snapshot(save)

    buy(save, 'apple')
    buy(save, 'cake')
    buy(save, 'plant')
    buy(save, 'fishbowl')

    expect(snapshot(save)).toBe(before)
  })
})
