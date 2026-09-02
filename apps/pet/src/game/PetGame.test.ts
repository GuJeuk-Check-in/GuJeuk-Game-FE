import { describe, expect, it } from 'vitest'

import { slideDirection } from './PetGame'
import { ROOMS } from './rooms'

// 전환 방향은 화면을 봐야만 확인되는 값처럼 보이지만, 사실 방 순서만 아는 순수
// 함수다. 여기서 못 박아 두면 방을 추가하거나 순서를 바꿨을 때 "◀ 를 눌렀는데
// 화면이 오른쪽으로 흐른다"를 눈으로 찾지 않아도 된다.
describe('slideDirection', () => {
  it('바로 오른쪽 방은 오른쪽에서 들어온다', () => {
    expect(slideDirection('living', 'kitchen')).toBe(1)
    expect(slideDirection('kitchen', 'bath')).toBe(1)
  })

  it('바로 왼쪽 방은 왼쪽에서 들어온다', () => {
    expect(slideDirection('kitchen', 'living')).toBe(-1)
    expect(slideDirection('living', 'shop')).toBe(-1)
  })

  it('순환의 짧은 쪽을 고른다', () => {
    // 거실(0) → 상점(5)은 오른쪽으로 5칸이 아니라 왼쪽으로 1칸이다.
    expect(slideDirection('shop', 'living')).toBe(1)
    // 욕실(2) → 거실(0)은 반대로 왼쪽 2칸이 오른쪽 4칸보다 짧다.
    expect(slideDirection('bath', 'living')).toBe(-1)
  })

  it('정확히 반 바퀴 떨어져 있으면 오른쪽으로 간다', () => {
    // 거실(0) ↔ 침실(3)은 양쪽 거리가 3칸으로 같다. 어느 쪽이든 틀리지 않으므로
    // 한쪽으로 정해 둔다 — 정하지 않으면 같은 버튼이 날마다 다른 방향으로 흐른다.
    expect(slideDirection('living', 'bed')).toBe(1)
    expect(slideDirection('bed', 'living')).toBe(1)
  })

  it('왕복은 언제나 반대 방향이다 — 거리가 같은 지점만 빼고', () => {
    const half = ROOMS.length / 2

    for (const from of ROOMS) {
      for (const to of ROOMS) {
        if (from.id === to.id) continue

        const gap = Math.abs(ROOMS.indexOf(from) - ROOMS.indexOf(to))
        // 정확히 반 바퀴 떨어진 짝(거실↔침실)은 양쪽 거리가 같아 왕복이 같은
        // 방향으로 계산된다. 그래서 되돌아가는 전환은 방향을 다시 재지 않고
        // 진행 중인 슬라이드를 뒤집는다(PetGame.setRoom).
        if (gap === half || ROOMS.length - gap === half) continue

        expect(slideDirection(to.id, from.id)).toBe(-slideDirection(from.id, to.id))
      }
    }
  })
})
