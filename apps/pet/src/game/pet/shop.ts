// 상점의 규칙. 순수 함수만 둔다 — React 도 Canvas 도 모른다.
//
// 가격은 한 줄도 여기 적지 않고 전부 economy.ts 의 FOODS · FURNITURE 에서 읽는다.
// 상점 화면이 자기 가격표를 따로 들면 밸런싱을 고칠 때 한쪽만 바뀌고, 그 어긋남은
// "표시된 가격과 실제로 빠진 코인이 다르다"는 형태로만 발견된다.
//
// **이 모듈은 시간을 다루지 않는다.** actions.ts · minigames.ts 와 달리 now 를
// 받지 않는 것은 계약이 그렇게 정해져서이기도 하지만, 구매가 스탯·경과와 아무
// 관계가 없기 때문이다. lastSeenAt 갱신과 저장은 호출자가 한다.
//
// **구매로는 EXP 가 나오지 않는다.** §4 의 회복 수단 표에 EXP 가 붙는 것은 돌봄
// 행동이고, 코인은 §7 대로 미니게임·출석·레벨업·튜토리얼에서만 들어온다. 사고
// 파는 것만으로 레벨이 오르면 미니게임을 돌 이유가 사라진다.
//
// 근거는 docs/PET_TOWN_SPEC.md §7(재화) · §9(튜토리얼 5단계) 이다.

import type { FoodId, FurnitureId, ItemId, PetSave } from '../types'
import { FOODS, FURNITURE } from './economy'

export interface PurchaseOutcome {
  /** 새 세이브. 입력을 변형하지 않는다. */
  next: PetSave
  /** 실제로 샀는가. false 면 거절이고 next 는 save 와 같다. */
  changed: boolean
  /** 화면에 한 줄로 띄울 말. 거절이면 얼마가 모자란지가 들어간다. */
  message: string
}

/**
 * 음식인지 가구인지 값으로 판정한다.
 *
 * ItemId 는 타입이라 런타임에 남지 않으므로, 어느 표를 볼지는 표 자체에 키가
 * 있는지로 정해야 한다. 카탈로그에 물건을 추가해도 여기를 고칠 필요가 없다는
 * 것이 목록을 따로 적지 않은 이유다.
 *
 * **내보내지 않는다.** 바깥에서 부르는 곳이 없고(화면은 음식·가구 목록을 이미
 * 갈라 갖고 있다), 쓰이지 않는 export 는 "이렇게 쓰라"는 잘못된 신호가 된다.
 * 이 판정이 맞는지는 priceOf·labelOf 를 통해 테스트가 확인한다.
 */
function isFood(item: ItemId): item is FoodId {
  return Object.prototype.hasOwnProperty.call(FOODS, item)
}

function isFurniture(item: ItemId): item is FurnitureId {
  return Object.prototype.hasOwnProperty.call(FURNITURE, item)
}

/**
 * 화면 문구용 이름. 표가 두 개라 부르는 쪽마다 분기하지 않도록 여기서 합친다.
 *
 * 상점 줄과 꾸미기 바가 이것을 쓴다 — FOODS[id].label 과 FURNITURE[id].label 을
 * 화면이 직접 뒤지면 이름을 읽는 경로가 화면 수만큼 생긴다.
 */
export function labelOf(item: ItemId): string {
  if (isFood(item)) return FOODS[item].label
  if (isFurniture(item)) return FURNITURE[item].label
  throw new Error(`[shop] 이름을 알 수 없는 물건: ${String(item)}`)
}

/**
 * 값. 음식이면 FOODS, 가구면 FURNITURE 에서 읽는다.
 *
 * 어느 표에도 없으면 0 을 돌려주지 않고 **던진다.** 0 으로 돌려주면 카탈로그에서
 * 빠진 물건이 공짜가 되고, 그 사실은 누군가 무한히 사 간 뒤에야 드러난다.
 * 세이브에 든 값은 save.ts 가 이미 걸러 주므로, 여기까지 온 미지의 id 는 코드
 * 쪽 실수다 — 조용히 넘기지 말고 개발 중에 터뜨리는 편이 싸다.
 */
export function priceOf(item: ItemId): number {
  if (isFood(item)) return FOODS[item].price
  if (isFurniture(item)) return FURNITURE[item].price
  throw new Error(`[shop] 값을 매길 수 없는 물건: ${String(item)}`)
}

/**
 * 코인을 깎고 가방에 한 개 넣는다. 입력을 변형하지 않는다.
 *
 * **같은 물건을 몇 개든 살 수 있다.** 이미 가진 가구를 막지 않는 이유는 같은
 * 가구를 방에 두 개 놓을 수 있어야 하기 때문이다(화분 두 개가 자연스러운 배치다).
 *
 * 거절 문구에는 **얼마가 모자란지**를 넣는다. "코인이 부족해요"만 띄우면 얼마를
 * 더 벌어야 하는지 몰라 상점 앞에서 멈춘다(§14 "거절도 반응인가").
 */
export function buy(save: PetSave, item: ItemId): PurchaseOutcome {
  const price = priceOf(item)
  const coins = save.wallet.coins

  if (coins < price) {
    const short = price - coins
    return { next: save, changed: false, message: `코인이 ${short} 모자라요.` }
  }

  const next: PetSave = {
    ...save,
    wallet: { ...save.wallet, coins: coins - price },
    // 0 으로 남아 있던 키에도 그대로 더한다. actions.ts 의 feed 가 다 쓴 음식의
    // 키를 지우지 않고 0 으로 남겨 두기 때문이다.
    inventory: { ...save.inventory, [item]: (save.inventory[item] ?? 0) + 1 },
  }

  return { next, changed: true, message: `${labelOf(item)} 샀어요. (-${price}코인)` }
}
