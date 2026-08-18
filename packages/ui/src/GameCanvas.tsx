import { useEffect, useRef } from 'react'
import { CanvasStage } from '@gujuck/game-core'
import type { StageSize } from '@gujuck/game-core'

export interface GameCanvasProps {
  /**
   * 스테이지가 준비되면 한 번 호출된다. 여기서 게임을 초기화하고,
   * 정리 함수를 돌려주면 언마운트 때 실행된다.
   */
  onMount: (stage: CanvasStage) => (() => void) | void
  onResize?: (size: StageSize) => void
  className?: string
}

/**
 * React 셸과 캔버스 게임 사이의 유일한 접점.
 *
 * 예전 레포는 React가 정적 JSX만 뿌리고 게임 코드가 getElementById로 그 DOM을
 * 직접 조작했다. 그 구조에서 실제로 터졌던 버그가 있다: 개발 모드의 StrictMode는
 * effect를 마운트 → 언마운트 → 재마운트 시키는데, DOM 노드는 살아 있으니
 * 첫 실행이 붙인 리스너가 그대로 남아 두 번 등록되고, 죽은 클로저가 먼저
 * 응답해서 사용자가 고른 값이 무시됐다.
 *
 * 그래서 여기서는 캔버스를 React가 소유하지 않고 CanvasStage가 만들어 붙이며,
 * 정리 책임을 한 곳에 모은다. 게임 쪽은 onMount가 돌려준 함수만 제대로 채우면
 * 되고, 그 안에서 만든 루프·리스너는 반드시 거기서 정리해야 한다.
 */
export function GameCanvas({ onMount, onResize, className }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  // onMount/onResize를 의존성 배열에 넣으면 인라인 화살표 함수 때문에 매
  // 렌더마다 게임이 재시작된다. 최신 참조만 ref로 들고 효과는 한 번만 돈다.
  const onMountRef = useRef(onMount)
  const onResizeRef = useRef(onResize)
  onMountRef.current = onMount
  onResizeRef.current = onResize

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const stage = new CanvasStage({
      host,
      onResize: (size) => onResizeRef.current?.(size),
    })

    const cleanupGame = onMountRef.current(stage)

    return () => {
      cleanupGame?.()
      stage.destroy()
    }
  }, [])

  return <div ref={hostRef} className={className} style={{ width: '100%', height: '100%' }} />
}
