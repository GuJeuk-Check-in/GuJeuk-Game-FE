// 어떤 얼굴을 보여줄지 정한다. 그리기는 모른다.
//
// 표정을 렌더링 코드 안에서 정하면 "언제 슬픈 얼굴인가" 같은 규칙이 캔버스
// 클래스에 숨는다. 그건 화면 없이 확인할 수 없고, 미니게임이 생기면 같은 판단이
// 또 한 벌 생긴다. 규칙은 여기 두고 그리는 쪽은 이름만 받아 간다.

import type { Stage } from '../types'

/** 스프라이트로 존재하는 표정. src/assets/pet-<stage>[-<face>].png 와 짝이다. */
export type FaceKind = 'base' | 'blink' | 'sad' | 'open'

/**
 * 스프라이트 이름을 만든다. sprites.ts 가 이 이름으로 그림을 찾는다.
 *
 * 문자열을 부르는 쪽에서 조립하면 오타가 런타임까지 살아남는다. 여기 한 곳에
 * 두면 파일 이름 규칙이 바뀌어도 고칠 곳이 하나다.
 */
export function petSpriteName(stage: Stage, face: FaceKind): string {
  return face === 'base' ? `pet-${stage}` : `pet-${stage}-${face}`
}

export interface FaceInput {
  /** 기분이 0 이면 시무룩하다(§4). */
  moodZero: boolean
  /** 먹는 중. 한 프레임만 입을 벌려도 "먹었다"가 읽힌다. */
  eating: boolean
  /** 지금이 깜빡이는 순간인가. isBlinking() 이 정한다. */
  blinking: boolean
  /** 자는 중. 눈을 감고 있어야 한다. */
  asleep: boolean
}

/**
 * 우선순위: 자는 중 > 먹는 중 > 시무룩 > 깜빡임 > 기본.
 *
 * **자는 것이 가장 앞선다.** 재웠는데 눈을 뜨고 있으면 "불을 껐어요. 잘 자!"가
 * 거짓말이 된다. 감은 눈 스프라이트가 따로 없어 깜빡임용(`blink`)을 그대로
 * 쓴다 — 눈을 감은 그림이라는 점에서 같다.
 *
 * 시무룩이 깜빡임보다 앞서는 이유는 **`sad-blink` 스프라이트가 없기 때문이다.**
 * 깜빡임을 먼저 보면 시무룩한 펫이 깜빡일 때마다 멀쩡한 얼굴로 돌아온다.
 * 먹는 것이 그다음인 것은 그 순간이 사용자가 방금 한 행동에 대한 답이라서다 —
 * 반응이 다른 표정에 가려지면 눌러도 아무 일 없는 것처럼 느껴진다.
 */
export function pickFace(input: FaceInput): FaceKind {
  if (input.asleep) return 'blink'
  if (input.eating) return 'open'
  if (input.moodZero) return 'sad'
  if (input.blinking) return 'blink'
  return 'base'
}

/** 깜빡임 한 번의 길이(초). 이보다 길면 조는 것처럼 보인다. */
export const BLINK_HOLD_SEC = 0.12

/** 깜빡임 주기의 최소·최대(초). 일정한 주기는 기계처럼 보인다. */
export const BLINK_MIN_GAP_SEC = 3
export const BLINK_MAX_GAP_SEC = 5

/**
 * 지금이 깜빡이는 순간인가.
 *
 * Math.random 을 쓰지 않는다. 렌더 루프에서 매 프레임 뽑으면 같은 초에 깜빡였다
 * 안 깜빡였다 하고, 무엇보다 **테스트할 수 없다.** 대신 몇 번째 깜빡임인지를
 * 세고 그 번호에서 간격을 유도한다 — 결과는 불규칙해 보이면서 같은 입력에
 * 항상 같은 답을 준다.
 */
export function isBlinking(elapsedSec: number): boolean {
  if (elapsedSec < 0) return false

  let cursor = 0
  let index = 0
  // 한 프레임에 도는 횟수는 경과 시간 / 최소 간격 이하라 실사용에서는 몇 번이다.
  while (cursor <= elapsedSec) {
    const gap = gapFor(index)
    if (elapsedSec < cursor + gap) return false
    if (elapsedSec < cursor + gap + BLINK_HOLD_SEC) return true
    cursor += gap + BLINK_HOLD_SEC
    index += 1
  }
  return false
}

/**
 * n 번째 깜빡임까지의 간격.
 *
 * 정수를 섞어 0~1 을 만드는 흔한 방법이다. 난수의 질이 필요한 자리가 아니라
 * "규칙적으로 보이지 않으면 충분한" 자리다.
 */
function gapFor(index: number): number {
  const mixed = Math.sin(index * 12.9898) * 43758.5453
  const unit = mixed - Math.floor(mixed)
  return BLINK_MIN_GAP_SEC + unit * (BLINK_MAX_GAP_SEC - BLINK_MIN_GAP_SEC)
}
