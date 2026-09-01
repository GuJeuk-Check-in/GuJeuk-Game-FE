// 배경음악을 합성한다. 오디오 파일을 쓰지 않는다.
//
// 파일로 받으면 번들이 무거워지는 것도 문제지만, **루프 이음매가 더 큰 문제다.**
// 앞뒤가 딱 맞물리게 자른 음원이 아니면 한 바퀴 돌 때마다 툭 끊기는 소리가 나고,
// 그건 사용자가 원인을 모른 채 거슬려 하는 종류의 결함이다. 음표를 직접 예약하면
// 이음매라는 것이 아예 없다.
//
// 효과음(sound.ts)과 같은 AudioContext 를 쓴다. 잠금 해제 경로가 하나여야 한다.

import { getContext, isMuted } from './sound'
import type { MinigameId } from './pet/economy'

/**
 * 곡 이름. 미니게임 쪽은 **MinigameId 를 그대로 받는다.**
 *
 * 세 이름을 손으로 다시 적으면 네 번째 미니게임이 늘었을 때 오류가 아래 TRACKS
 * 표가 아니라 부르는 쪽(MinigameScreen)에서 난다 — 정작 고쳐야 할 곳은 표다.
 * 유도해 두면 `Record<TrackName, Track>` 이 새 게임의 곡을 표에서 먼저 요구한다.
 */
export type TrackName = 'home' | MinigameId

/** 한 옥타브 위·아래는 주파수를 두 배·절반 한 것이다. */
const up = (hz: number) => hz * 2
const down = (hz: number) => hz / 2

/**
 * C 장조 5음 음계(도 레 미 솔 라).
 *
 * 5음 음계에는 **반음이 없어서 어떤 음을 어떤 화음 위에 얹어도 틀린 소리가
 * 나지 않는다.** 멜로디를 손으로 하나하나 검증하지 않아도 되는 이유다.
 */
const MAJOR = [261.63, 293.66, 329.63, 392.0, 440.0]

/**
 * A 단조 5음 음계(라 도 레 미 솔).
 *
 * 같은 5음 음계인데 시작음이 달라 어둡게 들린다. 미니게임의 긴장감은 여기서
 * 나온다 — 빠르게 하는 것만으로는 조급해지기만 하고 긴장되지는 않는다.
 */
const MINOR = [220.0, 261.63, 293.66, 329.63, 392.0]

/** [박, 음계 인덱스] */
type Note = readonly [number, number]

interface Track {
  bpm: number
  scale: readonly number[]
  /** 마디마다 하나씩 도는 베이스 음. 길이가 곧 화음 진행의 길이다. */
  bass: readonly number[]
  /** 마디별 멜로디. 빈 배열인 마디는 쉰다. */
  melody: readonly (readonly Note[])[]
  lead: OscillatorType
  /** 전체 크기. 효과음보다 확실히 아래에 둔다. */
  gain: number
  /**
   * 베이스를 매 박에 찍을지.
   *
   * 켜면 몰아가는 느낌이 나고, 끄면 마디 앞머리에만 놓여 여유가 생긴다.
   * 긴장감을 만드는 것은 음의 높이가 아니라 **얼마나 자주 두드리느냐**다.
   */
  drive: boolean
}

const HOME_MELODY: readonly (readonly Note[])[] = [
  [
    [0, 2],
    [1.5, 4],
    [2.5, 3],
  ],
  [
    [0, 1],
    [2, 2],
  ],
  [
    [0, 3],
    [1.5, 2],
    [3, 1],
  ],
  [[0.5, 0]],
  [
    [0, 4],
    [1.5, 3],
    [2.5, 2],
  ],
  [
    [0, 2],
    [2, 1],
  ],
  [
    [0, 3],
    [1.5, 4],
    [3, 3],
  ],
  [[1, 2]],
]

/** 뛰어다니는 리듬. 박 사이에 음을 하나씩 끼워 통통 튀게 한다. */
const CATCH_MELODY: readonly (readonly Note[])[] = [
  [
    [0, 0],
    [0.75, 2],
    [1.5, 1],
    [2.25, 3],
    [3, 2],
  ],
  [
    [0, 1],
    [0.75, 3],
    [1.5, 2],
    [3, 4],
  ],
  [
    [0, 2],
    [0.75, 4],
    [1.5, 3],
    [2.25, 1],
    [3, 0],
  ],
  [
    [0, 1],
    [1.5, 0],
    [2.5, 2],
  ],
]

/** 달리는 곡은 멜로디를 성기게 둔다. 베이스가 이미 쉼 없이 두드리고 있어서다. */
const HOP_MELODY: readonly (readonly Note[])[] = [
  [
    [0, 4],
    [2, 3],
  ],
  [
    [0, 2],
    [2, 4],
  ],
  [
    [0, 3],
    [1.5, 1],
    [3, 2],
  ],
  [[0, 0]],
]

/**
 * 따라하기는 **멜로디가 없다.**
 *
 * 게임 자체가 음을 들려주고 그것을 기억하는 규칙이라, 배경에 가락이 깔리면
 * 기억해야 할 음과 섞인다. 그건 게임을 나쁜 방식으로 어렵게 만든다 — 실력이
 * 아니라 소리 분간이 승부를 가르게 된다. 그래서 낮은 맥박만 남긴다.
 */
const ECHO_MELODY: readonly (readonly Note[])[] = [[], [], [], []]

const TRACKS: Record<TrackName, Track> = {
  home: {
    // 느리게 잡았다. 돌보는 게임의 배경이라 재촉하면 안 된다 — 빠른 곡은 "빨리
    // 하라"는 신호로 읽혀서, 가만히 펫을 보고 있는 시간이 불편해진다.
    bpm: 84,
    scale: MAJOR,
    // I - vi - IV - V. 가장 편안하게 들리는 진행이다.
    bass: [down(MAJOR[0]), down(MAJOR[4]), down(MAJOR[3]), down(MAJOR[3]) * (3 / 2)],
    melody: HOME_MELODY,
    lead: 'square',
    gain: 0.055,
    drive: false,
  },
  catch: {
    bpm: 116,
    scale: MINOR,
    // i - VI - VII - i. 단조 진행이라 같은 속도라도 더 조인다.
    bass: [down(MINOR[0]), down(MINOR[1]) * (2 / 3), down(MINOR[4]) / 2, down(MINOR[0])],
    melody: CATCH_MELODY,
    lead: 'square',
    gain: 0.05,
    drive: true,
  },
  hop: {
    // 셋 중 가장 빠르다. 달리는 게임이라 발이 바닥을 치는 속도와 붙어야 한다.
    bpm: 138,
    scale: MINOR,
    bass: [down(MINOR[0]), down(MINOR[0]), down(MINOR[4]) / 2, down(MINOR[1]) * (2 / 3)],
    melody: HOP_MELODY,
    lead: 'triangle',
    gain: 0.05,
    drive: true,
  },
  echo: {
    bpm: 66,
    scale: MINOR,
    bass: [down(MINOR[0]), down(MINOR[0]), down(MINOR[3]) / 2, down(MINOR[0])],
    melody: ECHO_MELODY,
    lead: 'triangle',
    // 게임 음을 가리지 않도록 확실히 낮춘다.
    gain: 0.03,
    drive: false,
  },
}

const BEATS_PER_BAR = 4

/** 몇 초 앞까지 미리 예약할지. 브라우저가 잠깐 바빠도 소리가 끊기지 않을 만큼. */
const LOOKAHEAD_SEC = 0.6
/** 예약을 다시 확인하는 주기(ms). */
const TICK_MS = 120
/** 곡을 바꿀 때 겹치는 시간. 짧게 하면 뚝 끊기고, 길면 두 곡이 섞여 들린다. */
const CROSSFADE_SEC = 0.35

/**
 * 음 하나의 올림 시간(초).
 *
 * 0 에서 바로 목표 크기로 뛰면 "틱" 하는 잡음이 난다. 20ms 는 사람이 시작이
 * 늦었다고 느끼지 않는 상한이면서 잡음은 사라지는 값이다. 오실레이터를 떼는
 * 것도 이만큼 뒤로 미룬다 — 감쇠가 끝나기 전에 끊으면 같은 잡음이 난다.
 */
const ATTACK_SEC = 0.02

/**
 * 성부별 길이와 크기. **박자에 대한 비율로 적는다** — bpm 이 다른 네 곡이 같은
 * 표를 쓰므로, 초로 적으면 빠른 곡에서만 음이 겹치거나 끊긴다.
 */
/** 몰아가는 베이스 한 방의 길이. 박의 절반보다 짧아야 다음 박과 붙지 않는다. */
const BASS_DRIVE_LEN = 0.45
/** 여유 있는 베이스는 두 박 넘게 끌어 마디 전체를 받친다. */
const BASS_HOLD_LEN = 2.4
/** 멜로디는 박을 거의 다 채우되 조금 남긴다. 꽉 채우면 다음 음과 이어져 들린다. */
const LEAD_LEN = 0.9

/** 베이스는 화음·멜로디보다 확실히 커야 진행이 들린다. */
const BASS_GAIN = 0.5
/** 화음은 있는지 모를 만큼만. 없으면 멜로디가 허공에 뜬다. */
const CHORD_GAIN = 0.16
const LEAD_GAIN = 0.22

/**
 * 화음으로 얹는 음정 비. 5/4 는 순정률의 장3도다.
 *
 * 5음 음계에는 반음이 없어(MAJOR 주석) 어떤 음을 얹어도 틀리지 않지만, 3음은
 * 그중에서도 장조·단조를 결정짓는 자리라 화음이 있다는 것이 가장 잘 들린다.
 */
const CHORD_RATIO = 5 / 4
/** 화음이 들어오는 자리. 마디 앞머리를 베이스에 양보하고 반 박 뒤에 얹는다. */
const CHORD_OFFSET_BEATS = 0.5

/**
 * 첫 마디를 현재 시각보다 얼마나 뒤에 두는지(초).
 *
 * 현재 시각보다 앞선 예약은 그냥 버려진다. play() 는 제스처 안에서 불려 컨텍스트가
 * 아직 resume 중일 수 있으므로 아래 RESYNC_PAD_SEC 보다 넉넉히 잡는다.
 */
const START_PAD_SEC = 0.1

/**
 * 밀린 마디를 버리고 다시 잡을 때의 여유(초).
 *
 * 이미 돌고 있는 컨텍스트에서만 지나는 길이라 짧아도 된다. 길게 잡으면 그만큼
 * 곡이 잠깐 비어 끊긴 것으로 들린다.
 */
const RESYNC_PAD_SEC = 0.05

let timer: number | null = null
let master: GainNode | null = null
let current: TrackName | null = null
/** 다음에 예약할 마디 번호. 여기서 시간을 유도하므로 드리프트가 쌓이지 않는다. */
let nextBar = 0
/** 0번 마디가 시작하는 컨텍스트 시각. */
let originSec = 0

/**
 * 화면이 마지막으로 요청한 곡. **컨텍스트가 아직 없어도 여기에는 남는다.**
 *
 * 첫 제스처 전에는 play() 가 조용히 아무 일도 하지 않는다. 그때 요청을 잊으면,
 * 미니게임 안에서 처음 화면을 만진 사람은 그 판이 끝날 때까지 거실 곡을 듣는다 —
 * 화면 쪽 effect 는 이미 한 번 돌고 다시 돌지 않기 때문이다.
 */
let wanted: TrackName = 'home'

function voice(
  ctx: AudioContext,
  out: GainNode,
  type: OscillatorType,
  hz: number,
  atSec: number,
  lenSec: number,
  gain: number,
): void {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(hz, atSec)

  // 갑자기 시작하고 갑자기 끊으면 "틱" 소리가 난다. 짧은 올림과 긴 감쇠를 준다.
  amp.gain.setValueAtTime(0.0001, atSec)
  amp.gain.exponentialRampToValueAtTime(gain, atSec + ATTACK_SEC)
  amp.gain.exponentialRampToValueAtTime(0.0001, atSec + lenSec)

  osc.connect(amp)
  amp.connect(out)
  osc.start(atSec)
  osc.stop(atSec + lenSec + ATTACK_SEC)
}

function scheduleBar(ctx: AudioContext, out: GainNode, track: Track, bar: number): void {
  const beatSec = 60 / track.bpm
  const barStart = originSec + bar * BEATS_PER_BAR * beatSec
  const root = track.bass[bar % track.bass.length]

  if (track.drive) {
    // 매 박마다 짧게. 이것 하나로 곡이 앞으로 밀린다.
    for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
      voice(
        ctx,
        out,
        'triangle',
        root,
        barStart + beat * beatSec,
        beatSec * BASS_DRIVE_LEN,
        BASS_GAIN,
      )
    }
  } else {
    voice(ctx, out, 'triangle', root, barStart, beatSec * BASS_HOLD_LEN, BASS_GAIN)
  }

  // 화음은 3음을 아주 작게 겹쳐 둔다. 없으면 멜로디가 허공에 뜬 것처럼 들린다.
  voice(
    ctx,
    out,
    'triangle',
    up(root) * CHORD_RATIO,
    barStart + beatSec * CHORD_OFFSET_BEATS,
    beatSec,
    CHORD_GAIN,
  )

  for (const [beat, step] of track.melody[bar % track.melody.length]) {
    voice(
      ctx,
      out,
      track.lead,
      up(track.scale[step]),
      barStart + beat * beatSec,
      beatSec * LEAD_LEN,
      LEAD_GAIN,
    )
  }
}

function tick(): void {
  const ctx = getContext()
  if (ctx === null || master === null || current === null || ctx.state !== 'running') return

  const track = TRACKS[current]
  const barSec = BEATS_PER_BAR * (60 / track.bpm)
  const until = ctx.currentTime + LOOKAHEAD_SEC

  // **밀린 마디를 한꺼번에 쏟지 않는다.** unlock() 의 resume 은 비동기라 컨텍스트가
  // 늦게 돌기 시작할 수 있고, 그 사이 시각이 흐르면 예약해야 할 마디가 수십 개
  // 쌓인다. 그대로 두면 지난 시각의 음이 전부 지금 울려 한 번 "왁" 하고 터진다.
  if (ctx.currentTime - (originSec + nextBar * barSec) > barSec) {
    originSec = ctx.currentTime + RESYNC_PAD_SEC
    nextBar = 0
  }

  // **드리프트 방지.** 매번 "지금부터 한 마디 뒤"로 잡으면 오차가 쌓여 박자가
  // 밀린다. 마디 번호에서 시각을 유도하면 몇 시간을 돌아도 어긋나지 않는다.
  while (originSec + nextBar * barSec < until) {
    scheduleBar(ctx, master, track, nextBar)
    nextBar += 1
  }
}

/**
 * setTargetAtTime 은 지수 접근이라 정확히 0 이 되는 시각이 없다. 크로스페이드가
 * 끝난 뒤 이만큼(ms) 더 두었다가 떼어낸다 — 남은 꼬리가 들리지 않을 만큼 작아지는
 * 여유이자, 이미 예약된 마지막 음이 제 감쇠를 마칠 시간이다.
 */
const RETIRE_TAIL_MS = 400

/**
 * 음소거를 걸고 푸는 데 걸리는 시간(초).
 *
 * 즉시 0 으로 떨구면 "틱" 소리가 나고, 길면 버튼을 누른 것과 조용해지는 것이
 * 따로 놀아 눌린 것 같지 않다.
 */
const MUTE_RAMP_SEC = 0.05

/** 예약된 음이 남아 있으므로 즉시 끊지 않고 짧게 줄인 뒤 떼어낸다. */
function retire(node: GainNode, ctx: AudioContext): void {
  node.gain.cancelScheduledValues(ctx.currentTime)
  node.gain.setTargetAtTime(0, ctx.currentTime, CROSSFADE_SEC / 3)
  window.setTimeout(() => node.disconnect(), CROSSFADE_SEC * 1000 + RETIRE_TAIL_MS)
}

/**
 * 곡을 걸거나 바꾼다. **sound.unlock() 뒤에 불러야 한다** — 그 전에는 컨텍스트가
 * 없어서 이름만 기억해 두고, 다음 호출(start)에서 그 곡으로 시작한다.
 */
export function play(name: TrackName): void {
  wanted = name
  if (current === name && timer !== null) return
  const ctx = getContext()
  if (ctx === null) return

  if (master !== null) retire(master, ctx)
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }

  const track = TRACKS[name]
  master = ctx.createGain()
  // 0 에서 올려 시작한다. 곡을 바꿀 때 앞 곡과 겹치는 구간이 자연스러워진다.
  master.gain.setValueAtTime(0.0001, ctx.currentTime)
  master.gain.linearRampToValueAtTime(isMuted() ? 0 : track.gain, ctx.currentTime + CROSSFADE_SEC)
  master.connect(ctx.destination)

  current = name
  // 첫 마디를 바로 시작하지 않고 조금 뒤로 민다. 예약이 현재 시각보다 앞서면
  // 그 음은 그냥 버려진다.
  originSec = ctx.currentTime + START_PAD_SEC
  nextBar = 0
  tick()
  timer = window.setInterval(tick, TICK_MS)
}

/**
 * 컨텍스트가 열린 뒤 음악을 건다. **화면이 "무슨 곡인지"를 정하지 않는 자리용이다.**
 *
 * 거는 곡은 언제나 마지막으로 요청된 곡(wanted)이라, 제스처마다 불러도 지금 도는
 * 곡을 홈 곡으로 갈아 끼우지 않는다. 아무도 요청한 적이 없으면 홈 곡이다.
 */
export function start(): void {
  play(wanted)
}

export function stop(): void {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
  const ctx = getContext()
  if (master !== null && ctx !== null) retire(master, ctx)
  master = null
  current = null
}

/**
 * 음소거 상태를 지금 곡에 반영한다.
 *
 * **음소거 값을 여기서 들지 않는다.** 주인은 sound.ts 하나이고(별도 localStorage
 * 키, 명세 §12.13) 이 모듈은 그때그때 읽는다. 사본을 두면 부팅 경로에서 한쪽만
 * 채워져 "소리를 껐는데 음악만 나는" 상태가 생긴다 — 값이 갈릴 여지 자체를 없앤다.
 *
 * 정지가 아니라 볼륨만 내리는 것은, 다시 켤 때 곡의 같은 자리에서 이어져야 껐다
 * 켠 것이 티나지 않아서다.
 */
export function syncMuted(): void {
  const ctx = getContext()
  if (master === null || ctx === null || current === null) return
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.setTargetAtTime(isMuted() ? 0 : TRACKS[current].gain, ctx.currentTime, MUTE_RAMP_SEC)
}
