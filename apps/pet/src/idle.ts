// 자리를 뜬 사람을 내보내는 규칙. (PET_SERVER_API.md §12 의 4번)
//
// 기관에서 한 기기를 여러 사람이 번갈아 쓴다. 나가기를 잊고 자리를 뜨면 **다음
// 사람이 앞사람 계정으로 계속 논다** — 앞사람의 펫이 자라고, 그 진행이 앞사람의
// 세이브로 서버에 올라간다. 로그아웃 버튼 하나로는 막을 수 없는 종류의 사고라,
// 아무 조작이 없으면 스스로 나가게 한다.
//
// 판정만 여기서 하고 타이머도 이벤트도 다루지 않는다. 이 저장소의 관행이기도
// 하고(stats.ts · face.ts 가 같은 이유로 순수 함수다), 무엇보다 이 앱의 테스트는
// node 환경에서 돌아 document 가 없다 — 훅 안에 적으면 검증할 수단이 없다.

/**
 * 아무 조작이 없을 때 나가기까지. **5분.**
 *
 * 짧게 잡을수록 다음 사람이 남의 계정으로 놀 확률은 줄지만, 결과 카드를 보며
 * 고민하는 사람이 쫓겨날 확률은 늘어난다. 그 둘을 가르는 것이 아래 경고 구간이다.
 */
export const IDLE_LIMIT_MS = 5 * 60_000

/**
 * 나가기 전에 경고를 띄우는 시간. 마지막 30초다.
 *
 * 경고가 없으면 화면을 읽고 있던 사람이 아무 예고 없이 로그인 화면으로 튕긴다.
 * 이 게임에는 사용자가 누를 때까지 무한정 떠 있는 판이 여럿이라(결과 카드,
 * 튜토리얼, 충돌 카드) 그 상황이 드물지 않다. 30초는 화면을 보고 있던 사람이
 * 읽고 손을 뻗기에 충분하면서, 자리에 없는 사람을 붙잡아 두지는 않는 길이다.
 */
export const IDLE_WARN_MS = 30_000

/**
 * 지금 유휴 상태가 어디쯤인가.
 *
 * 'warning' 이 남은 초를 들고 있는 것은 화면이 그 숫자를 세는 계산을 다시 하지
 * 않게 하려는 것이다 — 두 곳에서 세면 표시와 실제 만료 시각이 어긋난다.
 */
export type IdleState =
  { kind: 'active' } | { kind: 'warning'; secondsLeft: number } | { kind: 'expired' }

export interface IdleTick {
  state: IdleState
  /**
   * 보정된 기준 시각. **부르는 쪽은 이 값을 그대로 다음 기준으로 들고 있는다.**
   *
   * 시계가 되감겼을 때 여기서 now 로 밀어 주기 때문에 있는 필드다. 그 보정을
   * 부르는 쪽에 맡기면 검증할 수 없는 자리에 규칙이 하나 더 생긴다.
   */
  since: number
}

/**
 * 이 세션은 이미 끝난 것으로 봐야 하는가.
 *
 * **탭이 닫혀 있던 시간도 똑같이 센다.** 유휴 타이머는 탭이 열려 있을 때만 도는데,
 * 공용 기기에서 "다 놀았다"의 가장 흔한 모습은 나가기가 아니라 **창을 닫는 것**이다.
 * 그때 신원이 브라우저에 남아 있으면 다음 사람이 같은 주소를 열었을 때 앞사람으로
 * 로그인된 화면을 받는다 — 이 게임에서 막으려는 바로 그 상황이다.
 *
 * 그래서 규칙을 하나로 둔다: **마지막 조작에서 5분이 지나면 세션은 없는 것이다.**
 * 탭이 열려 있었는지 닫혀 있었는지, 브라우저를 껐는지 기기를 재부팅했는지 묻지
 * 않는다. 묻기 시작하면 경로마다 답이 달라지고, 언젠가 한쪽을 빠뜨린다.
 *
 * 되감기는 idleTick 과 같은 이유로 "아직 아니다"로 본다 — 판단할 근거가 없을 때
 * 세션을 끊으면 멀쩡히 놀던 사람이 튕긴다. 최악이 5분 더이고, 그 5분은 유휴
 * 타이머가 다시 잡는다.
 */
export function isSessionStale(lastActiveAt: number, now: number): boolean {
  return now - lastActiveAt >= IDLE_LIMIT_MS
}

/**
 * 조작이 있었을 때의 상태. **하나만 만들어 돌려쓴다.**
 *
 * 부르는 쪽이 이것을 React 상태에 그대로 넣기 때문이다 — 매번 새 객체를 만들면
 * 같은 'active' 인데도 값이 달라 보여서 React 가 렌더를 건너뛰지 못한다. 마우스를
 * 움직이는 동안 초당 수십 번 다시 그리게 된다.
 */
export const IDLE_ACTIVE: IdleState = { kind: 'active' }

const EXPIRED: IdleState = { kind: 'expired' }

/**
 * 마지막 조작 이후 얼마나 지났는지 보고 상태를 정한다.
 *
 * **시계 되감기를 stats.ts 와 반대로 다룬다.** 거기서는 음수 경과를 0 으로
 * 잘랐지만(§5) 여기서 그렇게 하면 **타이머가 영영 만료되지 않는다** — 시계가
 * 한 시간 뒤로 밀린 기기에서는 한 시간 동안 아무도 쫓겨나지 않는다. 그래서
 * 방금 움직인 것으로 보고 기준을 지금으로 당긴다. 최악이 "5분 더"라 안전하다.
 */
export function idleTick(since: number, now: number): IdleTick {
  if (now < since) return { state: IDLE_ACTIVE, since: now }

  const elapsed = now - since
  if (elapsed >= IDLE_LIMIT_MS) return { state: EXPIRED, since }

  const remaining = IDLE_LIMIT_MS - elapsed
  if (remaining > IDLE_WARN_MS) return { state: IDLE_ACTIVE, since }

  // 올림이라 29.2초는 30초로 보인다. 내림으로 하면 마지막 1초가 "0초"로 떠서
  // 이미 끝난 것처럼 읽힌다.
  return { state: { kind: 'warning', secondsLeft: Math.ceil(remaining / 1000) }, since }
}
