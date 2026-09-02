// FOODS 에서 파생되는 음식 목록.
//
// 화면 두 곳(가방 시트 · 개발용 지급 버튼)이 같은 목록을 필요로 한다. 각자
// Object.keys 를 부르면 아래의 단언도 두 벌이 되고, 한쪽만 고쳐진 채로 갈린다.
// 컴포넌트가 없는 모듈에 두는 것은 react-refresh 규칙이 컴포넌트를 함께
// export 하는 파일에만 걸리기 때문이다 — 여기서는 목록을 그냥 내보내면 된다.

import { FOODS } from './economy'
import type { FoodId } from '../types'

/**
 * 음식 id 목록. 순서는 economy.ts 의 FOODS 에 적힌 순서(싼 것부터)다.
 *
 * 목록을 손으로 다시 적지 않는다. 음식이 하나 늘었을 때 여기를 빠뜨리면 그
 * 음식은 가방에 들어 있어도 영영 보이지 않고, 그건 화면만 봐서는 원인을 못 찾는다.
 *
 * **단언은 Object.keys 의 한계(늘 string[] 을 준다)만 메운다.** FOODS 의 키가
 * 전부 FoodId 라는 것은 좌변의 타입 표기가 검사한다 — economy.ts 의
 * `satisfies Record<string, FoodSpec>` 는 값이 FoodSpec 인지만 보고 키는 보지
 * 않으므로, 여기서 검사하지 않으면 FoodId 에 없는 음식이 FoodId 로 둔갑해
 * feed() 까지 흘러간다.
 */
export const FOOD_IDS: readonly FoodId[] = Object.keys(FOODS) as (keyof typeof FOODS)[]
