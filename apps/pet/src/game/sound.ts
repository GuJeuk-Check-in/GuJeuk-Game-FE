// 짧은 효과음을 직접 합성한다.
//
// **오디오 파일을 쓰지 않는다.** 필요한 소리가 전부 0.1초짜리 삑 소리라 파일을
// 받아 오면 번들만 무거워지고, 도트 게임의 질감과도 맞지 않는다. 오실레이터
// 두 개와 감쇠 하나면 칩튠 소리가 나온다.
//
// **첫 탭 전에는 소리를 낼 수 없다.** 모바일 브라우저는 사용자 제스처 없이
// 시작된 AudioContext 를 정지 상태로 만든다(자동재생 정책). 그래서 컨텍스트를
// 미리 만들지 않고 unlock() 이 불릴 때 만든다 — 화면이 그 호출을 첫 탭에 건다.
// 이 제약 때문에 명세 §14 는 사운드를 M3 이후로 미뤄 두었다.

// 사파리는 오랫동안 접두사 붙은 이름만 제공했다. lib.dom 에는 없는 이름이라
// 여기서 한 번 선언한다 — any 로 우회하면 lint 가 막고, 막지 않더라도 그
// 우회가 다른 곳으로 번진다.
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

/** 소리 하나의 모양. 주파수는 Hz, 길이는 초. */
export interface Blip {
  /** 시작 주파수. */
  from: number
  /** 끝 주파수. 올라가면 긍정, 내려가면 부정으로 들린다. */
  to: number
  seconds: number
  type: OscillatorType
  /** 0~1. 서로 다른 소리의 크기를 맞추는 값이다. */
  gain: number
}

export type SoundName =
  'tap' | 'feed' | 'wash' | 'coin' | 'levelUp' | 'refuse' | 'jump' | 'hit' | 'catch' | 'leaving'

/**
 * 소리표.
 *
 * 올라가는 음은 "됐다", 내려가는 음은 "안 된다"로 들린다. 이 규칙을 깨면 성공
 * 소리가 실패처럼 들려서, 글자를 읽기 전에 손이 먼저 멈춘다.
 */
export const BLIPS: Record<SoundName, readonly Blip[]> = {
  tap: [{ from: 440, to: 520, seconds: 0.05, type: 'square', gain: 0.18 }],
  feed: [
    { from: 520, to: 660, seconds: 0.07, type: 'square', gain: 0.2 },
    { from: 660, to: 780, seconds: 0.07, type: 'square', gain: 0.16 },
  ],
  wash: [{ from: 900, to: 1400, seconds: 0.16, type: 'triangle', gain: 0.16 }],
  catch: [{ from: 700, to: 900, seconds: 0.05, type: 'square', gain: 0.16 }],
  coin: [
    { from: 880, to: 880, seconds: 0.05, type: 'square', gain: 0.18 },
    { from: 1320, to: 1320, seconds: 0.1, type: 'square', gain: 0.16 },
  ],
  levelUp: [
    { from: 523, to: 523, seconds: 0.09, type: 'square', gain: 0.2 },
    { from: 659, to: 659, seconds: 0.09, type: 'square', gain: 0.2 },
    { from: 784, to: 988, seconds: 0.18, type: 'square', gain: 0.2 },
  ],
  // 거절과 피격은 내려가는 음이다. 같은 소리를 쓰지 않는 것은 거절이 실수이고
  // 피격은 게임 안의 사건이라, 두 개가 같으면 어느 쪽인지 모른다.
  refuse: [{ from: 320, to: 200, seconds: 0.12, type: 'square', gain: 0.16 }],
  hit: [{ from: 260, to: 90, seconds: 0.22, type: 'sawtooth', gain: 0.2 }],
  jump: [{ from: 300, to: 620, seconds: 0.09, type: 'square', gain: 0.16 }],
  /**
   * 곧 자동으로 나간다는 알림. 자리를 뜬 사람을 불러 세우는 소리다.
   *
   * refuse 를 돌려쓰지 않는다 — 그 소리는 "방금 누른 것이 안 됐다"는 뜻이라,
   * 아무것도 누르지 않았는데 그 소리가 나면 사람은 자기 실수를 찾는다. 위 주석의
   * 규칙이 그대로 적용되는 자리다.
   *
   * 두 음을 천천히 내려 긋는다. 짧은 삑 소리는 다른 효과음에 묻히는데, 이 소리는
   * **화면을 보고 있지 않은 사람**에게 닿아야 한다. 다른 어떤 소리보다 길고
   * 조금 크다.
   */
  leaving: [
    { from: 660, to: 660, seconds: 0.16, type: 'triangle', gain: 0.22 },
    { from: 440, to: 330, seconds: 0.34, type: 'triangle', gain: 0.22 },
  ],
}

const MUTE_KEY = 'gj.pet.muted'

let context: AudioContext | null = null
let muted = readMuted()

/**
 * 음소거 여부는 세이브가 아니라 별도 키에 둔다.
 *
 * PetSave 에 넣으면 스키마가 바뀌고 마이그레이션이 필요해지는데, 음소거는 진행이
 * 아니라 이 기기의 설정이다. 세이브가 날아가도 같이 날아갈 이유가 없다.
 */
function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    // 사생활 보호 모드에서는 접근 자체가 던진다. 소리는 켜 둔 것으로 본다.
    return false
  }
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(next: boolean): void {
  muted = next
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    // 저장하지 못해도 이번 세션에는 반영된다. 소리 설정 때문에 화면이 죽으면 안 된다.
  }
}

/**
 * 첫 사용자 제스처에서 부른다. 이 전에는 어떤 소리도 나지 않는다.
 *
 * 이미 만들어져 있으면 resume 만 한다 — 탭을 백그라운드로 보냈다 돌아오면
 * 컨텍스트가 suspended 로 남아 있어서, 그대로 두면 그 뒤로 영영 무음이 된다.
 */
export function unlock(): void {
  try {
    if (context === null) {
      const Ctor = window.AudioContext ?? window.webkitAudioContext
      if (!Ctor) return
      context = new Ctor()
    }
    if (context.state === 'suspended') void context.resume()
  } catch {
    // 오디오를 못 쓰는 환경이어도 게임은 돌아야 한다.
    context = null
  }
}

/**
 * 배경음악이 같은 컨텍스트를 쓰도록 꺼내 준다.
 *
 * 음악이 자기 AudioContext 를 따로 만들면 잠금 해제(unlock)가 두 곳이 되고,
 * 한쪽만 풀린 채로 남으면 "효과음은 나는데 음악은 안 나는" 상태가 된다.
 * 컨텍스트는 하나만 둔다.
 */
export function getContext(): AudioContext | null {
  return context
}

export function play(name: SoundName): void {
  if (muted || context === null || context.state !== 'running') return

  const blips = BLIPS[name]
  let at = context.currentTime
  for (const blip of blips) {
    ring(context, blip, at)
    at += blip.seconds
  }
}

function ring(ctx: AudioContext, blip: Blip, startAt: number): void {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()

  osc.type = blip.type
  osc.frequency.setValueAtTime(blip.from, startAt)
  if (blip.to !== blip.from) {
    osc.frequency.exponentialRampToValueAtTime(blip.to, startAt + blip.seconds)
  }

  // 뚝 끊으면 "틱" 하는 잡음이 난다. 짧게라도 감쇠를 넣어야 소리가 깨끗하다.
  amp.gain.setValueAtTime(blip.gain, startAt)
  amp.gain.exponentialRampToValueAtTime(0.0001, startAt + blip.seconds)

  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + blip.seconds + 0.01)
}
