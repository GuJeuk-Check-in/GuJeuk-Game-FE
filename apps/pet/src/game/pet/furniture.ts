// FURNITURE 에서 파생되는 가구 목록.
//
// 화면 두 곳(상점 · 꾸미기 바)이 같은 목록을 필요로 한다. 각자 Object.keys 를
// 부르면 아래의 단언도 두 벌이 되고, 한쪽만 고쳐진 채로 갈린다.
//
// **컴포넌트 파일에 두지 않는 이유는 foods.ts 와 같다.** 예전에는 이 목록이
// ShopScreen.tsx 에 있고 DecorateBar 가 형제 컴포넌트에서 그것을 가져왔는데,
// 그러면 화면끼리 데이터 의존이 생기고 economy.ts 에서 파생된 게임 데이터가
// 렌더링 계층에 사는 것이 된다(CONVENTIONS "게임 로직은 렌더링과 분리한다").
// 컴포넌트가 없는 모듈이면 react-refresh 규칙의 예외에 기대지 않아도 된다.

import { FURNITURE } from './economy'
import type { FurnitureId } from '../types'

/**
 * 가구 id 목록. 순서는 economy.ts 의 FURNITURE 에 적힌 순서(싼 것부터)다.
 *
 * **단언은 Object.keys 의 한계(늘 string[] 을 준다)만 메운다.** FURNITURE 의 키가
 * 전부 FurnitureId 라는 것은 좌변의 타입 표기가 검사한다 — economy.ts 의
 * `satisfies Record<string, FurnitureSpec>` 는 값이 FurnitureSpec 인지만 보고
 * 키는 보지 않는다(foods.ts 의 FOOD_IDS 와 같은 이유다).
 */
export const FURNITURE_IDS: readonly FurnitureId[] = Object.keys(
  FURNITURE,
) as (keyof typeof FURNITURE)[]
