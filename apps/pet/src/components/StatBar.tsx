import { STAT_MAX, STAT_MIN } from '../game/pet/economy'
import type { StatName } from '../game/types'

export interface StatBarProps {
  /** 화면에 보이는 짧은 이름. 모바일 폭에서 두 글자를 넘기지 않는다. */
  label: string
  /** 0~100 실수. */
  value: number
  /** 색만 고른다. 실제 색값은 App.css 가 팔레트 변수에서 가져온다. */
  tone: StatName
}

/**
 * 스탯 한 줄.
 *
 * 숫자는 반올림해 보여주지만 막대 길이는 반올림 전 값으로 잡는다. 표시 숫자와
 * 막대가 미세하게 어긋나는 것보다, 막대가 실제 값을 따라가는 편이 낫다 —
 * 게이지를 보는 이유는 정확한 수치가 아니라 남은 양이기 때문이다.
 */
export function StatBar({ label, value, tone }: StatBarProps) {
  const shown = Math.round(value)
  const span = STAT_MAX - STAT_MIN
  const ratio = Math.min(1, Math.max(0, (value - STAT_MIN) / span))

  return (
    <div className="pt-stat">
      <span className="pt-stat__label">{label}</span>
      <div
        className="pt-stat__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={STAT_MIN}
        aria-valuemax={STAT_MAX}
        aria-valuenow={shown}
      >
        <div
          className={`pt-stat__fill pt-stat__fill--${tone}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="pt-stat__value">{shown}</span>
    </div>
  )
}
