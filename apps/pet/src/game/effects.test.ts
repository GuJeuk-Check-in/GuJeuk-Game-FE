import { describe, expect, it } from 'vitest'

import { MAX_PARTICLES, spawn, step, trim } from './effects'

/** 난수를 못 박아 결과를 비교할 수 있게 한다. */
const fixed = (value: number) => () => value

describe('effects — 돌봄 이펙트 (이슈 #11 · 5)', () => {
  it('수명이 다하면 사라진다', () => {
    const one = spawn('bubble', 10, 20, fixed(0))
    expect(step([one], one.lifeSec + 0.01)).toHaveLength(0)
  })

  it('살아 있는 동안은 움직인다', () => {
    const one = spawn('heart', 10, 20, fixed(0.5))
    const [moved] = step([one], 0.1)

    expect(moved.ageSec).toBeCloseTo(0.1)
    // 하트는 위로 뜬다. 논리 좌표는 아래가 +y 다.
    expect(moved.y).toBeLessThan(one.y)
  })

  it('부스러기는 중력을 받아 떨어진다', () => {
    // 처음에는 위로 튀지만 중력이 이겨 결국 내려온다.
    let bits = [spawn('crumb', 10, 20, fixed(0.5))]
    for (let i = 0; i < 4; i += 1) bits = step(bits, 0.05)

    expect(bits[0].vy).toBeGreaterThan(spawn('crumb', 10, 20, fixed(0.5)).vy)
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const before = [spawn('bubble', 10, 20, fixed(0))]
    const snapshot = { ...before[0] }
    step(before, 0.1)

    expect(before[0]).toEqual(snapshot)
  })

  it('넘치면 오래된 것부터 버린다', () => {
    // 새로 뿜은 것이 사라지면 손끝에 반응이 없는 것처럼 느껴진다.
    const many = Array.from({ length: MAX_PARTICLES + 5 }, (_, i) =>
      spawn('bubble', i, 0, fixed(0)),
    )
    const kept = trim(many)

    expect(kept).toHaveLength(MAX_PARTICLES)
    expect(kept[kept.length - 1].x).toBe(MAX_PARTICLES + 4)
    expect(kept[0].x).toBe(5)
  })

  it('상한 아래면 그대로 둔다', () => {
    const few = [spawn('heart', 0, 0, fixed(0))]
    expect(trim(few)).toHaveLength(1)
  })
})
