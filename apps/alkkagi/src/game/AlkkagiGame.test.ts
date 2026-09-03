import { describe, expect, it } from 'vitest'

import { flickVelocity } from './AlkkagiGame'

describe('알까기 튕기기 규칙', () => {
  it('6px 미만의 움직임은 탭으로 보고 발사하지 않는다', () => {
    expect(flickVelocity(5.99, 0)).toBeNull()
  })

  it('최대 당김은 기존 최고 속도 24를 유지한다', () => {
    expect(flickVelocity(150, 0)).toEqual({ x: 24, y: 0 })
    expect(flickVelocity(300, 0)).toEqual({ x: 24, y: 0 })
  })

  it('방향을 보존하고 1.5 제곱 세기 곡선을 적용한다', () => {
    const velocity = flickVelocity(45, 60)
    expect(velocity).not.toBeNull()
    expect(velocity?.x).toBeCloseTo(5.091, 3)
    expect(velocity?.y).toBeCloseTo(6.788, 3)
  })
})
