import { FOODS } from '../game/pet/economy'
// 목록은 game/pet/foods.ts 한 곳에서 만든다. 여기서 Object.keys 를 다시 부르면
// 검사되지 않는 단언이 화면마다 한 벌씩 생긴다(그 파일의 주석 참조).
import { FOOD_IDS } from '../game/pet/foods'
import type { FoodId, ItemId } from '../game/types'

export interface InventorySheetProps {
  inventory: Partial<Record<ItemId, number>>
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
export function InventorySheet({ inventory, onPick, onClose }: InventorySheetProps) {
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
          <p className="pt-sheet__empty">
            가방이 비었어요. 음식은 상점에서 살 수 있게 되는데, 상점은 아직 열리지 않았어요.
          </p>
        )}

        <button type="button" className="gj-btn gj-btn--ghost pt-sheet__close" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
