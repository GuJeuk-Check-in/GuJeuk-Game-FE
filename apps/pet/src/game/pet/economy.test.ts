import { describe, expect, it } from 'vitest'

import { FOOD_IDS } from './foods'
import { FOODS, petPixelSize, stageForLevel } from './economy'

describe('petPixelSize — 레벨마다 자란다 (이슈 #11 · 9)', () => {
  // 단계 크기는 sprites.ts 의 PET_METRICS 와 같아야 한다. 어긋나면 펫이
  // 바닥을 뚫거나 떠 있는다.
  it('단계가 시작되는 레벨에서는 그 단계의 원래 크기다', () => {
    expect(petPixelSize(1)).toBe(80)
    expect(petPixelSize(5)).toBe(104)
    expect(petPixelSize(10)).toBe(128)
  })

  it('같은 단계 안에서도 레벨이 오르면 커진다', () => {
    // 이것이 이번 변경의 핵심이다. 예전에는 Lv5~9 가 전부 104 로 같았다.
    for (const level of [1, 2, 3, 5, 6, 7, 8, 10, 11]) {
      expect(petPixelSize(level + 1)).toBeGreaterThan(petPixelSize(level))
    }
  })

  it('단계가 바뀌는 순간에 크기가 튀지 않는다', () => {
    // 다음 단계의 크기까지 이어 두었으므로 Lv4 는 Lv5 바로 아래여야 한다.
    expect(petPixelSize(5) - petPixelSize(4)).toBeLessThanOrEqual(8)
    expect(petPixelSize(10) - petPixelSize(9)).toBeLessThanOrEqual(8)
  })

  it('아무리 커도 상한에서 멈춘다', () => {
    expect(petPixelSize(100)).toBe(160)
    expect(petPixelSize(1000)).toBe(160)
  })

  it('정수만 돌려준다', () => {
    // 최근접 확대라 소수로 그리면 픽셀이 고르지 않게 늘어난다(§12.3).
    for (let level = 1; level <= 40; level += 1) {
      expect(Number.isInteger(petPixelSize(level))).toBe(true)
    }
  })

  it('단계 판정과 어긋나지 않는다', () => {
    expect(stageForLevel(4)).toBe('baby')
    expect(stageForLevel(5)).toBe('child')
    expect(stageForLevel(10)).toBe('adult')
  })
})

describe('FOODS — 카탈로그 (이슈 #11 · 4)', () => {
  it('11종이 모두 등록되어 있다', () => {
    // 도트는 11종이 그려져 있는데 표에는 3종만 있었다. 그림이 있는데 살 수
    // 없으면 주방과 상점에 머물 이유가 없다.
    expect(FOOD_IDS).toHaveLength(11)
  })

  it('싼 것부터 적혀 있다', () => {
    // FOOD_IDS 가 이 순서를 그대로 쓰고 가방·상점이 그대로 그린다.
    const prices = FOOD_IDS.map((id) => FOODS[id].price)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
  })

  it('기운을 주는 음식은 우유·치즈뿐이다', () => {
    // 에너지는 미니게임 판수를 막는 유일한 자원이라(§4) 아무 음식이나 주면
    // 그 제한이 사라진다.
    const withEnergy = FOOD_IDS.filter((id) => FOODS[id].energy > 0)
    expect(withEnergy).toEqual(['milk', 'cheese'])
  })

  it('값에 비해 터무니없이 좋은 음식은 없다', () => {
    // 하나가 압도적이면 나머지 10종은 목록만 채우게 된다.
    for (const id of FOOD_IDS) {
      const food = FOODS[id]
      const value = food.hunger + food.mood + food.energy
      expect(value / food.price).toBeLessThan(2)
    }
  })
})
