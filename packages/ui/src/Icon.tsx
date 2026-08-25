export type IconName =
  | 'target'
  | 'arrow'
  | 'star'
  | 'trophy'
  | 'wind'
  | 'plus'
  | 'logout'
  | 'users'
  | 'bot'
  | 'flag'
  | 'chevron-right'

export interface IconProps {
  name: IconName
  /** 픽셀 크기. 기본 18. */
  size?: number
  /**
   * 아이콘이 뜻을 담고 있을 때만 넣는다.
   *
   * 옆에 같은 뜻의 글자가 이미 있으면 넣지 않는다 — 스크린리더가 같은 말을
   * 두 번 읽는다. 라벨이 없으면 장식으로 보고 aria-hidden 처리한다.
   */
  label?: string
  className?: string
}

/**
 * 아이콘.
 *
 * ─── 이모지를 쓰지 않는 이유 ─────────────────────────────────────────────
 * 이모지는 기기·OS마다 모양과 크기가 제각각이라 정렬이 맞지 않고, 색을 바꿀 수
 * 없어 강조색을 따라가지 못한다. 스크린리더가 "활과 화살"처럼 길게 읽어버리는
 * 문제도 있다. SVG는 currentColor를 따르므로 글자색만 바꾸면 같이 바뀐다.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 선 두께 1.8은 작은 크기에서도 뭉개지지 않으면서 글자와 무게가 비슷하다.
 */
export function Icon({ name, size = 18, label, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

const PATHS: Record<IconName, JSX.Element> = {
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  arrow: (
    <>
      <path d="M3 21 21 3" />
      <path d="M15 3h6v6" />
      <path d="M3 21h4M3 21v-4" />
    </>
  ),
  star: <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8L12 3Z" />,
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5A2.5 2.5 0 0 0 7 10.5" />
      <path d="M17 6h2.5A2.5 2.5 0 0 1 17 10.5" />
      <path d="M12 14v4" />
      <path d="M8.5 21h7" />
      <path d="M10 18h4l.5 3h-5l.5-3Z" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8h10a3 3 0 1 0-3-3" />
      <path d="M3 13h14a3 3 0 1 1-3 3" />
      <path d="M3 18h7" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17 5 12l5-5" />
      <path d="M5 12h11" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16.5 5.3a3.2 3.2 0 0 1 0 5.4" />
      <path d="M18 14.4A6 6 0 0 1 21 20" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 5V8" />
      <circle cx="12" cy="4" r="1.4" fill="currentColor" stroke="none" />
      <path d="M9 13v1.5M15 13v1.5" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 5h11l-2 3.5L16 12H5" />
    </>
  ),
  'chevron-right': <path d="m9 6 6 6-6 6" />,
}
