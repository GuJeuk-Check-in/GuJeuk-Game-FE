import { useSyncExternalStore } from 'react'
import { gameAudio } from './gameAudio'

export interface MuteButtonProps {
  className?: string
}

export function MuteButton({ className = '' }: MuteButtonProps) {
  const muted = useSyncExternalStore(gameAudio.subscribe, gameAudio.isMuted, gameAudio.isMuted)
  const label = muted ? '소리 켜기' : '소리 끄기'

  return (
    <button
      type="button"
      className={`gj-btn gj-mute ${className}`.trim()}
      onClick={() => gameAudio.toggleMuted()}
      aria-label={label}
      aria-pressed={muted}
      title={label}
    >
      <span className="gj-mute__icon" aria-hidden="true">
        {muted ? '×' : '♪'}
      </span>
      <span className="gj-mute__label">{muted ? '무음' : '소리'}</span>
    </button>
  )
}
