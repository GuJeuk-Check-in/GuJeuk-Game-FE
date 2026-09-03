import { describe, expect, it } from 'vitest'

import type { PetSave } from '../types'
import { localDateKey } from './clock'
import {
  expForNextLevel,
  FOODS,
  HOUR_MS,
  levelUpReward,
  OVERCLEAN_EXP_THRESHOLD,
  OVEREAT_EXP_THRESHOLD,
  PET_DAILY_LIMIT,
  PET_EXP,
  PET_MOOD_GAIN,
  WAKE_EXP,
  WASH_EXP,
} from './economy'
import { feed, grantItem, pat, startSleep, wakeUp, wash } from './actions'

// 로컬 시각으로 고정한다. daily.date 가 로컬 기준이라 UTC 로 잡으면 CI 의
// 타임존에 따라 결과가 흔들린다(§10).
const T0 = new Date(2026, 0, 15, 9, 0, 0, 0).getTime()

function makeSave(overrides: Partial<PetSave> = {}): PetSave {
  return {
    version: 1,
    pet: { name: '구즉이', bornAt: T0 - 24 * HOUR_MS, level: 1, exp: 0 },
    stats: { hunger: 50, mood: 50, clean: 50, energy: 50 },
    wallet: { coins: 100 },
    inventory: { apple: 3 },
    room: { wallpaper: 'default', floor: 'default', placed: [] },
    sleep: null,
    tutorial: { step: 0, done: false },
    daily: { date: localDateKey(T0), coinsEarned: 0, expEarned: 0, checkedIn: true, pets: 0 },
    lastSeenAt: T0,
    ...overrides,
  }
}

/** 입력이 변형되지 않았는지 보는 유일한 방법은 부르기 전 값을 통째로 떠 두는 것이다. */
function snapshot(save: PetSave): string {
  return JSON.stringify(save)
}

describe('feed — 먹이기', () => {
  it('사과를 먹이면 포만감이 정확히 FOODS.apple.hunger 만큼 오르고 인벤토리가 1 줄어든다', () => {
    const save = makeSave()
    const { next, changed, expGained, leveledUpTo } = feed(save, 'apple', T0)

    expect(changed).toBe(true)
    expect(next.stats.hunger).toBe(50 + FOODS.apple.hunger)
    expect(next.inventory.apple).toBe(2)
    expect(expGained).toBe(FOODS.apple.exp)
    expect(next.pet.exp).toBe(FOODS.apple.exp)
    expect(leveledUpTo).toBeNull()
  })

  it('케이크는 포만감과 기분을 함께 올린다', () => {
    // 포만감 70 짜리라 50 에서 시작하면 상한에 잘려 증가폭을 못 본다.
    const save = makeSave({
      inventory: { cake: 1 },
      stats: { hunger: 10, mood: 10, clean: 50, energy: 50 },
    })
    const { next } = feed(save, 'cake', T0)

    expect(next.stats.hunger).toBe(10 + FOODS.cake.hunger)
    expect(next.stats.mood).toBe(10 + FOODS.cake.mood)
  })

  it('스탯은 100 을 넘지 않는다', () => {
    const save = makeSave({ stats: { hunger: 96, mood: 100, clean: 50, energy: 50 } })
    const { next } = feed(save, 'apple', T0)

    expect(next.stats.hunger).toBe(100)
  })

  it('포만감 95 에서 먹이면 스탯은 오르고 EXP 는 0 이다', () => {
    // 과식 판정은 먹이기 전 값으로 한다. 95 는 OVEREAT_EXP_THRESHOLD(90) 위다.
    expect(95).toBeGreaterThanOrEqual(OVEREAT_EXP_THRESHOLD)

    const save = makeSave({ stats: { hunger: 95, mood: 50, clean: 50, energy: 50 } })
    const { next, changed, expGained } = feed(save, 'apple', T0)

    expect(changed).toBe(true)
    expect(next.stats.hunger).toBe(100)
    expect(next.inventory.apple).toBe(2)
    expect(expGained).toBe(0)
    expect(next.pet.exp).toBe(0)
  })

  it('포만감이 딱 임계값이어도 과식이다', () => {
    const save = makeSave({
      stats: { hunger: OVEREAT_EXP_THRESHOLD, mood: 50, clean: 50, energy: 50 },
    })

    expect(feed(save, 'apple', T0).expGained).toBe(0)
  })

  it('없는 음식을 먹이려 하면 거절하고 세이브가 그대로다', () => {
    const save = makeSave({ inventory: {} })
    const outcome = feed(save, 'apple', T0)

    expect(outcome.changed).toBe(false)
    expect(outcome.next).toEqual(save)
    expect(outcome.expGained).toBe(0)
    expect(outcome.leveledUpTo).toBeNull()
    // 무엇을 해야 하는지 알 수 있는 문구여야 한다.
    expect(outcome.message).toContain('사과가 없어요')
  })

  it('개수가 0 으로 남아 있는 음식도 없는 것으로 본다', () => {
    const save = makeSave({ inventory: { apple: 0 } })

    expect(feed(save, 'apple', T0).changed).toBe(false)
  })
})

describe('wash — 씻기기', () => {
  it('청결 50 에서 씻기면 청결 100 이 되고 EXP 가 들어온다', () => {
    const { next, changed, expGained } = wash(makeSave(), T0)

    expect(changed).toBe(true)
    expect(next.stats.clean).toBe(100)
    expect(expGained).toBe(WASH_EXP)
  })

  it('청결 80 에서 씻기면 청결 100, EXP 는 0 이다', () => {
    expect(80).toBeGreaterThanOrEqual(OVERCLEAN_EXP_THRESHOLD)

    const save = makeSave({ stats: { hunger: 50, mood: 50, clean: 80, energy: 50 } })
    const { next, changed, expGained } = wash(save, T0)

    expect(changed).toBe(true)
    expect(next.stats.clean).toBe(100)
    expect(expGained).toBe(0)
    expect(next.pet.exp).toBe(0)
  })
})

describe('pat — 쓰다듬기', () => {
  it('기분이 오르고 EXP 가 들어오며 횟수가 쌓인다', () => {
    const { next, expGained } = pat(makeSave(), T0)

    expect(next.stats.mood).toBe(50 + PET_MOOD_GAIN)
    expect(next.daily.pets).toBe(1)
    expect(expGained).toBe(PET_EXP)
  })

  it(`${PET_DAILY_LIMIT}회까지만 되고 그다음은 거절한다`, () => {
    let save = makeSave()
    for (let i = 0; i < PET_DAILY_LIMIT; i += 1) {
      const outcome = pat(save, T0)
      expect(outcome.changed).toBe(true)
      save = outcome.next
    }

    expect(save.daily.pets).toBe(PET_DAILY_LIMIT)

    const over = pat(save, T0)
    expect(over.changed).toBe(false)
    expect(over.next).toEqual(save)
    expect(over.expGained).toBe(0)
    expect(over.message).toContain('오늘은')
  })
})

describe('startSleep · wakeUp — 재우기와 깨우기', () => {
  it('재우면 잠든 시각이 기록된다', () => {
    const { next, changed, expGained } = startSleep(makeSave(), T0)

    expect(changed).toBe(true)
    expect(next.sleep).toEqual({ since: T0 })
    // EXP 는 기상 시에 한 번만 준다(§4).
    expect(expGained).toBe(0)
  })

  it('이미 자고 있으면 startSleep 을 거절한다', () => {
    const save = makeSave({ sleep: { since: T0 - HOUR_MS } })
    const outcome = startSleep(save, T0)

    expect(outcome.changed).toBe(false)
    expect(outcome.next).toEqual(save)
    // 잠든 시각을 덮어쓰면 수면 회복 상한이 매번 새로 시작된다.
    expect(outcome.next.sleep).toEqual({ since: T0 - HOUR_MS })
  })

  it('깨우면 sleep 이 null 이 되고 EXP 가 들어온다', () => {
    const save = makeSave({ sleep: { since: T0 - 3 * HOUR_MS } })
    const { next, changed, expGained } = wakeUp(save, T0)

    expect(changed).toBe(true)
    expect(next.sleep).toBeNull()
    expect(expGained).toBe(WAKE_EXP)
    expect(next.pet.exp).toBe(WAKE_EXP)
  })

  it('자고 있지 않으면 wakeUp 을 거절한다', () => {
    const save = makeSave()
    const outcome = wakeUp(save, T0)

    expect(outcome.changed).toBe(false)
    expect(outcome.next).toEqual(save)
    expect(outcome.expGained).toBe(0)
  })
})

describe('레벨업', () => {
  it('필요 EXP 를 채우면 레벨이 오르고 보상 코인이 들어온다', () => {
    const save = makeSave({
      pet: { name: '구즉이', bornAt: T0, level: 1, exp: expForNextLevel(1) - FOODS.apple.exp },
    })
    const { next, leveledUpTo } = feed(save, 'apple', T0)

    expect(leveledUpTo).toBe(2)
    expect(next.pet.level).toBe(2)
    expect(next.pet.exp).toBe(0)
    expect(next.wallet.coins).toBe(100 + levelUpReward(2))
  })

  it('EXP 를 크게 주면 두 레벨이 한 번에 오르고 코인이 두 번 다 들어온다', () => {
    // Lv1→2 에 100, Lv2→3 에 160 이 필요하다. 250 에서 케이크(12) 를 먹이면
    // 262 라 두 단계를 한 번에 넘는다.
    const need = expForNextLevel(1) + expForNextLevel(2)
    const save = makeSave({
      pet: { name: '구즉이', bornAt: T0, level: 1, exp: 250 },
      inventory: { cake: 1 },
      stats: { hunger: 10, mood: 50, clean: 50, energy: 50 },
    })

    const { next, leveledUpTo, expGained } = feed(save, 'cake', T0)

    expect(expGained).toBe(FOODS.cake.exp)
    expect(leveledUpTo).toBe(3)
    expect(next.pet.level).toBe(3)
    expect(next.pet.exp).toBe(250 + FOODS.cake.exp - need)
    expect(next.wallet.coins).toBe(100 + levelUpReward(2) + levelUpReward(3))
  })

  it('과식으로 EXP 가 0 이면 레벨도 오르지 않는다', () => {
    const save = makeSave({
      pet: { name: '구즉이', bornAt: T0, level: 1, exp: expForNextLevel(1) - 1 },
      stats: { hunger: 95, mood: 50, clean: 50, energy: 50 },
    })
    const { next, leveledUpTo } = feed(save, 'apple', T0)

    expect(leveledUpTo).toBeNull()
    expect(next.pet.level).toBe(1)
    expect(next.wallet.coins).toBe(100)
  })
})

describe('grantItem — 지급', () => {
  it('없던 물건도 개수만큼 들어오고 있던 물건에는 더해진다', () => {
    const save = makeSave()

    expect(grantItem(save, 'apple', 3).inventory.apple).toBe(6)
    expect(grantItem(save, 'bread', 2).inventory.bread).toBe(2)
    // 입력은 그대로다.
    expect(save.inventory.apple).toBe(3)
  })
})

describe('불변성', () => {
  it('모든 함수가 입력 save 를 변형하지 않는다', () => {
    const save = makeSave({ sleep: { since: T0 - HOUR_MS }, inventory: { apple: 2 } })
    const before = snapshot(save)

    feed(save, 'apple', T0)
    feed(save, 'bread', T0)
    wash(save, T0)
    pat(save, T0)
    startSleep(save, T0)
    wakeUp(save, T0)
    grantItem(save, 'cake', 5)

    expect(snapshot(save)).toBe(before)
  })
})
