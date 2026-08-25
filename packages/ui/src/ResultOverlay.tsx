import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export interface ResultOverlayProps {
  open: boolean
  title: string
  description?: ReactNode
  /**
   * 제목 위에 크게 띄울 아이콘. 이겼는지 졌는지를 글자보다 먼저 알려준다.
   *
   * 이모지를 쓰지 않는 이유는 Icon과 같다 — 기기마다 모양이 다르고 색을
   * 따라오지 않는다.
   */
  icon?: IconName
  /** 아이콘 색. 기본은 강조색. 패배처럼 강조하고 싶지 않을 때 바꾼다. */
  tone?: 'accent' | 'muted'
  /** 주 버튼. 보통 "다시 하기". */
  primaryLabel: string
  onPrimary: () => void
  /** 보조 버튼. 보통 "그만두기". 없으면 표시하지 않는다. */
  secondaryLabel?: string
  onSecondary?: () => void
}

/**
 * 한 판이 끝났을 때 뜨는 결과 오버레이. 게임 종류와 무관하게 재사용한다.
 *
 * 열릴 때 주 버튼으로 초점을 옮긴다. 그러지 않으면 초점이 뒤에 가려진 화면에
 * 남아서, 키보드 사용자는 보이지 않는 요소를 누르게 된다.
 */
export function ResultOverlay({
  open,
  title,
  description,
  icon,
  tone = 'accent',
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: ResultOverlayProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) primaryRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="gj-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="gj-overlay__sheet">
        {icon && (
          <div className={`gj-overlay__icon ${tone === 'muted' ? 'is-muted' : ''}`}>
            <Icon name={icon} size={40} />
          </div>
        )}

        <div className="gj-overlay__title">{title}</div>
        {description ? <div className="gj-overlay__desc">{description}</div> : null}

        <div className="gj-overlay__actions">
          <button
            ref={primaryRef}
            type="button"
            className="gj-btn gj-btn--primary"
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button type="button" className="gj-btn" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
