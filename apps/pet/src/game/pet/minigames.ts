// 미니게임의 진입 조건과 정산 규칙. 순수 함수만 둔다 — React 도 Canvas 도 모른다.
//
// 게임이 어떻게 굴러가는지(`game/minigames/*Game.ts`)와 그 판의 결과가 세이브에
// 어떻게 반영되는지를 갈라 놓은 곳이다. 이렇게 두어야 밸런싱을 테스트로 확인할 수
// 있고, 나중에 서버가 점수를 검증하게 될 때(§13) 이 파일을 그대로 옮겨 쓸 수 있다.
//
// 수치는 한 줄도 여기 적지 않고 전부 economy.ts 에서 가져온다. 코인 상한이 화면과
// 여기 두 곳에 있으면 한쪽만 고친 채 어긋나고, 그 어긋남은 플레이로만 발견된다.
//
// **이 모듈은 시간을 다루지 않는다.** 경과 반영(applyElapsed)과 날짜 넘김에 따른
// daily 초기화는 호출자가 판 시작 전에 한 번 돌린다. 여기서 날짜를 다시 비교하면
// 초기화 규칙이 두 곳으로 갈린다(actions.ts 와 같은 이유). now 를 받는 것은
// 세이브의 lastSeenAt 을 이 순간으로 맞추기 위해서지 시간을 재기 위해서가 아니다.
//
// 근거는 docs/PET_TOWN_SPEC.md §4(스탯 0 벌칙) · §7(재화·일일 상한) · §8(보상식) 이다.

import type { PetSave } from '../types'
import type { MinigameId } from './economy'
import {
  clampStat,
  DAILY_COIN_CAP,
  DAILY_EXP_CAP,
  expForNextLevel,
  HUNGRY_COIN_FACTOR,
  levelUpReward,
  MINIGAME_ENERGY_COST,
  MINIGAME_REWARD,
} from './economy'

export interface Settlement {
  next: PetSave
  /** 실제로 지급된 코인 (배고픔 절반·일일 상한 적용 후). */
  coins: number
  /** 상한과 배고픔을 적용하기 전 원래 코인. 결과 화면이 둘을 비교해 보여준다. */
  coinsBeforeAdjust: number
  hungryHalved: boolean
  dailyCapped: boolean
  /** 실제로 지급된 EXP (일일 상한 적용 후). */
  exp: number
  /** 상한을 적용하기 전 EXP. 결과 화면이 둘을 비교해 보여준다. */
  expBeforeCap: number
  expCapped: boolean
  leveledUpTo: number | null
}

export interface PlayCheck {
  ok: boolean
  /** 못 하는 이유. 진입 가능하면 빈 문자열이다. */
  reason: string
}

/**
 * 진입 가능한지. 불가면 이유를 문장으로 돌려준다.
 *
 * **이유는 다음 행동을 알려주는 문장이어야 한다.** "에너지 부족"만 띄우면 사용자는
 * 무엇을 눌러야 이게 풀리는지 모른 채 놀이터 앞에서 멈춘다(§14 "거절도 반응인가").
 *
 * 막는 조건은 둘이다.
 *
 * **자는 중에는 못 논다.** 처음에는 이것을 방 UI 의 동선 문제로 보고 여기서
 * 빼 두었는데, 실제로는 어느 화면도 막지 않아 규칙 자체가 없는 상태였다. 그러면
 * 자면서 노는 것이 **언제나 이득**이 된다 — 자는 동안 에너지가 시간당 회복되고
 * (SLEEP_ENERGY_PER_HOUR) 배고픔·기분·청결 감소가 절반이므로(SLEEP_DECAY_FACTOR),
 * 재워 둔 채 판만 반복하면 §4 가 에너지로 걸어 둔 판수 제한이 통째로 무력해진다.
 * 조건은 canPlay 한 곳에만 둔다. 화면에서 따로 판단하면 "버튼은 눌리는데 정산이
 * 거절하는" 상태가 만들어진다.
 *
 * 순서는 잠 → 기운이다. 자고 있는데 "재워 주세요"를 띄우면 이미 한 일을 다시
 * 하라는 말이 되어 다음 행동을 알려주지 못한다.
 */
export function canPlay(save: PetSave, game: MinigameId): PlayCheck {
  if (save.sleep !== null) {
    return { ok: false, reason: '자고 있어요. 깨우고 나서 놀 수 있어요.' }
  }

  const cost = MINIGAME_ENERGY_COST[game]
  if (save.stats.energy < cost) {
    return { ok: false, reason: '기운이 부족해요. 침실에서 재워 주세요.' }
  }
  return { ok: true, reason: '' }
}

/**
 * 판이 끝난 뒤 에너지 차감과 보상 지급을 한 번에 한다. 입력을 변형하지 않는다.
 *
 * 순서가 규칙이다: 배고픔 절반(§4) → 일일 상한(§7) → EXP → 레벨업. 상한을 먼저
 * 걸고 절반을 나중에 걸면 배고픈 펫이 상한 근처에서 남은 한도를 반만 받아 가고,
 * 그 남은 한도는 그대로 사라진다. 벌칙은 버는 몫에 걸리는 것이지 한도를 태우는
 * 것이 아니다.
 *
 * **레벨업 보상 코인은 일일 상한의 대상이 아니다.** §7 의 상한은 "미니게임 합산"
 * 이고, 레벨업은 펫 상태나 반복 플레이와 무관하게 한 번만 나오는 지급이다.
 * 상한에 넣으면 상한을 채운 날 레벨이 올라도 보상이 조용히 사라진다.
 */
export function settle(save: PetSave, game: MinigameId, score: number, now: number): Settlement {
  const reward = MINIGAME_REWARD[game]

  // 1) 에너지. 판이 끝난 뒤에 뺀다 — 시작할 때 빼면 도중에 앱이 죽었을 때
  //    아무것도 못 하고 기운만 잃는다.
  const energy = clampStat(save.stats.energy - MINIGAME_ENERGY_COST[game])

  // 2) 코인. 소수는 버린다. 음수 점수가 나오는 게임은 없지만, 혹시라도 음수가
  //    들어와 지갑에서 코인이 빠져나가는 일은 막아 둔다.
  const coinsBeforeAdjust = Math.max(0, Math.floor(reward.coin(score)))

  // 3) 배고픔 0 벌칙(§4). 실수라서 정확히 0 이 아닐 수 있으므로 <= 로 본다.
  const hungryHalved = save.stats.hunger <= 0
  const afterHunger = hungryHalved
    ? Math.floor(coinsBeforeAdjust * HUNGRY_COIN_FACTOR)
    : coinsBeforeAdjust

  // 4) 일일 상한(§7). 남은 한도만큼만 주고, 잘렸으면 화면이 "오늘은 충분히 놀았어"
  //    를 띄울 수 있게 알린다. 조용히 0 코인을 주면 버그로 오해한다.
  const remaining = Math.max(0, DAILY_COIN_CAP - save.daily.coinsEarned)
  const coins = Math.min(afterHunger, remaining)
  const dailyCapped = coins < afterHunger

  // 5) 기분 0 · 배고픔 0 벌칙(§4). 코인과 달리 EXP 는 절반이 아니라 0 이고,
  //    §4 의 스탯표는 그 EXP 0 을 기분과 배고픔 **양쪽**에 건다 — 배고픔은 코인
  //    절반과 EXP 0 을 함께 받는다. 여기서도 <= 0 으로 보는 것은 위 3) 과 같은
  //    이유다(실수라서 정확히 0 이 아닐 수 있다).
  const expZeroed = save.stats.mood <= 0 || save.stats.hunger <= 0
  const expBeforeCap = expZeroed ? 0 : Math.max(0, Math.floor(reward.exp(score)))

  // 5-1) EXP 일일 상한. 코인에는 상한이 있는데 EXP 에는 없어서, §6 이 한 달로
  //      잡은 성장 곡선이 실제로는 훨씬 빨리 지나갔다. 코인과 같은 자리에서
  //      같은 방식으로 자른다. 잘렸다는 사실은 결과 화면이 알린다 — 조용히
  //      0 을 주면 버그로 오해한다(코인 상한과 같은 이유).
  const expRemaining = Math.max(0, DAILY_EXP_CAP - save.daily.expEarned)
  const exp = Math.min(expBeforeCap, expRemaining)
  const expCapped = exp < expBeforeCap

  // 6) 레벨업. actions.ts 와 같은 규칙이다 — while 로 도는 이유는 한 판에 두 레벨
  //    이상 오를 수 있기 때문이다. if 로 한 번만 올리면 남은 EXP 가 다음 필요치를
  //    넘긴 채 고여 있다가 엉뚱한 행동에서 터진다.
  let level = save.pet.level
  let carried = save.pet.exp + exp
  let levelUpCoins = 0
  let leveledUpTo: number | null = null

  for (;;) {
    const need = expForNextLevel(level)
    // need 가 0 이하이면 루프가 끝나지 않는다. 정상 세이브에서는 나올 수 없지만,
    // 손으로 고친 세이브 하나가 탭을 통째로 얼리는 것은 막아 둔다.
    if (need <= 0 || carried < need) break
    carried -= need
    level += 1
    // 보상 기준은 "도달한 레벨"이다(§6). 올리기 전 레벨로 읽으면 Lv1→2 가 50 이
    // 되어 "Lv.2 달성! +50" 처럼 두 숫자가 어긋나 보인다.
    levelUpCoins += levelUpReward(level)
    leveledUpTo = level
  }

  const next: PetSave = {
    ...save,
    pet: { ...save.pet, level, exp: carried },
    stats: { ...save.stats, energy },
    wallet: { ...save.wallet, coins: save.wallet.coins + coins + levelUpCoins },
    // 상한에 더해지는 것은 미니게임으로 번 몫뿐이다. levelUpCoins 는 넣지 않는다.
    daily: {
      ...save.daily,
      coinsEarned: save.daily.coinsEarned + coins,
      expEarned: save.daily.expEarned + exp,
    },
    lastSeenAt: now,
  }

  return {
    next,
    coins,
    coinsBeforeAdjust,
    hungryHalved,
    dailyCapped,
    exp,
    expBeforeCap,
    expCapped,
    leveledUpTo,
  }
}
