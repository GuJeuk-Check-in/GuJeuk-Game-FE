import { FOODS } from '../game/pet/economy'
// 목록은 game/pet/foods.ts 한 곳에서 만든다. 여기서 Object.keys 를 다시 부르면
// 검사되지 않는 단언이 화면마다 한 벌씩 생긴다(그 파일의 주석 참조).
import { FOOD_IDS } from '../game/pet/foods'
import type { FoodId, ItemId } from '../game/types'

export interface InventorySheetProps {
  inventory: Partial<Record<ItemId, number>>
  /**
   * 상점이 열려 있는가(§3 의 튜토리얼 5단계 해금).
   *
   * 빈 가방 문구가 갈리는 유일한 이유다. 판정은 tutorial.ts 의 isRoomUnlocked
   * 한 곳에서 하고 여기는 결과만 받는다 — 시트가 단계를 세면 해금 규칙이 두 벌이 된다.
   */
  shopUnlocked: boolean
  /** 고른 음식을 먹인다. 고른 순간 시트는 닫힌다. */
  onPick: (food: FoodId) => void
  onClose: () => void
}

/**
 * 무엇을 먹일지 고르는 시트.
 *
 * 먹이주기 버튼이 곧바로 사과를 먹이게 하지 않는다. 인벤토리에 음식이 여럿이면
 * 어느 것이 줄었는지 알 수 없고, 비싼 케이크가 말없이 사라지는 사고가 난다.
 *
 * **가진 게 없으면 그 사실을 그대로 보여준다.** 빈 시트를 띄우거나 버튼을
 * 비활성으로만 두면 "음식이 없다"는 것과 "기능이 고장 났다"를 구분할 수 없다.
 */
export function InventorySheet({ inventory, shopUnlocked, onPick, onClose }: InventorySheetProps) {
  const owned = FOOD_IDS.filter((id) => (inventory[id] ?? 0) > 0)

  return (
    <div
      className="pt-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pt-sheet-title"
      // 바깥을 눌러 닫는다. 시트 안쪽 클릭은 여기까지 올라오지 않게 막는다.
      onClick={onClose}
    >
      <div className="pt-sheet__panel" onClick={(event) => event.stopPropagation()}>
        <h2 className="pt-sheet__title" id="pt-sheet-title">
          무엇을 먹일까요?
        </h2>

        {owned.length > 0 ? (
          <ul className="pt-sheet__list">
            {owned.map((id) => {
              const food = FOODS[id]
              const count = inventory[id] ?? 0

              return (
                <li key={id}>
                  <button
                    type="button"
                    className="gj-btn pt-sheet__item"
                    onClick={() => onPick(id)}
                  >
                    <span className="pt-sheet__food">{food.label}</span>
                    <span className="pt-sheet__effect">
                      밥 +{food.hunger}
                      {food.mood > 0 ? ` · 기분 +${food.mood}` : ''}
                    </span>
                    <span className="pt-sheet__count">{count}개</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          // 다음에 무엇을 하면 되는지를 정확히 말한다(§14 "거절도 반응인가").
          // 상점은 튜토리얼 5단계에 열리므로, 열린 뒤에도 "아직 열리지 않았어요"를
          // 띄우면 화면이 사실과 반대되는 말을 한다.
          <p className="pt-sheet__empty">
            {shopUnlocked
              ? '가방이 비었어요. 상점에서 음식을 살 수 있어요.'
              : '가방이 비었어요. 튜토리얼을 조금 더 진행하면 상점이 열려요.'}
          </p>
        )}

        <button type="button" className="gj-btn gj-btn--ghost pt-sheet__close" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
