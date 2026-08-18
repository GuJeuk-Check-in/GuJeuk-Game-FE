import type { ReactNode } from 'react'

export interface GameShellProps {
  /** 상단 고정 영역. 점수·나가기 버튼 등. */
  header?: ReactNode
  /** 하단 고정 영역. 조작 버튼 등. */
  footer?: ReactNode
  /** 가운데 가변 영역. 캔버스나 React 게임 보드가 들어간다. */
  children: ReactNode
}

/**
 * 모든 게임이 공유하는 화면 골격.
 *
 * 모바일에서 100vh는 주소창 높이를 포함해 계산되어 하단이 잘린다. 100dvh를
 * 쓰고 safe-area-inset을 패딩으로 반영해야 노치·홈 인디케이터 기기에서
 * 헤더와 버튼이 가려지지 않는다. 이걸 게임마다 따로 처리하면 반드시 한
 * 게임만 틀어지므로 셸에서 한 번만 해결한다.
 */
export function GameShell({ header, footer, children }: GameShellProps) {
  return (
    <div className="gj-shell">
      {header ? <div className="gj-shell__header">{header}</div> : null}
      <div className="gj-shell__body">{children}</div>
      {footer ? <div className="gj-shell__footer">{footer}</div> : null}
    </div>
  )
}
