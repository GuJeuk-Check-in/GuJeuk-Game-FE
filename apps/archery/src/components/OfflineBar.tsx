interface Props {
  onRetry: () => void
  /** 여기서 빠져나갈 곳이 있을 때만 준다. 로비에서는 나갈 데가 없다. */
  onExit?: () => void
  /** 캔버스 위에 띄울 때. 로비처럼 흐름 안에 놓을 때는 끈다. */
  float?: boolean
}

/**
 * 연결이 끊겼을 때 돌아올 길.
 *
 * 전에는 토스트 한 줄만 뜨고 끝이었다. 재연결·기권·나가기가 전부 소켓을
 * 거치는데 그 소켓이 죽어 있으니, 보낸 요청은 큐에 조용히 쌓이기만 하고
 * 새로고침 말고는 빠져나올 방법이 없었다.
 */
export function OfflineBar({ onRetry, onExit, float = false }: Props) {
  return (
    <div className={`ar-offline ${float ? 'ar-offline--float' : ''}`} role="alert">
      <span className="ar-offline__text">서버와 연결이 끊겼습니다</span>
      <button className="gj-btn gj-btn--primary ar-btn--sm" onClick={onRetry}>
        다시 연결
      </button>
      {onExit && (
        <button className="gj-btn ar-btn--sm" onClick={onExit}>
          로비로
        </button>
      )}
    </div>
  )
}
