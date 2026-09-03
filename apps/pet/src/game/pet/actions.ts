// 돌봄 행동의 규칙. 순수 함수만 둔다 — React 도 Canvas 도 모른다.
//
// 수치는 한 줄도 여기 적지 않고 전부 economy.ts 에서 가져온다. 밸런싱의 출처가
// 두 곳이 되면 한쪽만 고친 채로 어긋나고, 그 어긋남은 플레이로만 발견된다.
//
// **이 모듈은 시간을 다루지 않는다.** 경과 반영(applyElapsed)은 호출자가 액션
// 직전에 한 번 돌린다. 여기서 경과를 다시 계산하면 같은 시간이 두 번 반영된다.
// now 를 받는 것은 "잠든 시각"을 적고 세이브의 lastSeenAt 을 이 순간으로
// 맞추기 위해서지, 얼마나 흘렀는지를 재기 위해서가 아니다.
//
// 근거는 docs/PET_TOWN_SPEC.md §4(회복 수단) · §6(레벨) 이다.

import type { FoodId, ItemId, PetSave } from '../types'
import {
  clampStat,
  expForNextLevel,
  FOODS,
  levelUpReward,
  OVERCLEAN_EXP_THRESHOLD,
  OVEREAT_EXP_THRESHOLD,
  PET_DAILY_LIMIT,
  PET_EXP,
  PET_MOOD_GAIN,
  STAT_MAX,
  WAKE_EXP,
  WASH_EXP,
} from './economy'

export interface ActionOutcome {
  /** 새 세이브. 입력을 변형하지 않는다. */
  next: PetSave
  /** 실제로 무언가 바뀌었는가. false 면 거절이고 next 는 save 와 같다. */
  changed: boolean
  /** 화면에 한 줄로 띄울 말. 거절이면 이유가 들어간다. */
  message: string
  expGained: number
  /** 이번 행동으로 레벨이 올랐으면 새 레벨, 아니면 null. */
  leveledUpTo: number | null
}

// ────────────────────────────────────────────────────────────────────────────
// 행동
// ────────────────────────────────────────────────────────────────────────────

/**
 * 인벤토리에서 한 개를 꺼내 먹인다.
 *
 * 과식(포만감 OVEREAT_EXP_THRESHOLD 이상)이면 스탯만 오르고 EXP 는 0 이다.
 * 먹이기 **전** 값으로 판정한다 — 먹인 뒤 값으로 재면 사과 하나로 90 을 넘는
 * 순간부터 판정이 뒤집혀, 배고픈 펫에게 준 첫 끼가 과식이 되어 버린다(§4).
 */
export function feed(save: PetSave, food: FoodId, now: number): ActionOutcome {
  const spec = FOODS[food]
  const count = save.inventory[food] ?? 0
  if (count < 1) return reject(save, `${subject(spec.label)} 없어요. 상점에서 살 수 있어요.`)

  const overeat = save.stats.hunger >= OVEREAT_EXP_THRESHOLD

  const fed: PetSave = {
    ...save,
    stats: {
      ...save.stats,
      hunger: clampStat(save.stats.hunger + spec.hunger),
      mood: clampStat(save.stats.mood + spec.mood),
      // 대부분의 음식은 0 이다. 우유·치즈만 조금 준다(economy.ts 의 FoodSpec).
      energy: clampStat(save.stats.energy + spec.energy),
    },
    // 0 이 되어도 키를 지우지 않는다. 남겨 두면 화면이 "사과 0개"를 그대로 그릴
    // 수 있고, 키가 사라졌다 생겼다 하는 인벤토리는 비교하기 까다롭다.
    inventory: { ...save.inventory, [food]: count - 1 },
  }

  const message = overeat
    ? `배부른데도 ${object(spec.label)} 먹었어요. 경험치는 없어요.`
    : `${object(spec.label)} 맛있게 먹었어요!`

  return settle(fed, overeat ? 0 : spec.exp, message, now)
}

/**
 * 씻긴다. 청결은 부분 회복이 아니라 100 으로 간다(§4 의 "청결 100").
 *
 * 이미 깨끗하면(OVERCLEAN_EXP_THRESHOLD 이상) EXP 가 0 이다. 없으면 씻기 연타가
 * 무료 EXP 자판기가 된다.
 */
export function wash(save: PetSave, now: number): ActionOutcome {
  const overclean = save.stats.clean >= OVERCLEAN_EXP_THRESHOLD

  const washed: PetSave = {
    ...save,
    stats: { ...save.stats, clean: STAT_MAX },
  }

  const message = overclean ? '이미 깨끗했어요. 경험치는 없어요.' : '뽀득뽀득! 아주 깨끗해졌어요.'

  return settle(washed, overclean ? 0 : WASH_EXP, message, now)
}

/**
 * 쓰다듬는다. 하루 PET_DAILY_LIMIT 회까지.
 *
 * 횟수는 save.daily.pets 에 센다. 날짜 넘김으로 이 값을 0 으로 되돌리는 것은
 * applyElapsed 의 일이다 — 여기서 날짜를 비교하면 초기화 규칙이 두 곳으로 갈린다.
 */
export function pat(save: PetSave, now: number): ActionOutcome {
  if (save.daily.pets >= PET_DAILY_LIMIT) {
    return reject(save, '오늘은 충분히 쓰다듬었어요. 내일 또 해요.')
  }

  const pets = save.daily.pets + 1

  const patted: PetSave = {
    ...save,
    stats: { ...save.stats, mood: clampStat(save.stats.mood + PET_MOOD_GAIN) },
    daily: { ...save.daily, pets },
  }

  return settle(patted, PET_EXP, `쓰다듬어 줬어요. (오늘 ${pets}/${PET_DAILY_LIMIT})`, now)
}

/**
 * 재운다. EXP 는 여기서 주지 않는다 — 기상 시에 한 번 준다(§4).
 *
 * 재우자마자 주면 재우고 곧바로 깨우는 것이 최적 전략이 되고, 에너지 회복이라는
 * 원래 목적과 관계없는 행동이 이득이 된다.
 */
export function startSleep(save: PetSave, now: number): ActionOutcome {
  if (save.sleep !== null) return reject(save, '이미 자고 있어요.')

  return settle({ ...save, sleep: { since: now } }, 0, '불을 껐어요. 잘 자!', now)
}

/** 깨운다. 에너지 회복분은 applyElapsed 가 이미 넣어 두었으므로 여기서 더하지 않는다. */
export function wakeUp(save: PetSave, now: number): ActionOutcome {
  if (save.sleep === null) return reject(save, '지금은 깨어 있어요.')

  return settle({ ...save, sleep: null }, WAKE_EXP, '잘 잤어? 개운해 보여요!', now)
}

/**
 * 개발용·튜토리얼용 지급. 규칙이 아니므로 ActionOutcome 을 쓰지 않는다.
 *
 * 거절도 EXP 도 없다. 튜토리얼 2단계의 "사과 3개 지급"(§9)처럼 게임이 사용자에게
 * 그냥 쥐여 주는 경로다.
 */
export function grantItem(save: PetSave, item: ItemId, count: number): PetSave {
  return {
    ...save,
    inventory: { ...save.inventory, [item]: (save.inventory[item] ?? 0) + count },
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 공통
// ────────────────────────────────────────────────────────────────────────────

function reject(save: PetSave, message: string): ActionOutcome {
  return { next: save, changed: false, message, expGained: 0, leveledUpTo: null }
}

/**
 * 스탯·인벤토리까지 반영된 세이브에 EXP 와 레벨업 보상을 얹어 결과를 만든다.
 *
 * 레벨업을 while 로 도는 이유: 한 번에 두 레벨 이상 오를 수 있다. if 로 한 번만
 * 올리면 남은 EXP 가 다음 필요치를 넘긴 채 고여 있다가, 다음 행동에서 EXP 2 를
 * 받고 갑자기 레벨이 오르는 것처럼 보인다.
 *
 * **명세 §4 의 "스탯 0 벌칙"은 여기에 없다. 없는 것이 맞다.** 그 벌칙(배고픔 0 →
 * 코인 50% · EXP 0, 기분 0 → EXP 0)은 미니게임에서 버는 몫에만 걸기로 §4 에서
 * 못 박았고, 구현은 M3 의 미니게임 정산이다. 돌봄 EXP 까지 깎으면 굶은 펫에게 준
 * 첫 끼가 EXP 0 이 되어 §4 의 회복 수단 표와 어긋난다.
 */
function settle(base: PetSave, expGained: number, message: string, now: number): ActionOutcome {
  let level = base.pet.level
  let exp = base.pet.exp + expGained
  let coins = base.wallet.coins
  let leveledUpTo: number | null = null

  for (;;) {
    const need = expForNextLevel(level)
    // need 가 0 이하이면 루프가 끝나지 않는다. 정상 세이브에서는 나올 수 없는
    // 값이지만(레벨 1 부터 시작한다), 손으로 고친 세이브 하나가 탭을 통째로
    // 얼리는 것은 막아 둔다.
    if (need <= 0 || exp < need) break
    exp -= need
    level += 1
    // 보상 기준은 "도달한 레벨"이다. 명세 §6 의 `50 × 레벨`을 올리기 전 레벨로
    // 읽으면 Lv1→2 에 50 이 되는데, 레벨업 화면에 "Lv.2 달성! +50" 처럼 두 숫자가
    // 함께 뜨면 어긋나 보인다.
    coins += levelUpReward(level)
    leveledUpTo = level
  }

  return {
    next: {
      ...base,
      pet: { ...base.pet, level, exp },
      wallet: { ...base.wallet, coins },
      // 사용자가 화면 앞에 있었던 시각이다. 호출자가 직전에 applyElapsed 를
      // 돌리므로 값은 이미 now 지만, 액션 결과가 자기 시각을 들고 있어야
      // 저장된 세이브의 시각이 행동 순간과 어긋나지 않는다.
      lastSeenAt: now,
    },
    changed: true,
    message,
    expGained,
    leveledUpTo,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 조사
//
// "사과이(가) 없어요" 는 서류처럼 읽힌다. 받침을 보고 조사를 골라야 문장이
// 사람 말이 된다. 음식 이름이 셋뿐이라 표로 적을 수도 있지만, 가구까지 늘어나면
// 그 표를 매번 손보게 된다.
// ────────────────────────────────────────────────────────────────────────────

/** 한글 음절 영역에서 (코드 - 가) % 28 이 0 이 아니면 받침이 있다. */
function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

function subject(word: string): string {
  return `${word}${hasFinalConsonant(word) ? '이' : '가'}`
}

function object(word: string): string {
  return `${word}${hasFinalConsonant(word) ? '을' : '를'}`
}
