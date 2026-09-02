import { FOODS } from '../game/pet/economy'
import { FOOD_IDS } from '../game/pet/foods'
// 목록은 컴포넌트가 없는 모듈에서 만든다. 화면이 목록의 출처가 되면 형제 화면이
// 화면을 import 하게 되고, economy.ts 에서 파생된 게임 데이터가 렌더링 계층에 산다.
import { FURNITURE_IDS } from '../game/pet/furniture'
import { labelOf, priceOf } from '../game/pet/shop'
import { PROP_SPRITE_SIZE, foodIconUrl, furnitureIconUrl } from '../game/sprites'
import type { ItemId } from '../game/types'

export interface ShopScreenProps {
  coins: number
  inventory: Partial<Record<ItemId, number>>
  /**
   * 방금 산 것. 그 줄이 잠깐 반응한다.
   *
   * 산 결과 문구는 토스트가 띄우지만, 토스트는 화면 아래에 뜨고 상점 목록은
   * 길다. 어느 줄이 방금 팔렸는지가 그 줄에서 보여야 "샀다"가 읽힌다.
   */
  justBought: ItemId | null
  onBuy: (item: ItemId) => void
  onClose: () => void
}

interface ShopRowProps {
  item: ItemId
  /** 무엇에 쓰는 것인지 한 줄. 가격만으로는 사과와 빵을 고를 수 없다. */
  detail: string
  iconUrl: string
  coins: number
  owned: number
  flash: boolean
  onBuy: (item: ItemId) => void
}

/**
 * 상점의 한 줄.
 *
 * **이름도 값도 shop.ts 에서 읽는다.** FOODS·FURNITURE 를 직접 뒤지면 음식이냐
 * 가구냐를 부르는 쪽마다 다시 가르게 되고, 사는 곳과 보여주는 곳이 다른 표를
 * 보게 된다. 아이콘 크기는 에셋의 한 변이라 sprites.ts 에서 온다 — 이 줄은 음식도
 * 그리므로 배치 규칙(decor.FURNITURE_SIZE)이 아니라 스프라이트 크기가 맞다.
 */
function ShopRow({ item, detail, iconUrl, coins, owned, flash, onBuy }: ShopRowProps) {
  const label = labelOf(item)
  const price = priceOf(item)
  const short = price - coins
  const affordable = short <= 0

  return (
    <li className={flash ? 'pt-shop__row is-bought' : 'pt-shop__row'}>
      <img
        className="pt-shop__icon"
        src={iconUrl}
        alt=""
        width={PROP_SPRITE_SIZE}
        height={PROP_SPRITE_SIZE}
      />

      <div className="pt-shop__body">
        <p className="pt-shop__name">
          {label}
          {owned > 0 ? <span className="pt-shop__owned">가방 {owned}</span> : null}
        </p>
        <p className="pt-shop__detail">{detail}</p>
      </div>

      <div className="pt-shop__buy">
        <button
          type="button"
          className={affordable ? 'gj-btn gj-btn--primary pt-shop__btn' : 'gj-btn pt-shop__btn'}
          disabled={!affordable}
          onClick={() => onBuy(item)}
        >
          <span aria-hidden="true">◎</span> {price}
        </button>

        {/* 거절도 반응이다(§14). 눌리지 않는 버튼만 두면 왜 못 사는지 모른다.
            "코인이 부족해요"보다 얼마가 모자란지가 다음 행동을 정해 준다. */}
        {affordable ? null : <p className="pt-shop__short">{short} 부족</p>}
      </div>
    </li>
  )
}

/**
 * 상점(명세 §7 · §3).
 *
 * 음식 3종과 가구 9종을 한 화면에 둔다. 탭으로 나누지 않은 것은 파는 것이
 * 열두 개뿐이라서다 — 탭을 두면 가구를 사러 온 사람이 음식 탭을 먼저 보고
 * "가구가 없네" 하고 나간다.
 *
 * **가격은 priceOf 에서만 읽는다.** FOODS·FURNITURE 의 price 를 직접 읽어도 지금은
 * 같은 값이지만, 그러면 사는 곳(shop.ts)과 보여주는 곳이 다른 표를 보게 되어
 * 할인 같은 것이 붙는 순간 "표시된 값과 다르게 깎인다"가 된다.
 */
export function ShopScreen({ coins, inventory, justBought, onBuy, onClose }: ShopScreenProps) {
  return (
    <div className="pt-shop" role="dialog" aria-modal="true" aria-labelledby="pt-shop-title">
      <div className="pt-shop__panel">
        <div className="pt-shop__head">
          <h2 className="pt-shop__title" id="pt-shop-title">
            상점
          </h2>
          <span className="pt-shop__coins">
            <span aria-hidden="true">◎</span> {coins}
          </span>
        </div>

        <div className="pt-shop__scroll">
          <h3 className="pt-shop__section">음식</h3>
          <ul className="pt-shop__list">
            {FOOD_IDS.map((id) => (
              <ShopRow
                key={id}
                item={id}
                detail={`밥 +${FOODS[id].hunger}${FOODS[id].mood > 0 ? ` · 기분 +${FOODS[id].mood}` : ''}`}
                iconUrl={foodIconUrl(id)}
                coins={coins}
                owned={inventory[id] ?? 0}
                flash={justBought === id}
                onBuy={onBuy}
              />
            ))}
          </ul>

          <h3 className="pt-shop__section">가구</h3>
          <ul className="pt-shop__list">
            {FURNITURE_IDS.map((id) => (
              <ShopRow
                key={id}
                item={id}
                detail="거실에 놓을 수 있어요"
                iconUrl={furnitureIconUrl(id)}
                coins={coins}
                owned={inventory[id] ?? 0}
                flash={justBought === id}
                onBuy={onBuy}
              />
            ))}
          </ul>
        </div>

        <button type="button" className="gj-btn pt-shop__close" onClick={onClose}>
          나가기
        </button>
      </div>
    </div>
  )
}
