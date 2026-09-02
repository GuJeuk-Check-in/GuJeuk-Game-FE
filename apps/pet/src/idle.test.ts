import { describe, expect, it } from 'vitest'

import { IDLE_LIMIT_MS, IDLE_WARN_MS, idleTick } from './idle'

// 시각은 언제나 상수로 주입한다. 이 저장소의 테스트는 타이머를 조작하지 않는다
// (stats.test.ts 와 같은 방식).
const T0 = new Date(2026, 0, 15, 9, 0, 0, 0).getTime()

const SECOND = 1_000

describe('idleTick', () => {
  it('막 움직였으면 아무 일도 없다', () => {
    expect(idleTick(T0, T0)).toEqual({ state: { kind: 'active' }, since: T0 })
  })

  it('경고 구간 전까지는 조용하다', () => {
    const justBefore = T0 + (IDLE_LIMIT_MS - IDLE_WARN_MS) - 1
    expect(idleTick(T0, justBefore).state).toEqual({ kind: 'active' })
  })

  /**
   * 경고는 마지막 30초에만 뜬다. 더 일찍 뜨면 잠깐 화면을 읽는 사람마다 카드가
   * 튀어나오고, 그러면 사람들이 그 카드를 읽지 않게 된다.
   */
  it('마지막 30초에 경고가 뜨고 남은 초를 알려준다', () => {
    const enters = T0 + (IDLE_LIMIT_MS - IDLE_WARN_MS)
    expect(idleTick(T0, enters).state).toEqual({ kind: 'warning', secondsLeft: 30 })

    const half = T0 + IDLE_LIMIT_MS - 15 * SECOND
    expect(idleTick(T0, half).state).toEqual({ kind: 'warning', secondsLeft: 15 })
  })

  /**
   * 올림이라 마지막 1초가 "0초"로 뜨지 않는다. 0 이 보이면 이미 끝난 것처럼
   * 읽혀서, 사람은 눌러도 소용없다고 생각하고 손을 뗀다.
   */
  it('남은 초는 올림이라 0 이 보이지 않는다', () => {
    const almost = T0 + IDLE_LIMIT_MS - 1
    expect(idleTick(T0, almost).state).toEqual({ kind: 'warning', secondsLeft: 1 })

    const notRound = T0 + IDLE_LIMIT_MS - 29_200
    expect(idleTick(T0, notRound).state).toEqual({ kind: 'warning', secondsLeft: 30 })
  })

  it('5분이 지나면 만료다', () => {
    expect(idleTick(T0, T0 + IDLE_LIMIT_MS).state).toEqual({ kind: 'expired' })
    expect(idleTick(T0, T0 + IDLE_LIMIT_MS + 60 * SECOND).state).toEqual({ kind: 'expired' })
  })

  /**
   * 탭을 백그라운드에 오래 두었다 돌아온 경우가 이 줄에 걸린다. **그 시간도
   * 유휴로 센다** — 5분 넘게 다른 탭에 가 있었다면 그 앞에 앉은 사람이 같은
   * 사람이라는 보장이 없다. 공용 기기에서는 이쪽이 안전한 방향이다.
   */
  it('오래 자리를 비웠다 돌아와도 바로 만료다', () => {
    expect(idleTick(T0, T0 + 6 * 60 * 60 * 1000).state).toEqual({ kind: 'expired' })
  })

  /**
   * **stats.ts 와 반대다.** 거기서는 음수 경과를 0 으로 잘랐지만 여기서 그러면
   * 타이머가 영영 만료되지 않는다 — 시계가 한 시간 뒤로 밀린 기기에서 아무도
   * 쫓겨나지 않게 된다.
   */
  it('시계가 되감기면 기준을 지금으로 당긴다', () => {
    const back = T0 - 60 * 60 * 1000
    expect(idleTick(T0, back)).toEqual({ state: { kind: 'active' }, since: back })

    // 당겨 놓은 기준에서 다시 5분을 세면 정상적으로 만료된다.
    expect(idleTick(back, back + IDLE_LIMIT_MS).state).toEqual({ kind: 'expired' })
  })

  /**
   * `since` 를 그대로 돌려준다. 상태만 검사하면 **되감기 보정이 반대로 들어간
   * 회귀를 못 잡는다** — 부르는 쪽은 이 값을 다음 기준으로 그대로 들고 있으므로,
   * 여기서 매번 now 를 돌려주면 타이머가 영영 만료되지 않는다.
   */
  it('되감기가 아니면 기준을 건드리지 않는다', () => {
    for (const at of [0, 1, IDLE_LIMIT_MS - IDLE_WARN_MS, IDLE_LIMIT_MS - 1, IDLE_LIMIT_MS]) {
      expect(idleTick(T0, T0 + at).since).toBe(T0)
    }
  })

  it('경고 구간은 만료보다 짧다', () => {
    // 두 상수가 뒤집히면 경고가 영원히 뜨거나 아예 뜨지 않는다.
    expect(IDLE_WARN_MS).toBeLessThan(IDLE_LIMIT_MS)
  })
})
