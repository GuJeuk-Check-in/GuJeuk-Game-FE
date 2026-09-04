import type { Mark as MarkValue } from '../game/types'

interface Props {
  value: MarkValue
  compact?: boolean
}

/** 글꼴에 따라 모양이 달라지는 문자 대신 동일한 CSS 도형으로 X/O를 그린다. */
export function Mark({ value, compact = false }: Props) {
  return (
    <span
      className={`ttt-mark ttt-mark--${value.toLowerCase()}${compact ? ' is-compact' : ''}`}
      aria-hidden="true"
    >
      <span />
      {value === 'X' ? <span /> : null}
    </span>
  )
}
