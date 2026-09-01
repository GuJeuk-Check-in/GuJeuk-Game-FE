// 튜토리얼 상태 머신. 순수 함수만 둔다 — React 도 Canvas 도 모른다. (명세 §9)
//
// 화면이 하는 일은 둘뿐이다. currentStep() 이 돌려준 단계의 text 를 말풍선에
// 띄우고 highlight 가 가리키는 자기 요소를 강조하는 것, 그리고 사용자가 무언가
// 해냈을 때 advance() 에 그 사건을 넘기는 것. 버튼 위치를 바꿔도 여기는 안 깨진다.
//
// **단계 판정을 게임 상태로 하지 않는다.** 명세 §9 는 완료 조건을
// `(state) => boolean` 으로 적었지만, 그대로 두면 새 펫이 이미 청결 100 이라
// 3단계("씻기기")가 들어가자마자 통과해 버린다. 무슨 일이 있었는지를 사건으로
// 받으면 그런 뒤집힘이 없다. 상태는 같아도 "씻겼다"와 "원래 깨끗했다"는 다르다.
//
// 진입 지급(사과 3개 · 코인 100)도 여기서 한다. §9 는 "튜토리얼 판은 에너지를
// 소모하지 않고 코인 100 을 보장한다"고 적었는데, 코인을 하한으로 두려면 미니게임
// 정산 코드가 튜토리얼을 알아야 한다 — 정산이 "지금 몇 단계인가"를 묻기 시작하면
// §7 의 상한·벌칙 규칙과 튜토리얼 규칙이 한 함수 안에서 섞인다. 단계에 **들어갈 때**
// 그냥 쥐여 주면 정산은 튜토리얼을 모른 채로 남고, "첫 판에서 0점을 받아 5단계에서
// 살 게 없다"는 원래 문제는 똑같이 막힌다. 명세 §9 의 문장도 지급으로 고쳤다.
//
// 에너지 면제는 지급으로 바꿀 수 없어서(빼는 쪽이다) 정산 **뒤에** 되돌린다 —
// keepTutorialEnergy 를 보라. 그래도 정산은 여전히 튜토리얼을 모른다.

import type { PetSave, RoomId } from '../types'
import { grantItem } from './actions'
import {
  TUTORIAL_APPLE_COUNT,
  TUTORIAL_COMPLETE_COIN,
  TUTORIAL_START_CLEAN,
  TUTORIAL_START_COIN,
  TUTORIAL_START_HUNGER,
} from './economy'

/**
 * 단계를 넘기는 사건. 게임 상태를 보고 추측하지 않고 무슨 일이 있었는지를 받는다.
 *
 * 'confirm' 은 부화 탭 · 이름 확정 · 마지막 확인 셋 다에 쓴다. 셋을 다른 이름으로
 * 나눠도 지금 단계가 하나뿐이라 구별할 이유가 없다.
 */
export type TutorialEvent = 'confirm' | 'fed' | 'washed' | 'played' | 'bought'

export interface TutorialStep {
  /** save.tutorial.step 과 같은 값. 배열 인덱스이기도 하다. */
  id: number
  /** 말풍선 문구. */
  text: string
  /** 화면이 강조할 대상. 화면은 이 문자열로 자기 요소를 찾는다. */
  highlight: 'none' | 'hunger' | 'clean' | 'roomNext' | 'play' | 'shop'
  /** 이 단계를 끝내는 사건. */
  completedBy: TutorialEvent
}

/**
 * 화면이 강조할 수 있는 대상의 어휘.
 *
 * 표식을 다는 쪽(components/highlight.ts)이 이 타입을 쓴다. string 으로 다루면
 * 'roomNext' 를 'roomnext' 로 적어도 빌드가 통과하고 링만 조용히 사라진다 —
 * sprites.ts 의 furnitureSpriteName 이 막아 둔 것과 같은 종류의 오류다.
 */
export type TutorialHighlight = TutorialStep['highlight']

/**
 * 튜토리얼이 시작되는 단계.
 *
 * 0(부화) · 1(이름 짓기)은 이름 입력 화면이 담당한다. 그 화면은 세이브가 아직
 * 없는 상태에서 도니 단계를 세이브에 적을 수도 없다. 그래서 세이브는 2단계부터
 * 시작하고, 배열은 0~6 을 다 담되 0·1 은 새 세이브에 뜨지 않는다.
 */
export const TUTORIAL_START_STEP = 2

/** 놀이터가 열리는 단계(§3). */
const PLAY_UNLOCK_STEP = 4

/** 상점이 열리는 단계(§3). */
const SHOP_UNLOCK_STEP = 5

/**
 * 7단계 전부. 배열 인덱스가 곧 id 이므로 순서를 바꾸면 세이브의 step 이 어긋난다.
 *
 * 문구는 "무엇이 일어났는지"가 아니라 **"이제 무엇을 하면 되는지"**로 쓴다.
 * "배고픔이 줄었어요"는 사실을 알려줄 뿐이고, 처음 온 사람은 그다음에 어디를
 * 눌러야 하는지 모른 채 멈춘다(§14 "거절도 반응인가"와 같은 이유다).
 *
 * **0·1 은 M4 에서 화면으로 만들지 않았다.** §9 의 0단계는 "알을 탭해서 부화"인데
 * 알 에셋도 부화 연출도 없고(M5 의 도트 리소스 범위다), 1단계의 이름 짓기는 이미
 * 이름 입력 화면(NamePrompt)이 하고 있다. 두 항목을 배열에서 빼지 않는 것은
 * **인덱스가 곧 세이브의 step 이기 때문**이다 — 빼면 기존 세이브의 2~6 이 통째로
 * 한 칸씩 밀린다. 대신 문구를 이름 화면의 말로 바꿔 둔다. M3 이전에 만들어진
 * 세이브(step 0)를 들고 온 사람만 이 둘을 지나가는데, 그 사람은 이름을 이미
 * 지었으므로 "알이 흔들려요"를 읽으면 안 된다. 결정 기록은 §9 · §14 에 있다.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 0,
    text: '펫타운에 온 걸 환영해요! 이제부터 돌보는 법을 알려줄게요.',
    highlight: 'none',
    completedBy: 'confirm',
  },
  {
    id: 1,
    text: '이름은 다 지었어요. 확인을 누르면 첫 번째 할 일로 넘어가요.',
    highlight: 'none',
    completedBy: 'confirm',
  },
  {
    id: 2,
    // 사과를 쥐여 준 사실까지 말해 준다. 가방에 뭐가 들었는지 모르면 주방에
    // 가서도 무엇을 눌러야 할지 알 수 없다.
    text: '배고픔 게이지를 보세요. 사과 3개를 드렸어요 — 주방으로 가서 먹여 주세요.',
    highlight: 'hunger',
    completedBy: 'fed',
  },
  {
    id: 3,
    text: '이번엔 청결 게이지예요. 욕실로 가서 문질러 씻겨 주세요.',
    highlight: 'clean',
    completedBy: 'washed',
  },
  {
    id: 4,
    text: '놀이터가 열렸어요! 미니게임을 한 판 해 보세요.',
    highlight: 'play',
    completedBy: 'played',
  },
  {
    id: 5,
    text: '상점이 열렸어요! 코인 100 을 드렸으니 마음에 드는 걸 하나 사 보세요.',
    highlight: 'shop',
    completedBy: 'bought',
  },
  {
    id: 6,
    // 마지막은 "지금 하라"가 아니라 "나중에 여기서 하라"다. 재우는 것까지 시키면
    // 튜토리얼이 끝나는 순간이 몇 시간 뒤가 된다(§9 "지금 재울 필요는 없음").
    text: '마지막이에요. 침실에서 재우면 기운이 차올라요. 확인을 누르면 끝!',
    highlight: 'roomNext',
    completedBy: 'confirm',
  },
]

/**
 * 새 세이브를 튜토리얼 시작 상태로 만든다. **세이브를 만든 직후 한 번만 부른다.**
 *
 * 계약에 없던 함수를 하나 더 두는 이유: 진입 지급은 "그 단계에 들어갈 때" 주는
 * 것인데, 2단계는 아무도 들어가지 않는다 — 세이브가 거기서 시작하기 때문이다.
 * advance() 만으로는 사과를 줄 경로가 없고, 그러면 첫 사용자가 먹일 것도 살 것도
 * 없이 2단계에서 멈춘다. 지급 규칙을 화면으로 새어 나가게 두느니 시작을 여는
 * 함수를 여기 두는 편이 낫다.
 */
export function startTutorial(save: PetSave): PetSave {
  const started: PetSave = {
    ...save,
    // **게이지를 조금 비워 두고 시작한다.** 새 펫은 배고픔·청결이 100 이라
    // (save.ts 의 createSave) 2단계가 강조한 게이지가 사과를 먹여도 움직이지 않고
    // 과식 판정에 걸린다 — 시연이 시연을 못 한다. 근거와 값은 economy.ts 의
    // TUTORIAL_START_HUNGER 주석에 있다. createSave 의 기본값은 튜토리얼을
    // 건너뛴 뒤의 일반 시작값이므로 그대로 둔다.
    stats: {
      ...save.stats,
      hunger: TUTORIAL_START_HUNGER,
      clean: TUTORIAL_START_CLEAN,
    },
    tutorial: { step: TUTORIAL_START_STEP, done: false },
  }
  return applyEntryGrant(started, TUTORIAL_START_STEP)
}

/**
 * 현재 단계. 튜토리얼이 끝났으면 null.
 *
 * **정수인지까지 본다.** 손으로 고친 세이브의 step 이 2.5 면 `2.5 < 0` 도
 * `2.5 >= 7` 도 거짓이라 범위 검사를 그대로 지나가고, TUTORIAL_STEPS[2.5] 는
 * undefined 다 — 반환 타입은 null 이라고 적혀 있는데 실제 값이 undefined 이므로
 * 부르는 쪽의 `!== null` 검사가 전부 통과하고, advance() 와 오버레이가 그
 * 자리에서 던진다. ErrorBoundary 가 없어 화면이 통째로 죽고, 세이브는 멀쩡한
 * 숫자라 복구 경로도 돌지 않아 새로고침해도 같은 크래시가 반복된다.
 * decor.ts 의 at() 이 같은 함정을 Number.isInteger 로 막아 둔 것과 같다.
 */
export function currentStep(save: PetSave): TutorialStep | null {
  const { step, done } = save.tutorial
  // 범위 밖도 null 이다. 끝난 세이브의 step 은 배열 길이(=7)이고, 손으로 고친
  // 세이브가 엉뚱한 숫자를 들고 와도 여기서 조용히 멈춘다.
  if (done || !Number.isInteger(step) || step < 0 || step >= TUTORIAL_STEPS.length) return null
  // ?? null 로 반환 타입과 실제 값을 맞춘다(noUncheckedIndexedAccess 가 꺼져 있어
  // 배열 접근만으로는 컴파일러가 undefined 가능성을 보여주지 않는다).
  return TUTORIAL_STEPS[step] ?? null
}

/**
 * 사건을 받아 단계를 넘긴다. 지금 단계를 끝내는 사건이 아니면 그대로 돌려준다.
 *
 * 넘어가면서 **다음 단계의** 진입 지급을 적용한다. 지급이 전이 순간에 붙어 있어야
 * 정확히 한 번만 들어간다. "5단계면 코인 100" 처럼 상태로 판정하면 화면이 다시
 * 그려질 때마다 코인이 늘어난다.
 */
export function advance(save: PetSave, event: TutorialEvent): PetSave {
  const step = currentStep(save)
  if (step === null) return save
  if (step.completedBy !== event) return save

  const nextId = step.id + 1
  if (nextId >= TUTORIAL_STEPS.length) return complete(save)

  const moved: PetSave = { ...save, tutorial: { ...save.tutorial, step: nextId } }
  return applyEntryGrant(moved, nextId)
}

/**
 * 방이 열려 있는가. 놀이터·상점은 튜토리얼 진행에 따라 열린다(§3).
 *
 * 나머지 넷(거실·주방·욕실·침실)은 처음부터 열려 있다. 2단계가 주방을, 3단계가
 * 욕실을 시키기 때문에 이 넷을 잠그면 튜토리얼 자신이 막힌다.
 */
export function isRoomUnlocked(save: PetSave, room: RoomId): boolean {
  if (save.tutorial.done) return true
  if (room === 'play') return save.tutorial.step >= PLAY_UNLOCK_STEP
  if (room === 'shop') return save.tutorial.step >= SHOP_UNLOCK_STEP
  return true
}

/**
 * 튜토리얼 중의 한 판은 에너지를 소모하지 않는다(§9). 정산 결과의 에너지를 되돌린다.
 *
 * `before` 는 정산 **전** 세이브다. 그것으로 판정하는 이유: 4단계를 끝낸 정산은
 * 이미 5단계로 넘어간 세이브를 내놓으므로, 결과 쪽으로 물으면 "튜토리얼 중이었나"
 * 를 놓친다.
 *
 * **면제가 없으면 4단계에서 실제로 멈춘다.** §9 는 중단 재개를 정상 흐름으로 보는데,
 * 복귀 한 번마다 에너지가 최대 24 씩 빠지고(DECAY_PER_HOUR.energy × OFFLINE_CAP_MS)
 * 깨어 있는 동안에는 회복 경로가 없다. 몇 번 반복하면 canPlay 가 모든 미니게임을
 * 막고, 그 자물쇠는 실시간으로 30분 넘게 재워야만 풀린다.
 *
 * 정산(minigames.ts)에 단계를 알리지 않고 여기서 되돌리는 것은, 정산이 "지금 몇
 * 단계인가"를 묻기 시작하면 §7 의 상한·벌칙 규칙과 튜토리얼 규칙이 한 함수 안에
 * 섞이기 때문이다(이 파일 첫머리와 같은 이유).
 */
export function keepTutorialEnergy(before: PetSave, after: PetSave): PetSave {
  if (currentStep(before) === null) return after
  if (after.stats.energy === before.stats.energy) return after
  return { ...after, stats: { ...after.stats, energy: before.stats.energy } }
}

/** 스킵할 수 있는가. 0~1단계(부화·이름)는 건너뛸 수 없다(§9). */
export function canSkip(save: PetSave): boolean {
  return !save.tutorial.done && save.tutorial.step >= TUTORIAL_START_STEP
}

/**
 * 스킵. 남은 단계를 건너뛰고 완료 보상까지 정산한다.
 *
 * **남은 진입 지급도 전부 준다.** 스킵은 "안내를 안 보겠다"는 뜻이지 "빈손으로
 * 시작하겠다"는 뜻이 아니다. 사과와 코인은 안내에 대한 보상이 아니라 게임을
 * 시작할 밑천이고, 그것 없이 나가면 코인 0 · 음식 0 인 채로 첫 배고픔에서 막힌다.
 * 안내를 건너뛴 사람일수록 막혔을 때 이유를 짐작하기 어렵다.
 *
 * 이미 지나온 단계의 지급은 다시 주지 않는다. 지금 단계 **다음**부터 훑기 때문에
 * 3단계에서 스킵해도 사과가 3개 더 늘지 않는다.
 */
export function skip(save: PetSave): PetSave {
  if (!canSkip(save)) return save

  let next = save
  for (let id = save.tutorial.step + 1; id < TUTORIAL_STEPS.length; id += 1) {
    next = applyEntryGrant(next, id)
  }
  return complete(next)
}

// ────────────────────────────────────────────────────────────────────────────
// 내부
// ────────────────────────────────────────────────────────────────────────────

/** 그 단계에 들어갈 때 쥐여 주는 것. 해당 없는 단계면 입력을 그대로 돌려준다. */
function applyEntryGrant(save: PetSave, step: number): PetSave {
  if (step === TUTORIAL_START_STEP) return grantItem(save, 'apple', TUTORIAL_APPLE_COUNT)
  if (step === SHOP_UNLOCK_STEP) return addCoins(save, TUTORIAL_START_COIN)
  return save
}

/**
 * 튜토리얼을 닫는다. 완료 보상 코인은 §7 의 획득처 목록에 있는 지급이다.
 *
 * step 을 배열 길이로 올려 두는 이유: done 만 세우고 step 을 6 에 남기면
 * "끝났는가"를 묻는 곳이 done 과 step 두 가지 답을 갖게 된다. 두 값이 같은
 * 이야기를 하게 맞춰 둔다.
 */
function complete(save: PetSave): PetSave {
  return {
    ...addCoins(save, TUTORIAL_COMPLETE_COIN),
    tutorial: { step: TUTORIAL_STEPS.length, done: true },
  }
}

function addCoins(save: PetSave, amount: number): PetSave {
  return { ...save, wallet: { ...save.wallet, coins: save.wallet.coins + amount } }
}
