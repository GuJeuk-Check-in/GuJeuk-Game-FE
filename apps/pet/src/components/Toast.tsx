import { useEffect } from 'react'

/**
 * 떠 있는 시간.
 *
 * 한 줄을 읽고 눈을 떼기에 충분하면서, 다음 행동을 누르기 전에 사라질 만큼
 * 짧게 잡았다. 액션은 연타되는 조작이라 이보다 길면 문구가 계속 밀려 쌓인다.
 */
const TOAST_MS = 2600

export interface ToastProps {
  message: string
  /** 레벨업처럼 한 줄 더 알릴 것. 없으면 null. */
  detail?: string | null
  /** 시간이 다 되면 부른다. 부르는 쪽이 상태를 비운다. */
  onDone: () => void
}

/**
 * 화면 아래에 한 줄 띄우는 알림.
 *
 * 같은 문구가 연달아 떠도 타이머가 새로 돌아야 하므로, **부르는 쪽이 key 로
 * 다시 마운트시킨다.** 그래야 이 컴포넌트가 "몇 번째 알림인지"를 몰라도 된다.
 */
export function Toast({ message, detail, onDone }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [onDone])

  return (
    <div className="pt-toast" role="status">
      <p className="pt-toast__message">{message}</p>
      {detail ? <p className="pt-toast__detail">{detail}</p> : null}
    </div>
  )
}
