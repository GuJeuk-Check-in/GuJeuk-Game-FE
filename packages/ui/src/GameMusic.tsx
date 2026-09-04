import { useEffect } from 'react'
import { gameAudio } from './gameAudio'
import type { MusicTheme } from './gameAudio'

export interface GameMusicProps {
  theme: MusicTheme
}

/** 첫 사용자 입력 뒤에만 게임별 절차 합성 BGM을 시작한다. */
export function GameMusic({ theme }: GameMusicProps) {
  useEffect(() => {
    gameAudio.setMusic(theme)
    const unlock = () => gameAudio.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      gameAudio.setMusic(null)
    }
  }, [theme])

  return null
}
