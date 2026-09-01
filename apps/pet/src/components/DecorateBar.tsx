import { FURNITURE_SIZE, MAX_PLACED } from '../game/pet/decor'
import { FURNITURE_IDS } from '../game/pet/furniture'
import { labelOf } from '../game/pet/shop'
import { furnitureIconUrl } from '../game/sprites'
import type { FurnitureId, ItemId } from '../game/types'

export interface DecorateBarProps {
  /** 가방. 개수가 0 인 가구는 화면에 나오지 않는다. */
  inventory: Partial<Record<ItemId, number>>
  /** 손에 든 가구. 방을 누르면 이게 놓인다. 없으면 null. */
  picked: FurnitureId | null
  /** 방에서 고른 가구의 인덱스. 없으면 null. */
  selected: number | null
  placedCount: number
  /** 같은 것을 다시 누르면 손에서 놓는다. 취소할 길이 없으면 갇힌다. */
  onPick: (item: FurnitureId | null) => void
  onPickUp: () => void
  onExit: () => void
}

/**
 * 지금 무엇을 하면 되는지 한 줄.
 *
 * 세 상태(고른 것 없음 · 손에 듦 · 방에서 고름)의 다음 동작이 전부 다르다.
 * 한 문장으로 뭉뚱그리면 "탭하세요"가 되어 어디를 탭하라는 것인지 사라진다.
 *
 * 손에 든 것의 이름을 문구에 넣는 이유: 아래 칩은 자리가 없어 그림만 보여준다.
 * 무엇을 들었는지는 여기서 글자로 확인된다.
 */
function hintFor(picked: FurnitureId | null, selected: number | null, empty: boolean): string {
  if (picked !== null) return `${labelOf(picked)} 들었어요 — 방을 눌러 놓아요`
  if (selected !== null) return '끌어서 옮기거나, 집어서 가방에 되돌려요'
  if (empty) return '가방에 가구가 없어요. 상점에서 살 수 있어요'
  return '가구를 고르고 방을 눌러요. 놓인 것은 끌어서 옮겨요'
}

/**
 * 거실 배치 모드의 조작 바.
 *
 * **높이가 이 컴포넌트의 제약이다.** 논리 해상도가 360×640 이라 화면 배율은 정수
 * 2 냐 1 이냐로만 갈리고(§11), 375×812 기기에서 스테이지가 640 CSS 아래로
 * 내려가는 순간 방이 절반 크기로 그려진다(§14 의 M2 기록). 셸의 푸터 여백까지
 * 더하면 여기에 쓸 수 있는 높이는 **46px 남짓**이다. 그래서 한 줄로 짜고, 칩에는
 * 이름 대신 그림만 넣고, 안내 문구는 위쪽으로 띄워 높이를 차지하지 않게 한다.
 *
 * 이 컴포넌트는 배치 규칙을 모른다. 상한(MAX_PLACED)은 decor.ts 에서 읽어
 * 보여주기만 하고, 놓을 수 있는지의 판정과 거절 문구는 place() 가 만든다.
 */
export function DecorateBar({
  inventory,
  picked,
  selected,
  placedCount,
  onPick,
  onPickUp,
  onExit,
}: DecorateBarProps) {
  const owned = FURNITURE_IDS.filter((id) => (inventory[id] ?? 0) > 0)
  const full = placedCount >= MAX_PLACED

  return (
    <div className="pt-decor">
      {/* 흐름에서 빼서 캔버스 위에 띄운다. 여기 높이를 차지하면 방 배율이
          한 단계 내려간다(위 주석). */}
      <div className="pt-decor__float">
        <span className="pt-decor__badge">꾸미는 중</span>
        <span className="pt-decor__count">
          {placedCount}/{MAX_PLACED}
        </span>
        <span className="pt-decor__hint" role="status">
          {full ? `가구는 ${MAX_PLACED}개까지예요` : hintFor(picked, selected, owned.length === 0)}
        </span>
      </div>

      {owned.length > 0 ? (
        <ul className="pt-decor__bag">
          {owned.map((id) => {
            const held = picked === id
            const count = inventory[id] ?? 0

            return (
              <li key={id}>
                <button
                  type="button"
                  className={held ? 'pt-decor__chip is-held' : 'pt-decor__chip'}
                  // 방이 꽉 찼으면 고를 수 없다. 이유는 위 문구가 말한다 —
                  // 눌러 보고 거절당하는 것보다 고르기 전에 아는 편이 낫다.
                  disabled={full && !held}
                  aria-pressed={held}
                  // 칩에 이름을 적을 자리가 없다. 읽어 주는 쪽에는 남겨야 한다.
                  aria-label={`${labelOf(id)} ${count}개`}
                  onClick={() => onPick(held ? null : id)}
                >
                  {/* 크기는 배치 규칙이 정한 한 칸(decor.ts)이다. 칩에 보이는
                      크기와 방에 놓이는 크기가 갈리면 무엇을 드는지가 어긋난다. */}
                  <img
                    src={furnitureIconUrl(id)}
                    alt=""
                    width={FURNITURE_SIZE}
                    height={FURNITURE_SIZE}
                  />
                  <span className="pt-decor__chipCount">{count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="pt-decor__empty">가방이 비었어요</p>
      )}

      <button
        type="button"
        className="gj-btn pt-decor__pickup"
        disabled={selected === null}
        onClick={onPickUp}
      >
        집기
      </button>

      <button type="button" className="gj-btn gj-btn--primary pt-decor__exit" onClick={onExit}>
        완료
      </button>
    </div>
  )
}
