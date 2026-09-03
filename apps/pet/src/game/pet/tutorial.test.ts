import { describe, expect, it } from 'vitest'

import type { PetSave, RoomId } from '../types'
import { feed } from './actions'
import { localDateKey } from './clock'
import {
  HOUR_MS,
  MINIGAME_ENERGY_COST,
  OVERCLEAN_EXP_THRESHOLD,
  OVEREAT_EXP_THRESHOLD,
  TUTORIAL_APPLE_COUNT,
  TUTORIAL_COMPLETE_COIN,
  TUTORIAL_START_COIN,
} from './economy'
import { settle } from './minigames'
import {
  advance,
  canSkip,
  currentStep,
  isRoomUnlocked,
  keepTutorialEnergy,
  skip,
  startTutorial,
  TUTORIAL_START_STEP,
  TUTORIAL_STEPS,
} from './tutorial'

// 로컬 시각으로 고정한다. daily.date 가 로컬 기준이라 UTC 로 잡으면 CI 의
// 타임존에 따라 결과가 흔들린다(§10).
const T0 = new Date(2026, 0, 15, 9, 0, 0, 0).getTime()

/** 아직 아무것도 받지 않은 새 펫. 진입 지급이 들어왔는지 보려면 빈손이어야 한다. */
function makeSave(overrides: Partial<PetSave> = {}): PetSave {
  return {
    version: 1,
    pet: { name: '구즉이', bornAt: T0 - HOUR_MS, level: 1, exp: 0 },
    stats: { hunger: 100, mood: 100, clean: 100, energy: 100 },
    wallet: { coins: 0 },
    inventory: {},
    room: { wallpaper: 'default', floor: 'default', placed: [] },
    sleep: null,
    tutorial: { step: TUTORIAL_START_STEP, done: false },
    daily: { date: localDateKey(T0), coinsEarned: 0, expEarned: 0, checkedIn: true, pets: 0 },
    lastSeenAt: T0,
    ...overrides,
  }
}

/** 단계 번호로 바로 만드는 세이브. 진입 지급은 붙지 않은 상태다. */
function atStep(step: number, overrides: Partial<PetSave> = {}): PetSave {
  return makeSave({ ...overrides, tutorial: { step, done: false } })
}

/** 입력이 변형되지 않았는지 보는 유일한 방법은 부르기 전 값을 통째로 떠 두는 것이다. */
function snapshot(save: PetSave): string {
  return JSON.stringify(save)
}

const ALL_ROOMS: readonly RoomId[] = ['living', 'kitchen', 'bath', 'bed', 'play', 'shop']

describe('TUTORIAL_STEPS — 대본', () => {
  it('0~6 일곱 단계이고 id 가 배열 인덱스와 같다', () => {
    // id 와 인덱스가 어긋나면 세이브의 step 으로 배열을 찾는 곳이 전부 틀어진다.
    expect(TUTORIAL_STEPS).toHaveLength(7)
    TUTORIAL_STEPS.forEach((step, index) => {
      expect(step.id).toBe(index)
    })
  })

  it('모든 단계에 문구가 있다', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.text.length).toBeGreaterThan(0)
    }
  })

  it('명세 §9 의 순서대로 사건이 배치돼 있다', () => {
    expect(TUTORIAL_STEPS.map((step) => step.completedBy)).toEqual([
      'confirm',
      'confirm',
      'fed',
      'washed',
      'played',
      'bought',
      'confirm',
    ])
  })
})

describe('startTutorial — 시작', () => {
  it('2단계에서 시작하고 사과를 쥐여 준다', () => {
    const save = makeSave({ tutorial: { step: 0, done: false } })
    const started = startTutorial(save)

    expect(started.tutorial).toEqual({ step: TUTORIAL_START_STEP, done: false })
    expect(started.inventory.apple).toBe(TUTORIAL_APPLE_COUNT)
    // 코인은 5단계 진입에서 준다. 여기서 미리 주면 상점이 잠긴 채 코인만 쌓인다.
    expect(started.wallet.coins).toBe(0)
  })

  it('2·3단계가 강조하는 게이지를 비워 둔다', () => {
    // 가득 찬 게이지로 시작하면 사과를 먹여도 100 에서 잘려 움직이지 않고 과식
    // 판정에 걸린다 — 시연이 시연을 못 한다(§14 "값이 변할 때 보간되는가").
    const started = startTutorial(makeSave())

    expect(started.stats.hunger).toBeLessThan(OVEREAT_EXP_THRESHOLD)
    expect(started.stats.clean).toBeLessThan(OVERCLEAN_EXP_THRESHOLD)
  })

  it('첫 사과에서 게이지가 오르고 EXP 도 붙는다', () => {
    const started = startTutorial(makeSave())
    const fed = feed(started, 'apple', T0)

    expect(fed.changed).toBe(true)
    expect(fed.next.stats.hunger).toBeGreaterThan(started.stats.hunger)
    expect(fed.expGained).toBeGreaterThan(0)
    // "배부른데도" 는 첫 시연에서 나오면 안 되는 문구다.
    expect(fed.message).not.toContain('배부른데도')
  })

  it('입력을 변형하지 않는다', () => {
    const save = makeSave({ tutorial: { step: 0, done: false } })
    const before = snapshot(save)

    startTutorial(save)

    expect(snapshot(save)).toBe(before)
  })
})

describe('currentStep — 지금 단계', () => {
  it('세이브의 step 이 가리키는 단계를 준다', () => {
    expect(currentStep(atStep(3))?.id).toBe(3)
    expect(currentStep(atStep(3))?.highlight).toBe('clean')
  })

  it('끝났으면 null 이다', () => {
    const save = makeSave({ tutorial: { step: 6, done: true } })
    expect(currentStep(save)).toBeNull()
  })

  it('범위 밖 step 도 null 이다', () => {
    // 손으로 고친 세이브가 엉뚱한 숫자를 들고 와도 화면이 죽지 않아야 한다.
    expect(currentStep(atStep(99))).toBeNull()
    expect(currentStep(atStep(-1))).toBeNull()
  })

  it('정수가 아닌 step 도 null 이다', () => {
    // 2.5 는 범위 검사를 그대로 지나가고 TUTORIAL_STEPS[2.5] 는 undefined 다.
    // 반환 타입은 null 이라고 적혀 있으니 부르는 쪽의 !== null 검사가 전부
    // 통과하고, advance 와 오버레이가 그 자리에서 던져 화면이 통째로 죽는다.
    expect(currentStep(atStep(2.5))).toBeNull()
    expect(advance(atStep(2.5), 'fed')).toEqual(atStep(2.5))
  })
})

describe('advance — 단계 넘기기', () => {
  it('시작부터 끝까지 순서대로 넘어간다', () => {
    const s2 = startTutorial(makeSave())
    expect(currentStep(s2)?.id).toBe(2)

    const s3 = advance(s2, 'fed')
    expect(currentStep(s3)?.id).toBe(3)

    const s4 = advance(s3, 'washed')
    expect(currentStep(s4)?.id).toBe(4)

    const s5 = advance(s4, 'played')
    expect(currentStep(s5)?.id).toBe(5)

    const s6 = advance(s5, 'bought')
    expect(currentStep(s6)?.id).toBe(6)

    const done = advance(s6, 'confirm')
    expect(currentStep(done)).toBeNull()
    expect(done.tutorial.done).toBe(true)
  })

  it('엉뚱한 사건은 아무것도 바꾸지 않는다', () => {
    const save = atStep(3)
    const before = snapshot(save)

    // 3단계를 끝내는 것은 'washed' 뿐이다. 나머지 넷은 전부 무시된다.
    for (const event of ['confirm', 'fed', 'played', 'bought'] as const) {
      expect(snapshot(advance(save, event))).toBe(before)
    }
  })

  it('이미 끝난 튜토리얼은 어떤 사건에도 움직이지 않는다', () => {
    const save = makeSave({ tutorial: { step: TUTORIAL_STEPS.length, done: true } })
    const before = snapshot(save)

    expect(snapshot(advance(save, 'confirm'))).toBe(before)
    expect(snapshot(advance(save, 'bought'))).toBe(before)
  })

  it('입력을 변형하지 않는다', () => {
    const save = startTutorial(makeSave())
    const before = snapshot(save)

    advance(save, 'fed')

    expect(snapshot(save)).toBe(before)
  })
})

describe('진입 지급', () => {
  it('5단계에 들어갈 때 코인 100 이 한 번 들어온다', () => {
    const s4 = atStep(4, { wallet: { coins: 7 } })
    const s5 = advance(s4, 'played')

    expect(s5.tutorial.step).toBe(5)
    expect(s5.wallet.coins).toBe(7 + TUTORIAL_START_COIN)
  })

  it('같은 사건이 다시 와도 두 번 들어오지 않는다', () => {
    const s5 = advance(atStep(4), 'played')
    // 5단계를 끝내는 사건은 'bought' 다. 'played' 가 다시 와도 제자리이고,
    // 지급은 전이 순간에만 붙어 있으므로 코인도 늘지 않는다.
    const again = advance(s5, 'played')

    expect(again.wallet.coins).toBe(TUTORIAL_START_COIN)
    expect(again.tutorial.step).toBe(5)
  })

  it('처음부터 끝까지 돌려도 사과 3개와 코인 100 이 정확히 한 번씩이다', () => {
    let save = startTutorial(makeSave())
    // 사이사이에 엉뚱한 사건을 섞는다. 화면이 같은 사건을 두 번 보내도 안전해야 한다.
    save = advance(save, 'fed')
    save = advance(save, 'fed')
    save = advance(save, 'washed')
    save = advance(save, 'washed')
    save = advance(save, 'played')
    save = advance(save, 'played')
    save = advance(save, 'bought')
    save = advance(save, 'bought')
    save = advance(save, 'confirm')

    expect(save.inventory.apple).toBe(TUTORIAL_APPLE_COUNT)
    expect(save.wallet.coins).toBe(TUTORIAL_START_COIN + TUTORIAL_COMPLETE_COIN)
    expect(save.tutorial.done).toBe(true)
  })
})

describe('완료', () => {
  it('마지막 단계를 끝내면 done 이 서고 완료 보상이 들어온다', () => {
    const s6 = atStep(6, { wallet: { coins: 40 } })
    const done = advance(s6, 'confirm')

    expect(done.tutorial.done).toBe(true)
    expect(done.wallet.coins).toBe(40 + TUTORIAL_COMPLETE_COIN)
  })

  it('끝난 뒤 step 도 배열 밖으로 올라가 done 과 같은 이야기를 한다', () => {
    const done = advance(atStep(6), 'confirm')

    expect(done.tutorial.step).toBe(TUTORIAL_STEPS.length)
    expect(currentStep(done)).toBeNull()
  })

  it('완료 보상은 한 번뿐이다', () => {
    const done = advance(atStep(6), 'confirm')
    const again = advance(done, 'confirm')

    expect(again.wallet.coins).toBe(TUTORIAL_COMPLETE_COIN)
  })
})

describe('keepTutorialEnergy — 튜토리얼 판의 에너지 면제', () => {
  it('튜토리얼 중에 끝낸 판은 에너지를 소모하지 않는다', () => {
    // §9 의 면제가 없으면, 4단계에서 앱을 끄고 며칠에 걸쳐 다시 여는 사람은
    // 복귀할 때마다 에너지를 잃다가 미니게임 자체가 막혀 그 자리에서 멈춘다.
    const save = atStep(4)
    const settled = settle(save, 'catch', 12, T0)

    expect(settled.next.stats.energy).toBe(save.stats.energy - MINIGAME_ENERGY_COST.catch)
    expect(keepTutorialEnergy(save, settled.next).stats.energy).toBe(save.stats.energy)
  })

  it('코인·EXP 는 그대로 둔다 — 되돌리는 것은 에너지뿐이다', () => {
    const save = atStep(4)
    const settled = settle(save, 'catch', 12, T0)
    const kept = keepTutorialEnergy(save, settled.next)

    expect(kept.wallet.coins).toBe(settled.next.wallet.coins)
    expect(kept.pet.exp).toBe(settled.next.pet.exp)
  })

  it('튜토리얼이 끝난 뒤에는 정상대로 소모한다', () => {
    const save = makeSave({ tutorial: { step: TUTORIAL_STEPS.length, done: true } })
    const settled = settle(save, 'echo', 5, T0)

    expect(keepTutorialEnergy(save, settled.next).stats.energy).toBe(
      save.stats.energy - MINIGAME_ENERGY_COST.echo,
    )
  })
})

describe('isRoomUnlocked — 방 해금', () => {
  it('거실·주방·욕실·침실은 처음부터 열려 있다', () => {
    // 2단계가 주방을, 3단계가 욕실을 시킨다. 이 넷을 잠그면 튜토리얼이 자기를 막는다.
    const save = atStep(TUTORIAL_START_STEP)
    for (const room of ['living', 'kitchen', 'bath', 'bed'] as const) {
      expect(isRoomUnlocked(save, room)).toBe(true)
    }
  })

  it('놀이터는 4단계부터, 상점은 5단계부터 열린다', () => {
    expect(isRoomUnlocked(atStep(3), 'play')).toBe(false)
    expect(isRoomUnlocked(atStep(4), 'play')).toBe(true)

    expect(isRoomUnlocked(atStep(4), 'shop')).toBe(false)
    expect(isRoomUnlocked(atStep(5), 'shop')).toBe(true)
  })

  it('튜토리얼이 끝나면 여섯 방이 모두 열린다', () => {
    const done = makeSave({ tutorial: { step: TUTORIAL_STEPS.length, done: true } })
    for (const room of ALL_ROOMS) {
      expect(isRoomUnlocked(done, room)).toBe(true)
    }
  })
})

describe('canSkip — 스킵 노출', () => {
  it('0~1단계에서는 건너뛸 수 없다', () => {
    expect(canSkip(atStep(0))).toBe(false)
    expect(canSkip(atStep(1))).toBe(false)
  })

  it('2단계부터 건너뛸 수 있다', () => {
    expect(canSkip(atStep(TUTORIAL_START_STEP))).toBe(true)
    expect(canSkip(atStep(6))).toBe(true)
  })

  it('이미 끝났으면 건너뛸 것이 없다', () => {
    expect(canSkip(makeSave({ tutorial: { step: TUTORIAL_STEPS.length, done: true } }))).toBe(false)
  })
})

describe('skip — 건너뛰기', () => {
  it('끝내고 완료 보상까지 준다', () => {
    const done = skip(startTutorial(makeSave()))

    expect(done.tutorial.done).toBe(true)
    expect(currentStep(done)).toBeNull()
  })

  it('건너뛴 사람도 막히지 않는다 — 남은 진입 지급을 받는다', () => {
    // 2단계에서 스킵하면 5단계 코인을 아직 못 받았다. 그대로 내보내면 코인 0 ·
    // 음식만 3개인 채로 상점 앞에 서게 된다.
    const done = skip(startTutorial(makeSave()))

    expect(done.inventory.apple).toBe(TUTORIAL_APPLE_COUNT)
    expect(done.wallet.coins).toBe(TUTORIAL_START_COIN + TUTORIAL_COMPLETE_COIN)
    for (const room of ALL_ROOMS) {
      expect(isRoomUnlocked(done, room)).toBe(true)
    }
  })

  it('이미 받은 지급을 다시 주지 않는다', () => {
    // 5단계까지 왔으면 코인 100 은 이미 받았다. 스킵이 또 주면 두 배가 된다.
    const s5 = advance(atStep(4), 'played')
    const done = skip(s5)

    expect(done.wallet.coins).toBe(TUTORIAL_START_COIN + TUTORIAL_COMPLETE_COIN)
  })

  it('건너뛸 수 없는 단계에서는 아무것도 하지 않는다', () => {
    const save = atStep(1)
    const before = snapshot(save)

    expect(snapshot(skip(save))).toBe(before)
  })

  it('입력을 변형하지 않는다', () => {
    const save = startTutorial(makeSave())
    const before = snapshot(save)

    skip(save)

    expect(snapshot(save)).toBe(before)
  })
})
