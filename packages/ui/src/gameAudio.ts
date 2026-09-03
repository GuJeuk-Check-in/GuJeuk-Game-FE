import { MUSIC, SOUND_SCORE } from './gameAudioScores'
import type { GameSound, MusicArrangement, MusicTheme, Tone } from './gameAudioScores'

export type { GameSound, MusicTheme } from './gameAudioScores'

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

const MUTE_KEY = 'gj.games.muted'
const listeners = new Set<() => void>()
let context: AudioContext | null = null
let muted = readMuted()
let musicTheme: MusicTheme | null = null
let musicTimer: number | null = null
let musicBeat = 0

function readMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function unlock(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (context === null) {
      const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext
      if (!AudioContextConstructor) return null
      context = new AudioContextConstructor()
    }
    if (context.state === 'suspended') void context.resume()
    ensureMusic()
    return context
  } catch {
    context = null
    return null
  }
}

function stopMusic(): void {
  if (musicTimer === null || typeof window === 'undefined') return
  window.clearInterval(musicTimer)
  musicTimer = null
}

function ensureMusic(): void {
  if (
    typeof window === 'undefined' ||
    muted ||
    musicTheme === null ||
    context === null ||
    context.state !== 'running' ||
    musicTimer !== null
  ) {
    return
  }

  const arrangement = MUSIC[musicTheme]
  const playBeat = () => {
    if (context === null || musicTheme === null || muted) return
    playMusicStep(context, arrangement, musicBeat)
    musicBeat += 1
  }

  playBeat()
  musicTimer = window.setInterval(playBeat, arrangement.tempoMs)
}

function playMusicStep(
  audioContext: AudioContext,
  arrangement: MusicArrangement,
  beat: number,
): void {
  const lead = arrangement.lead[beat % arrangement.lead.length]
  if (lead !== undefined) {
    ring(audioContext, {
      from: lead,
      to: lead,
      duration: arrangement.tempoMs > 300 ? 0.15 : 0.12,
      gain: beat % 4 === 0 ? arrangement.strongLeadGain : arrangement.leadGain,
      wave: 'triangle',
    })
  }

  if (arrangement.bass.length > 0) {
    const bass = arrangement.bass[beat % arrangement.bass.length]
    if (bass !== undefined && bass > 0) {
      ring(audioContext, {
        from: bass,
        to: bass,
        duration: 0.2,
        gain: arrangement.bassGain,
        wave: 'sine',
      })
    }
  }
  if (arrangement.sparkle.length > 0) {
    const sparkle = arrangement.sparkle[beat % arrangement.sparkle.length]
    if (sparkle !== undefined && sparkle > 0) {
      ring(audioContext, {
        from: sparkle,
        to: sparkle,
        duration: 0.09,
        gain: arrangement.sparkleGain,
        wave: 'sine',
      })
    }
  }
  if (arrangement.kickEvery > 0 && beat % arrangement.kickEvery === 0) {
    ring(audioContext, { from: 120, to: 48, duration: 0.1, gain: 0.04, wave: 'square' })
  }
}

function ring(audioContext: AudioContext, note: Tone): void {
  const startsAt = audioContext.currentTime + (note.delay ?? 0)
  const oscillator = audioContext.createOscillator()
  const amplifier = audioContext.createGain()

  oscillator.type = note.wave
  oscillator.frequency.setValueAtTime(note.from, startsAt)
  if (note.from !== note.to) {
    oscillator.frequency.exponentialRampToValueAtTime(note.to, startsAt + note.duration)
  }

  amplifier.gain.setValueAtTime(note.gain, startsAt)
  amplifier.gain.exponentialRampToValueAtTime(0.0001, startsAt + note.duration)
  oscillator.connect(amplifier)
  amplifier.connect(audioContext.destination)
  oscillator.start(startsAt)
  oscillator.stop(startsAt + note.duration + 0.01)
}

export const gameAudio = {
  isMuted(): boolean {
    return muted
  },

  setMuted(next: boolean): void {
    muted = next
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MUTE_KEY, next ? '1' : '0')
      } catch {
        // 저장할 수 없는 환경에서도 현재 세션의 설정은 유지한다.
      }
    }
    if (next) stopMusic()
    else {
      unlock()
      ensureMusic()
    }
    for (const listener of listeners) listener()
  },

  toggleMuted(): void {
    this.setMuted(!muted)
  },

  play(sound: GameSound): void {
    if (muted) return
    const audioContext = unlock()
    if (audioContext === null || audioContext.state !== 'running') return
    for (const note of SOUND_SCORE[sound]) ring(audioContext, note)
  },

  unlock(): void {
    unlock()
  },

  setMusic(theme: MusicTheme | null): void {
    if (musicTheme === theme) return
    stopMusic()
    musicTheme = theme
    musicBeat = 0
    ensureMusic()
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
