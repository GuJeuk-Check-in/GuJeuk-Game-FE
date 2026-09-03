import { describe, expect, it } from 'vitest'

import type { PetSave } from '../types'
import { localDateKey } from './clock'
import {
  DAILY_COIN_CAP,
  DAILY_EXP_CAP,
  expForNextLevel,
  HOUR_MS,
  HUNGRY_COIN_FACTOR,
  levelUpReward,
  MINIGAME_ENERGY_COST,
  MINIGAME_REWARD,
} from './economy'
import { canPlay, settle } from './minigames'

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

describe('canPlay — 진입 조건', () => {
  it('에너지가 비용보다 적으면 막고, 다음에 무엇을 해야 하는지 알려준다', () => {
    const save = makeSave({ stats: { hunger: 50, mood: 50, clean: 50, energy: 11 } })
    const check = canPlay(save, 'catch')

    expect(MINIGAME_ENERGY_COST.catch).toBe(12)
    expect(check.ok).toBe(false)
    // "에너지 부족"만 띄우면 사용자는 무엇을 눌러야 풀리는지 모른다(§14).
    expect(check.reason).toContain('침실')
  })

  it('에너지가 비용과 딱 같으면 통과한다', () => {
    const save = makeSave({
      stats: { hunger: 50, mood: 50, clean: 50, energy: MINIGAME_ENERGY_COST.catch },
    })
    const check = canPlay(save, 'catch')

    expect(check.ok).toBe(true)
    expect(check.reason).toBe('')
  })

  it('게임마다 비용이 다르므로 같은 에너지에서 결과가 갈린다', () => {
    // 에너지 10 이면 따라하기(8)는 되고 간식받기·폴짝(12)은 안 된다.
    const save = makeSave({ stats: { hunger: 50, mood: 50, clean: 50, energy: 10 } })

    expect(canPlay(save, 'echo').ok).toBe(true)
    expect(canPlay(save, 'catch').ok).toBe(false)
    expect(canPlay(save, 'hop').ok).toBe(false)
  })

  it('자고 있으면 기운이 충분해도 막고, 깨우라고 알려준다', () => {
    // 자면서 놀 수 있으면 회복(에너지 +25/h)과 감소 절반을 켠 채 판만 반복하는
    // 것이 언제나 이득이 되어, §4 가 에너지로 걸어 둔 판수 제한이 무력해진다.
    const save = makeSave({
      stats: { hunger: 50, mood: 50, clean: 50, energy: 100 },
      sleep: { since: T0 - HOUR_MS },
    })
    const check = canPlay(save, 'catch')

    expect(check.ok).toBe(false)
    expect(check.reason).toContain('깨우')
  })

  it('자는 중이면서 기운도 없으면 "깨우라"가 먼저다', () => {
    // 자고 있는데 "재워 주세요"를 띄우면 이미 한 일을 다시 하라는 말이 된다.
    const save = makeSave({
      stats: { hunger: 50, mood: 50, clean: 50, energy: 0 },
      sleep: { since: T0 - HOUR_MS },
    })

    expect(canPlay(save, 'catch').reason).toContain('깨우')
  })
})

describe('settle — 보상식이 economy.ts 와 일치한다', () => {
  it('간식받기: 코인 = 점수, EXP = 10 + 점수/5 (내림)', () => {
    const save = makeSave()
    const result = settle(save, 'catch', 37, T0)

    expect(result.coinsBeforeAdjust).toBe(MINIGAME_REWARD.catch.coin(37))
    expect(result.coinsBeforeAdjust).toBe(37)
    // 17.4 는 17 이다. 소수 EXP 가 세이브에 남으면 화면의 게이지가 어긋난다.
    expect(result.exp).toBe(Math.floor(MINIGAME_REWARD.catch.exp(37)))
    expect(result.exp).toBe(17)
    expect(result.coins).toBe(37)
  })

  it('폴짝 달리기: 코인 = floor(m/10), EXP = 10 + m/50 (내림)', () => {
    const save = makeSave()
    const result = settle(save, 'hop', 137, T0)

    expect(result.coinsBeforeAdjust).toBe(MINIGAME_REWARD.hop.coin(137))
    expect(result.coinsBeforeAdjust).toBe(13)
    expect(result.exp).toBe(Math.floor(MINIGAME_REWARD.hop.exp(137)))
    expect(result.exp).toBe(12)
  })

  it('따라하기: 코인 = 라운드 × 3, EXP = 5 + 라운드 × 2', () => {
    const save = makeSave()
    const result = settle(save, 'echo', 9, T0)

    expect(result.coinsBeforeAdjust).toBe(MINIGAME_REWARD.echo.coin(9))
    expect(result.coinsBeforeAdjust).toBe(27)
    expect(result.exp).toBe(MINIGAME_REWARD.echo.exp(9))
    expect(result.exp).toBe(23)
  })

  it('0 점이어도 EXP 는 나오고 코인만 0 이다', () => {
    // 첫 판에서 0 점을 받고 아무것도 못 얻으면 다시 안 한다(§8 의 EXP 기본값).
    const result = settle(makeSave(), 'catch', 0, T0)

    expect(result.coins).toBe(0)
    expect(result.exp).toBe(10)
  })
})

describe('settle — 에너지', () => {
  it('게임마다 정해진 만큼 에너지를 뺀다', () => {
    const save = makeSave()

    expect(settle(save, 'catch', 10, T0).next.stats.energy).toBe(50 - MINIGAME_ENERGY_COST.catch)
    expect(settle(save, 'echo', 3, T0).next.stats.energy).toBe(50 - MINIGAME_ENERGY_COST.echo)
  })

  it('0 아래로 내려가지 않는다', () => {
    const save = makeSave({ stats: { hunger: 50, mood: 50, clean: 50, energy: 3 } })

    expect(settle(save, 'catch', 10, T0).next.stats.energy).toBe(0)
  })

  it('다른 스탯은 건드리지 않는다', () => {
    const { next } = settle(makeSave(), 'catch', 10, T0)

    expect(next.stats.hunger).toBe(50)
    expect(next.stats.mood).toBe(50)
    expect(next.stats.clean).toBe(50)
  })
})

describe('settle — 스탯 0 벌칙 (§4)', () => {
  it('배고픔이 0 이면 코인이 절반이고 EXP 는 0 이다', () => {
    // §4 스탯표: 배고픔 0 → "미니게임 코인 50%, 미니게임 EXP 0". 둘 다다.
    const save = makeSave({ stats: { hunger: 0, mood: 50, clean: 50, energy: 50 } })
    const result = settle(save, 'catch', 37, T0)

    expect(HUNGRY_COIN_FACTOR).toBe(0.5)
    expect(result.hungryHalved).toBe(true)
    // 결과 화면이 "원래 37 인데 18" 을 보여줄 수 있어야 한다.
    expect(result.coinsBeforeAdjust).toBe(37)
    expect(result.coins).toBe(18)
    expect(result.exp).toBe(0)
    expect(result.next.pet.exp).toBe(0)
    expect(result.next.wallet.coins).toBe(100 + 18)
  })

  it('기분이 0 이면 EXP 가 0 이다. 코인은 그대로다', () => {
    const save = makeSave({ stats: { hunger: 50, mood: 0, clean: 50, energy: 50 } })
    const result = settle(save, 'catch', 37, T0)

    expect(result.exp).toBe(0)
    expect(result.next.pet.exp).toBe(0)
    expect(result.leveledUpTo).toBeNull()
    expect(result.coins).toBe(37)
    expect(result.hungryHalved).toBe(false)
  })

  it('배고픔과 기분이 함께 0 이면 코인 절반에 EXP 0 이다', () => {
    const save = makeSave({ stats: { hunger: 0, mood: 0, clean: 50, energy: 50 } })
    const result = settle(save, 'echo', 9, T0)

    expect(result.coins).toBe(13) // floor(27 × 0.5)
    expect(result.exp).toBe(0)
  })
})

describe('settle — 일일 코인 상한 (§7)', () => {
  it('남은 한도가 10 인데 40 을 벌면 10 만 들어오고 dailyCapped 가 true 다', () => {
    const save = makeSave({
      daily: {
        date: localDateKey(T0),
        coinsEarned: DAILY_COIN_CAP - 10,
        expEarned: 0,
        checkedIn: true,
        pets: 0,
      },
    })
    const result = settle(save, 'catch', 40, T0)

    expect(result.coinsBeforeAdjust).toBe(40)
    expect(result.coins).toBe(10)
    expect(result.dailyCapped).toBe(true)
    expect(result.next.wallet.coins).toBe(100 + 10)
    expect(result.next.daily.coinsEarned).toBe(DAILY_COIN_CAP)
  })

  it('한도가 남아 있으면 잘리지 않고 daily.coinsEarned 가 그만큼 오른다', () => {
    const save = makeSave({
      daily: { date: localDateKey(T0), coinsEarned: 100, expEarned: 0, checkedIn: true, pets: 0 },
    })
    const result = settle(save, 'catch', 40, T0)

    expect(result.dailyCapped).toBe(false)
    expect(result.coins).toBe(40)
    expect(result.next.daily.coinsEarned).toBe(140)
  })

  it('상한을 이미 채웠으면 0 코인이지만 EXP 와 에너지 차감은 그대로 일어난다', () => {
    // 조용히 0 코인을 주면 버그로 오해한다 — dailyCapped 로 이유를 알린다(§7).
    const save = makeSave({
      daily: {
        date: localDateKey(T0),
        coinsEarned: DAILY_COIN_CAP,
        expEarned: 0,
        checkedIn: true,
        pets: 0,
      },
    })
    const result = settle(save, 'catch', 40, T0)

    expect(result.coins).toBe(0)
    expect(result.dailyCapped).toBe(true)
    expect(result.next.wallet.coins).toBe(100)
    expect(result.next.daily.coinsEarned).toBe(DAILY_COIN_CAP)
    expect(result.exp).toBe(18)
    expect(result.next.pet.exp).toBe(18)
    expect(result.next.stats.energy).toBe(50 - MINIGAME_ENERGY_COST.catch)
  })

  it('배고픔 절반을 먼저 걸고 그다음에 상한을 건다', () => {
    // 순서가 뒤집히면 배고픈 펫이 남은 한도의 절반만 받고 나머지 한도가 사라진다.
    const save = makeSave({
      stats: { hunger: 0, mood: 50, clean: 50, energy: 50 },
      daily: {
        date: localDateKey(T0),
        coinsEarned: DAILY_COIN_CAP - 20,
        expEarned: 0,
        checkedIn: true,
        pets: 0,
      },
    })
    const result = settle(save, 'catch', 60, T0)

    // 60 → 절반 30 → 남은 한도 20 으로 잘린다. 상한을 먼저 걸었다면 10 이었다.
    expect(result.hungryHalved).toBe(true)
    expect(result.dailyCapped).toBe(true)
    expect(result.coins).toBe(20)
  })
})

describe('settle — 레벨업 (§6)', () => {
  it('EXP 가 필요치를 넘으면 레벨이 오르고 도달 레벨 기준 코인을 준다', () => {
    const save = makeSave({
      pet: { name: '구즉이', bornAt: T0, level: 1, exp: expForNextLevel(1) - 1 },
    })
    const result = settle(save, 'echo', 9, T0)

    expect(result.leveledUpTo).toBe(2)
    expect(result.next.pet.level).toBe(2)
    expect(result.next.pet.exp).toBe(expForNextLevel(1) - 1 + 23 - expForNextLevel(1))
    expect(levelUpReward(2)).toBe(100)
    expect(result.next.wallet.coins).toBe(100 + 27 + 100)
  })

  it('한 판의 EXP 는 일일 상한에서 잘린다', () => {
    // 라운드 130 이면 원래 EXP 265 다. 상한(140)이 그 위에서 자른다.
    //
    // 상한을 넣기 전에는 이 한 판으로 Lv3 까지 갔다. 그것이 "며칠 만에 다
    // 컸다"의 정체였다 — §6 은 Lv10 까지 한 달을 가정하고 곡선을 짰는데
    // EXP 에는 아무 상한도 없었다.
    const result = settle(makeSave(), 'echo', 130, T0)

    expect(result.expBeforeCap).toBe(265)
    expect(result.exp).toBe(DAILY_EXP_CAP)
    expect(result.expCapped).toBe(true)
    expect(result.next.daily.expEarned).toBe(DAILY_EXP_CAP)
    expect(result.leveledUpTo).toBe(2)
  })

  it('상한을 이미 채웠으면 EXP 가 0 이고 레벨이 오르지 않는다', () => {
    const save = makeSave({
      daily: {
        date: localDateKey(T0),
        coinsEarned: 0,
        expEarned: DAILY_EXP_CAP,
        checkedIn: true,
        pets: 0,
      },
    })
    const result = settle(save, 'echo', 130, T0)

    expect(result.exp).toBe(0)
    expect(result.expCapped).toBe(true)
    expect(result.next.pet.level).toBe(1)
    expect(result.next.daily.expEarned).toBe(DAILY_EXP_CAP)
  })

  it('남은 한도만큼만 준다', () => {
    const save = makeSave({
      daily: {
        date: localDateKey(T0),
        coinsEarned: 0,
        expEarned: DAILY_EXP_CAP - 30,
        checkedIn: true,
        pets: 0,
      },
    })
    const result = settle(save, 'echo', 130, T0)

    expect(result.exp).toBe(30)
    expect(result.next.daily.expEarned).toBe(DAILY_EXP_CAP)
  })

  it('EXP 가 이미 쌓여 있으면 한 판에 두 레벨도 오른다', () => {
    // 상한(140)이 Lv1→3 에 필요한 260 보다 작아서, 맨바닥에서 두 레벨을 뛰는
    // 일은 이제 없다. 그래도 정산은 여러 레벨을 처리할 수 있어야 한다 — 남은
    // EXP 가 다음 필요치를 넘긴 채 고여 있으면 엉뚱한 행동에서 터진다.
    const save = makeSave({ pet: { name: '구즉이', bornAt: T0, level: 1, exp: 130 } })
    const result = settle(save, 'echo', 130, T0)

    expect(result.exp).toBe(DAILY_EXP_CAP)
    expect(result.leveledUpTo).toBe(3)
    expect(result.next.pet.level).toBe(3)
    expect(result.next.pet.exp).toBe(130 + DAILY_EXP_CAP - expForNextLevel(1) - expForNextLevel(2))
  })

  it('레벨업 보상 코인은 일일 상한에 걸리지 않는다', () => {
    // 상한은 "미니게임 합산"이다(§7). 상한을 채운 날 레벨이 올랐다고 보상이
    // 조용히 사라지면 사용자는 레벨업 문구와 지갑이 어긋나는 것을 본다.
    const save = makeSave({
      daily: {
        date: localDateKey(T0),
        coinsEarned: DAILY_COIN_CAP,
        expEarned: 0,
        checkedIn: true,
        pets: 0,
      },
    })
    const result = settle(save, 'echo', 50, T0)

    expect(result.coins).toBe(0)
    expect(result.dailyCapped).toBe(true)
    expect(result.leveledUpTo).toBe(2)
    expect(result.next.wallet.coins).toBe(100 + levelUpReward(2))
    // 상한 계산에는 미니게임 몫만 더해진다.
    expect(result.next.daily.coinsEarned).toBe(DAILY_COIN_CAP)
  })

  it('기분 0 으로 EXP 가 0 이면 레벨도 오르지 않는다', () => {
    const save = makeSave({
      pet: { name: '구즉이', bornAt: T0, level: 1, exp: expForNextLevel(1) - 1 },
      stats: { hunger: 50, mood: 0, clean: 50, energy: 50 },
    })
    const result = settle(save, 'echo', 9, T0)

    expect(result.leveledUpTo).toBeNull()
    expect(result.next.pet.level).toBe(1)
  })
})

describe('settle — 세이브', () => {
  it('lastSeenAt 을 판이 끝난 시각으로 맞춘다', () => {
    const later = T0 + 3 * HOUR_MS
    const { next } = settle(makeSave(), 'catch', 10, later)

    expect(next.lastSeenAt).toBe(later)
  })

  it('daily.date 는 건드리지 않는다 — 날짜 넘김은 applyElapsed 의 일이다', () => {
    const save = makeSave()
    const { next } = settle(save, 'catch', 10, T0 + 30 * HOUR_MS)

    expect(next.daily.date).toBe(save.daily.date)
  })
})

describe('불변성', () => {
  it('canPlay 도 settle 도 입력 save 를 변형하지 않는다', () => {
    const save = makeSave({
      stats: { hunger: 0, mood: 0, clean: 50, energy: 50 },
      daily: {
        date: localDateKey(T0),
        coinsEarned: DAILY_COIN_CAP - 5,
        expEarned: 0,
        checkedIn: true,
        pets: 0,
      },
    })
    const before = snapshot(save)

    canPlay(save, 'catch')
    settle(save, 'catch', 40, T0)
    settle(save, 'hop', 400, T0)
    settle(save, 'echo', 130, T0)

    expect(snapshot(save)).toBe(before)
  })
})
