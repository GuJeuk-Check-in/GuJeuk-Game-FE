import { describe, expect, it } from 'vitest'

import type { PetSave } from '../types'
import { localDateKey } from './clock'
import { HOUR_MS, OFFLINE_CAP_MS, DAILY_CHECKIN_COIN, WELCOME_BACK_MIN_MS } from './economy'
import { applyElapsed, shouldShowWelcomeBack } from './stats'

// 로컬 시각으로 고정한다. UTC 로 잡으면 CI 의 타임존에 따라 날짜 넘김 테스트가
// 통과했다 실패했다 한다 — daily.date 가 로컬 기준이기 때문이다(§10).
const T0 = new Date(2026, 0, 15, 9, 0, 0, 0).getTime()

function makeSave(overrides: Partial<PetSave> = {}): PetSave {
  return {
    version: 1,
    pet: { name: '구즉이', bornAt: T0 - 24 * HOUR_MS, level: 1, exp: 0 },
    stats: { hunger: 100, mood: 100, clean: 100, energy: 100 },
    wallet: { coins: 100 },
    inventory: { apple: 3 },
    room: { wallpaper: 'default', floor: 'default', placed: [] },
    sleep: null,
    tutorial: { step: 0, done: false },
    // 기본값은 "오늘 이미 출석했다" 다. 스탯만 보는 테스트가 코인 지급에 흔들리지
    // 않게 하려는 것이다.
    daily: { date: localDateKey(T0), coinsEarned: 0, expEarned: 0, checkedIn: true, pets: 0 },
    lastSeenAt: T0,
    ...overrides,
  }
}

describe('applyElapsed — 경과 시간', () => {
  it('12시간이 지나면 배고픔이 정확히 72 줄어든다 (M1 완료 기준)', () => {
    const { next, report } = applyElapsed(makeSave(), T0 + 12 * HOUR_MS)

    expect(next.stats.hunger).toBe(28)
    expect(report.delta.hunger).toBe(-72)
    expect(report.appliedMs).toBe(12 * HOUR_MS)
    expect(report.awayMs).toBe(12 * HOUR_MS)
    // 정확히 상한이면 잘린 것이 아니다.
    expect(report.capped).toBe(false)
    expect(next.lastSeenAt).toBe(T0 + 12 * HOUR_MS)
  })

  it('24시간이 지나도 12시간치만 반영하고 capped 를 세운다', () => {
    const { next, report } = applyElapsed(makeSave(), T0 + 24 * HOUR_MS)

    expect(report.appliedMs).toBe(OFFLINE_CAP_MS)
    expect(report.awayMs).toBe(24 * HOUR_MS)
    expect(report.capped).toBe(true)
    // 2주 만에 돌아와도 밥 한 번이면 복구되는 수준이어야 한다(§5).
    expect(next.stats.hunger).toBe(28)
  })

  it('기기 시계가 되돌아가면 스탯이 하나도 변하지 않는다', () => {
    const save = makeSave()
    const { next, report } = applyElapsed(save, T0 - 3 * HOUR_MS)

    expect(next.stats).toEqual(save.stats)
    expect(report.delta).toEqual({ hunger: 0, mood: 0, clean: 0, energy: 0 })
    expect(report.appliedMs).toBe(0)
    expect(report.awayMs).toBe(0)
    expect(report.capped).toBe(false)
  })

  it('스탯은 0 아래로 내려가지 않는다', () => {
    const save = makeSave({ stats: { hunger: 5, mood: 5, clean: 5, energy: 5 } })
    const { next, report } = applyElapsed(save, T0 + 12 * HOUR_MS)

    expect(next.stats).toEqual({ hunger: 0, mood: 0, clean: 0, energy: 0 })
    // 리포트도 잘린 뒤의 실제 변화량이어야 한다. 이론상 -72 를 보여주면 복귀
    // 카드의 숫자와 게이지가 어긋난다.
    expect(report.delta.hunger).toBe(-5)
  })
})

describe('applyElapsed — 수면', () => {
  it('자는 동안 배고픔 감소가 절반이다', () => {
    const save = makeSave({ sleep: { since: T0 } })
    const { next, report } = applyElapsed(save, T0 + 2 * HOUR_MS)

    expect(next.stats.hunger).toBe(94)
    expect(report.slept).toBe(true)
  })

  it('에너지 회복이 8시간에서 멈춘다', () => {
    // 이미 7시간 자 있었으므로 2시간을 더 자도 상한까지 남은 1시간만 회복한다.
    const save = makeSave({
      sleep: { since: T0 - 7 * HOUR_MS },
      stats: { hunger: 100, mood: 100, clean: 100, energy: 0 },
    })
    const { next } = applyElapsed(save, T0 + 2 * HOUR_MS)

    expect(next.stats.energy).toBe(25)
  })

  it('상한을 이미 넘겨 자고 있으면 더 회복하지 않고 줄지도 않는다', () => {
    const save = makeSave({
      sleep: { since: T0 - 9 * HOUR_MS },
      stats: { hunger: 100, mood: 100, clean: 100, energy: 10 },
    })
    const { next } = applyElapsed(save, T0 + 2 * HOUR_MS)

    expect(next.stats.energy).toBe(10)
  })
})

describe('applyElapsed — 청결 0 이후의 기분 추가 감소', () => {
  it('경과 도중에 청결이 0 이 되면 그 이후 구간에만 벌점이 붙는다', () => {
    // 청결 3 · 시간당 3.0 이므로 1시간 뒤 0 이 된다. 3시간을 비우면 벌점 구간은 2시간.
    // 기분 = 100 - (4.0 × 3) - (2.0 × 2) = 84.
    // 전체 3시간에 일괄 적용하면 82, 아예 빼면 88 이 나온다. 둘 다 틀린 답이다.
    const save = makeSave({ stats: { hunger: 100, mood: 100, clean: 3, energy: 100 } })
    const { next, report } = applyElapsed(save, T0 + 3 * HOUR_MS)

    expect(next.stats.clean).toBe(0)
    expect(next.stats.mood).toBe(84)
    expect(report.delta.mood).toBe(-16)
  })

  it('이미 청결이 0 이면 전체 구간에 벌점이 붙는다', () => {
    const save = makeSave({ stats: { hunger: 100, mood: 100, clean: 0, energy: 100 } })
    const { next } = applyElapsed(save, T0 + 3 * HOUR_MS)

    expect(next.stats.mood).toBe(100 - 4 * 3 - 2 * 3)
  })

  it('자는 동안에는 청결 0 벌점도 절반이다', () => {
    // 명세 §4 의 표는 이 벌점을 "기분 감소가 시간당 2.0 추가"로 정의하므로,
    // 같은 절의 "수면 중 감소 절반" 규칙의 대상이다. 절반을 적용하지 않으면
    // 벌점(2.0)이 절반으로 깎인 기본 감소(2.0)와 같아져, 더러운 펫을 재우는
    // 것이 손해가 된다 — 절반 규칙을 둔 이유가 그대로 되살아난다.
    // 기분 = 100 - (4.0 × 0.5 × 12) - (2.0 × 0.5 × 12) = 64.
    const save = makeSave({
      sleep: { since: T0 },
      stats: { hunger: 100, mood: 100, clean: 0, energy: 100 },
    })
    const { next } = applyElapsed(save, T0 + 12 * HOUR_MS)

    expect(next.stats.mood).toBe(64)
  })
})

describe('shouldShowWelcomeBack', () => {
  function reportAfter(awayMs: number) {
    return applyElapsed(makeSave(), T0 + awayMs).report
  }

  it('4시간에서 1분 모자라면 뜨지 않는다', () => {
    expect(shouldShowWelcomeBack(reportAfter(WELCOME_BACK_MIN_MS - 60_000))).toBe(false)
  })

  it('정확히 4시간이면 뜬다', () => {
    expect(shouldShowWelcomeBack(reportAfter(WELCOME_BACK_MIN_MS))).toBe(true)
  })

  it('상한에 걸린 24시간 부재에서도 뜬다', () => {
    // 기준이 appliedMs 가 아니라 awayMs 라는 뜻이다. appliedMs 로 재면 상한이
    // 복귀 기준 아래로 내려가는 순간 카드가 영영 뜨지 않는다.
    const report = reportAfter(24 * HOUR_MS)

    expect(report.capped).toBe(true)
    expect(shouldShowWelcomeBack(report)).toBe(true)
  })
})

describe('applyElapsed — 날짜 넘김', () => {
  it('날짜가 바뀌면 daily 를 초기화하고 첫 접속 코인을 준다', () => {
    const save = makeSave({
      daily: { date: '2026-01-14', coinsEarned: 200, expEarned: 0, checkedIn: true, pets: 3 },
    })
    const { next } = applyElapsed(save, T0)

    expect(next.daily).toEqual({
      date: localDateKey(T0),
      coinsEarned: 0,
      expEarned: 0,
      checkedIn: true,
      pets: 0,
    })
    expect(next.wallet.coins).toBe(100 + DAILY_CHECKIN_COIN)
  })

  it('같은 날 두 번 호출해도 코인은 한 번만 준다', () => {
    const save = makeSave({
      daily: { date: '2026-01-14', coinsEarned: 200, expEarned: 0, checkedIn: true, pets: 3 },
    })
    const first = applyElapsed(save, T0).next
    const second = applyElapsed(first, T0 + 60_000).next

    expect(second.wallet.coins).toBe(100 + DAILY_CHECKIN_COIN)
  })
})

describe('applyElapsed — 불변성', () => {
  it('입력 세이브를 변형하지 않는다', () => {
    const save = makeSave({
      sleep: { since: T0 - 7 * HOUR_MS },
      daily: { date: '2026-01-14', coinsEarned: 200, expEarned: 0, checkedIn: true, pets: 3 },
    })
    const before = structuredClone(save)

    applyElapsed(save, T0 + 12 * HOUR_MS)

    expect(save).toEqual(before)
  })
})
