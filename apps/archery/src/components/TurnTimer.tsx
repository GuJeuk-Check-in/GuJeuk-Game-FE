import { useEffect, useState } from 'react'

const SIZE = 34
const R = 14
const CIRCUMFERENCE = 2 * Math.PI * R

interface Props {
  /** 이 차례가 시작한 시각(ms). */
  startedAt: number
  /** 서버가 알려준 차례 제한 시간(초). */
  limitSec: number
  /** 내 차례인지. 상대 차례면 흐리게 둔다. */
  mine: boolean
  /** 대결이 끝났으면 멈춘다. */
  running: boolean
}

/**
 * 차례 제한 시간.
 *
 * 서버는 45초를 넘기면 0점으로 적고 넘긴다. 그 규칙이 화면에 보이지 않으면
 * 갑자기 발이 사라진 것처럼 느껴진다. 턴제 온라인 게임이 아바타 둘레에 링을
 * 돌리는 이유다 — 누구 차례인지와 얼마나 남았는지가 한 번에 읽힌다.
 */
export function TurnTimer({ startedAt, limitSec, mine, running }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [running, startedAt])

  const leftSec = Math.max(0, limitSec - (now - startedAt) / 1000)
  const ratio = limitSec > 0 ? leftSec / limitSec : 0
  const urgent = leftSec <= 10

  return (
    <span
      className={`ar-timer ${mine ? 'is-mine' : ''} ${urgent && mine ? 'is-urgent' : ''}`}
      role="timer"
      aria-label={`${mine ? '내 차례' : '상대 차례'} ${Math.ceil(leftSec)}초 남음`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} className="ar-timer__track" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          className="ar-timer__fill"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          /* 12시 방향에서 시작해 시계 방향으로 줄어든다. */
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="ar-timer__num">{Math.ceil(leftSec)}</span>
    </span>
  )
}
