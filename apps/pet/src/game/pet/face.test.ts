import { describe, expect, it } from 'vitest'
import {
  BLINK_HOLD_SEC,
  BLINK_MAX_GAP_SEC,
  BLINK_MIN_GAP_SEC,
  isBlinking,
  petSpriteName,
  pickFace,
} from './face'

describe('petSpriteName', () => {
  it('기본 표정은 접미사가 붙지 않는다', () => {
    expect(petSpriteName('adult', 'base')).toBe('pet-adult')
  })

  it('나머지 표정은 접미사가 붙는다', () => {
    expect(petSpriteName('baby', 'blink')).toBe('pet-baby-blink')
    expect(petSpriteName('child', 'sad')).toBe('pet-child-sad')
    expect(petSpriteName('adult', 'open')).toBe('pet-adult-open')
  })
})

describe('pickFace', () => {
  const base = { moodZero: false, eating: false, blinking: false }

  it('아무 일도 없으면 기본 얼굴이다', () => {
    expect(pickFace(base)).toBe('base')
  })

  it('먹는 중이면 입을 벌린다', () => {
    expect(pickFace({ ...base, eating: true })).toBe('open')
  })

  it('기분이 0 이면 시무룩하다', () => {
    expect(pickFace({ ...base, moodZero: true })).toBe('sad')
  })

  it('깜빡이는 순간에는 눈을 감는다', () => {
    expect(pickFace({ ...base, blinking: true })).toBe('blink')
  })

  // sad-blink 스프라이트가 없다. 깜빡임이 이기면 시무룩한 펫이 깜빡일 때마다
  // 멀쩡한 얼굴로 돌아온다.
  it('시무룩할 때 깜빡여도 시무룩한 얼굴을 유지한다', () => {
    expect(pickFace({ ...base, moodZero: true, blinking: true })).toBe('sad')
  })

  it('먹는 것이 다른 모든 표정을 이긴다', () => {
    expect(pickFace({ moodZero: true, eating: true, blinking: true })).toBe('open')
  })
})

describe('isBlinking', () => {
  it('시작 직후에는 깜빡이지 않는다', () => {
    expect(isBlinking(0)).toBe(false)
  })

  it('음수 시간에도 죽지 않는다', () => {
    expect(isBlinking(-1)).toBe(false)
  })

  it('같은 시각에는 항상 같은 답을 준다', () => {
    for (const t of [1.5, 4.2, 9.9, 30, 123.456]) {
      expect(isBlinking(t)).toBe(isBlinking(t))
    }
  })

  it('첫 깜빡임은 최소 간격 이후, 최대 간격 이전에 온다', () => {
    // 최소 간격 전에는 한 번도 감지 않는다.
    for (let t = 0; t < BLINK_MIN_GAP_SEC; t += 0.02) {
      expect(isBlinking(t)).toBe(false)
    }
    // 최대 간격 + 유지 시간 안에는 반드시 한 번 감는다.
    let blinked = false
    for (let t = 0; t <= BLINK_MAX_GAP_SEC + BLINK_HOLD_SEC; t += 0.01) {
      if (isBlinking(t)) blinked = true
    }
    expect(blinked).toBe(true)
  })

  it('깜빡임이 이어지지 않고 짧게 끊긴다', () => {
    // 5분 동안 훑어 "감고 있는 시간"의 비율을 본다. 눈을 오래 감고 있으면
    // 자는 것처럼 보이므로 전체의 5% 를 넘지 않아야 한다.
    let closed = 0
    let total = 0
    for (let t = 0; t < 300; t += 0.01) {
      total += 1
      if (isBlinking(t)) closed += 1
    }
    expect(closed / total).toBeLessThan(0.05)
  })

  it('5분 동안 60번 이상 깜빡인다 — 간격이 3~5초이므로', () => {
    let edges = 0
    let previous = false
    for (let t = 0; t < 300; t += 0.01) {
      const now = isBlinking(t)
      if (now && !previous) edges += 1
      previous = now
    }
    expect(edges).toBeGreaterThanOrEqual(60)
    expect(edges).toBeLessThanOrEqual(100)
  })
})
