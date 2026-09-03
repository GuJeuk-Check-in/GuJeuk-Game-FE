export type GameSound =
  | 'tap'
  | 'place'
  | 'vanish'
  | 'win'
  | 'lose'
  | 'collision'
  | 'fall'
  | 'draw'
  | 'hit'
  | 'bullseye'
  | 'countdown'
  | 'ttt-place'
  | 'ttt-vanish'
  | 'ttt-win'
  | 'ttt-lose'
  | 'alk-launch'
  | 'alk-skill'
  | 'alk-collision'
  | 'alk-fall'
  | 'alk-win'
  | 'alk-lose'

export type MusicTheme = 'strategy' | 'arcade' | 'sport'

export interface Tone {
  readonly from: number
  readonly to: number
  readonly duration: number
  readonly gain: number
  readonly wave: OscillatorType
  readonly delay?: number
}

export interface MusicArrangement {
  readonly tempoMs: number
  readonly lead: readonly number[]
  readonly bass: readonly number[]
  readonly sparkle: readonly number[]
  readonly leadGain: number
  readonly strongLeadGain: number
  readonly bassGain: number
  readonly sparkleGain: number
  readonly kickEvery: number
}

type ToneSeed = readonly [
  from: number,
  to: number,
  duration: number,
  gain: number,
  wave: OscillatorType,
  delay?: number,
]

const tone = ([from, to, duration, gain, wave, delay]: ToneSeed): Tone => ({
  from,
  to,
  duration,
  gain,
  wave,
  ...(delay === undefined ? {} : { delay }),
})

export const SOUND_SCORE: Record<GameSound, readonly Tone[]> = {
  tap: [tone([420, 520, 0.045, 0.09, 'triangle'])],
  place: [tone([260, 420, 0.08, 0.11, 'triangle']), tone([520, 620, 0.05, 0.07, 'sine', 0.035])],
  vanish: [tone([520, 180, 0.16, 0.08, 'sine'])],
  win: [tone([523, 523, 0.1, 0.1, 'triangle']), tone([659, 659, 0.1, 0.1, 'triangle', 0.1]), tone([784, 988, 0.2, 0.11, 'triangle', 0.2])],
  lose: [tone([330, 150, 0.28, 0.08, 'triangle'])],
  collision: [tone([150, 70, 0.08, 0.12, 'square'])],
  fall: [tone([320, 75, 0.28, 0.1, 'sine'])],
  draw: [tone([240, 760, 0.16, 0.08, 'triangle'])],
  hit: [tone([170, 90, 0.08, 0.11, 'square']), tone([620, 720, 0.09, 0.08, 'triangle', 0.04])],
  bullseye: [tone([784, 784, 0.08, 0.1, 'triangle']), tone([988, 1175, 0.18, 0.11, 'triangle', 0.07])],
  countdown: [tone([560, 480, 0.065, 0.08, 'square'])],
  'ttt-place': [tone([190, 430, 0.1, 0.13, 'triangle']), tone([430, 690, 0.12, 0.08, 'sine', 0.025]), tone([990, 1180, 0.08, 0.055, 'sine', 0.07])],
  'ttt-vanish': [tone([720, 360, 0.12, 0.085, 'sine']), tone([510, 170, 0.22, 0.1, 'triangle', 0.05]), tone([150, 90, 0.13, 0.07, 'square', 0.14])],
  'ttt-win': [tone([523, 523, 0.13, 0.1, 'triangle']), tone([659, 659, 0.13, 0.1, 'triangle', 0.09]), tone([784, 784, 0.16, 0.11, 'triangle', 0.18]), tone([1047, 1319, 0.3, 0.1, 'sine', 0.3]), tone([392, 523, 0.35, 0.08, 'triangle', 0.31])],
  'ttt-lose': [tone([392, 294, 0.18, 0.085, 'triangle']), tone([294, 196, 0.24, 0.09, 'triangle', 0.14]), tone([164, 98, 0.3, 0.07, 'sine', 0.32])],
  'alk-launch': [tone([130, 660, 0.18, 0.12, 'sawtooth']), tone([220, 880, 0.2, 0.07, 'triangle', 0.035]), tone([980, 1220, 0.08, 0.05, 'sine', 0.15])],
  'alk-skill': [tone([260, 520, 0.13, 0.09, 'triangle']), tone([390, 780, 0.16, 0.085, 'triangle', 0.08]), tone([780, 1240, 0.2, 0.065, 'sine', 0.17])],
  'alk-collision': [tone([170, 58, 0.11, 0.14, 'square']), tone([720, 410, 0.08, 0.065, 'triangle', 0.025]), tone([1050, 820, 0.06, 0.045, 'sine', 0.06])],
  'alk-fall': [tone([620, 110, 0.36, 0.11, 'sine']), tone([180, 62, 0.2, 0.13, 'square', 0.23]), tone([880, 440, 0.12, 0.055, 'triangle', 0.29])],
  'alk-win': [tone([392, 523, 0.14, 0.1, 'triangle']), tone([523, 659, 0.14, 0.1, 'triangle', 0.1]), tone([659, 784, 0.16, 0.11, 'triangle', 0.2]), tone([784, 1175, 0.34, 0.1, 'sine', 0.31]), tone([196, 392, 0.38, 0.08, 'sawtooth', 0.3])],
  'alk-lose': [tone([330, 220, 0.18, 0.09, 'triangle']), tone([220, 147, 0.24, 0.1, 'triangle', 0.15]), tone([110, 55, 0.34, 0.09, 'square', 0.34])],
}

export const MUSIC: Record<MusicTheme, MusicArrangement> = {
  strategy: {
    tempoMs: 245,
    lead: [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46, 523.25, 659.25, 987.77, 783.99],
    bass: [130.81, 0, 196, 0, 146.83, 0, 220, 0],
    sparkle: [0, 0, 1046.5, 0, 0, 1174.66, 0, 1318.51],
    leadGain: 0.026,
    strongLeadGain: 0.038,
    bassGain: 0.027,
    sparkleGain: 0.018,
    kickEvery: 0,
  },
  arcade: {
    tempoMs: 178,
    lead: [440, 554.37, 659.25, 880, 659.25, 554.37, 493.88, 659.25, 440, 554.37, 739.99, 987.77, 739.99, 659.25, 554.37, 493.88],
    bass: [110, 0, 138.59, 0, 164.81, 0, 123.47, 0],
    sparkle: [0, 880, 0, 0, 0, 1108.73, 0, 1318.51],
    leadGain: 0.025,
    strongLeadGain: 0.038,
    bassGain: 0.034,
    sparkleGain: 0.018,
    kickEvery: 4,
  },
  sport: {
    tempoMs: 390,
    lead: [293.66, 392, 440, 523.25, 440, 392, 329.63, 392],
    bass: [],
    sparkle: [],
    leadGain: 0.018,
    strongLeadGain: 0.026,
    bassGain: 0,
    sparkleGain: 0,
    kickEvery: 0,
  },
}
