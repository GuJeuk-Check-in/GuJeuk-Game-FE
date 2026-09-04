import { useCallback, useEffect, useRef, useState } from 'react'
import { IDLE_ACTIVE, idleTick } from './idle'
import type { IdleState } from './idle'
import { touchSession } from './session'

/**
 * 유휴 판정을 화면에 잇는다. 규칙 자체는 idle.ts 에 있다.
 *
 * **로그인한 뒤에만 켠다.** 로그인 화면에서 돌면 아직 아무도 아닌 사람을 상대로
 * 타이머가 헛돈다.
 */

/**
 * "조작"으로 칠 이벤트.
 *
 * 하나라도 빠지면 **놀고 있는 사람이 쫓겨난다.** 그래서 넉넉히 듣는다 — 이벤트를
 * 하나 더 다는 비용은 0 이고, 빠뜨렸을 때의 대가는 진행 중인 판이 끊기는 것이다.
 * 각각이 왜 필요한지:
 *
 * - `pointerdown` 이 대부분을 덮는다. 탭·클릭·캔버스 조작이 전부 여기로 온다.
 * - `pointermove` 는 **한 번 누르고 계속 끄는 조작** 때문이다. 가구 배치와
 *   간식받기는 pointerdown 한 번 뒤로 몇십 초를 move 로만 보낸다.
 * - `wheel` 은 데스크톱에서 상점 목록만 훑어보는 사람 때문이다. 그 사람은
 *   pointerdown 을 하나도 내지 않는다.
 * - `touchstart` 는 Pointer Events 가 없는 구형 엔진 때문이다. 이 앱은 그런
 *   환경까지 번들을 만든다(vite-config 의 legacy 플러그인). 거기서는 방 넘기기
 *   스와이프가 touch 이벤트로만 온다.
 * - `keydown` 은 키보드 조작과 폴짝 달리기의 스페이스바.
 * - `click` 은 보조기술의 '활성화'다. 포인터 없이 click 만 오는 경로가 있다.
 * - `input` 은 붙여넣기·IME·받아쓰기다. 이름 짓는 화면은 로그인 이후 화면이라
 *   거기서 시간을 보내는 일이 실제로 있다.
 */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'wheel',
  'touchstart',
  'keydown',
  'click',
  'input',
] as const

/**
 * 유휴를 다시 재는 주기(ms).
 *
 * 경고가 초 단위로 줄어들어야 해서 1초다. 백그라운드 탭에서는 브라우저가 이
 * 주기를 1분까지 늘리지만 상관없다 — 남은 시간은 벽시계로 계산하므로 늦게
 * 깨어나도 그 자리에서 만료로 판정된다.
 */
const TICK_MS = 1_000

export interface UseIdleLogoutOptions {
  /**
   * 5분이 지났을 때 부를 것. **한 번만 불린다.**
   *
   * 끄는 스위치를 두지 않는다. 한때 나가기 시트가 떠 있는 동안 껐었는데, 그
   * 시트를 내리는 길이 사람이 "더 놀래요"를 누르는 것 하나뿐이라 **나가기를
   * 눌러 놓고 자리를 뜨면 타이머가 영영 꺼진 채로 남았다** — 이 기능이 막으려던
   * 바로 그 상황이다. 켜고 끄는 조건은 언젠가 반드시 한쪽을 빠뜨리고, 그 사실은
   * "5분 뒤에 아무 일도 일어나지 않는다"로만 드러나서 알아채기 어렵다.
   */
  onExpire: () => void
}

export interface UseIdleLogoutResult {
  state: IdleState
  /** 사용자가 "계속 놀기"를 눌렀다. 처음부터 다시 센다. */
  keepAwake: () => void
}

export function useIdleLogout({ onExpire }: UseIdleLogoutOptions): UseIdleLogoutResult {
  const [state, setState] = useState<IdleState>(IDLE_ACTIVE)

  const sinceRef = useRef(Date.now())

  /**
   * 만료를 이미 알렸는가.
   *
   * 만료 상태는 다음 tick 에도 그대로 만료다. 이 표식이 없으면 나가는 동안
   * 1초마다 로그아웃이 다시 걸린다 — 그중 하나만 성공해도 나머지는 이미 없는
   * 세션을 상대로 돈다.
   */
  const firedRef = useRef(false)

  // 리스너를 매 렌더 떼었다 붙이지 않으려고 최신 콜백만 ref 로 든다.
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  /**
   * 처음부터 다시 센다.
   *
   * **IDLE_ACTIVE 를 그대로 넣는다.** 매번 새 객체를 만들면 같은 'active' 인데도
   * 값이 달라 보여 React 가 렌더를 건너뛰지 못한다 — 이 함수는 pointermove 마다
   * 불리므로 마우스를 움직이는 내내 화면을 다시 그리게 된다.
   */
  const keepAwake = useCallback(() => {
    sinceRef.current = Date.now()
    firedRef.current = false
    setState(IDLE_ACTIVE)
  }, [])

  useEffect(() => {
    // 마운트 순간부터 다시 센다. 그러지 않으면 로그인 직후에 앞 화면에서 흐른
    // 시간이 이어져 들어오자마자 경고가 뜬다.
    keepAwake()

    // capture 로 잡는 것은 도중에 stopPropagation 하는 핸들러가 있어도 닿게 하려는
    // 것이다(오디오 잠금 해제와 같은 이유). passive 는 스크롤 성능 때문이다 —
    // 여기서 preventDefault 를 부를 일이 없다.
    const options: AddEventListenerOptions = { capture: true, passive: true }
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, keepAwake, options)

    const tick = () => {
      const now = Date.now()
      const result = idleTick(sinceRef.current, now)
      sinceRef.current = result.since
      setState(result.state)

      // 마지막 조작 시각을 브라우저에도 남긴다. **이 타이머는 탭이 열려 있을
      // 때만 도는데, 공용 기기에서 다 놀았다는 신호는 대개 창을 닫는 것이다.**
      // 남겨 두지 않으면 다음 사람이 같은 주소를 열었을 때 앞사람으로 로그인된
      // 화면을 그대로 받는다(session.ts 의 currentSession).
      if (result.state.kind === 'active') touchSession(now)

      if (result.state.kind === 'expired' && !firedRef.current) {
        firedRef.current = true
        onExpireRef.current()
      }
    }

    const timer = window.setInterval(tick, TICK_MS)

    return () => {
      window.clearInterval(timer)
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, keepAwake, options)
    }
  }, [keepAwake])

  return { state, keepAwake }
}
