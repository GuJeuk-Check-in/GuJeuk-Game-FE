import type { ReactNode } from 'react'

export interface ResultOverlayProps {
  open: boolean
  title: string
  description?: ReactNode
  /** 주 버튼. 보통 "다시 하기". */
  primaryLabel: string
  onPrimary: () => void
  /** 보조 버튼. 보통 "그만두기". 없으면 표시하지 않는다. */
  secondaryLabel?: string
  onSecondary?: () => void
}

/** 한 판이 끝났을 때 뜨는 결과 오버레이. 게임 종류와 무관하게 재사용한다. */
export function ResultOverlay({
  open,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: ResultOverlayProps) {
  if (!open) return null

  return (
    <div className="gj-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="gj-overlay__sheet">
        <div className="gj-overlay__title">{title}</div>
        {description ? <div className="gj-overlay__desc">{description}</div> : null}
        <div className="gj-overlay__actions">
          <button type="button" className="gj-btn gj-btn--primary" onClick={onPrimary}>
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
