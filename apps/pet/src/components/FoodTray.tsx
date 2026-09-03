import type { PointerEvent as ReactPointerEvent } from 'react'

import type { FoodId } from '../game/types'
import { FOODS } from '../game/pet/economy'
import { FOOD_IDS } from '../game/pet/foods'
import { foodIconUrl } from '../game/sprites'

export interface FoodTrayProps {
  /** 가방에 든 개수. 0 개인 음식은 흐리게 두고 끌 수 없다. */
  counts: Partial<Record<FoodId, number>>
  /** 지금 끌고 있는 음식. 트레이에서는 자리만 비워 둔다. */
  dragging: FoodId | null
  onDragStart: (food: FoodId, event: ReactPointerEvent<HTMLElement>) => void
  /** 포인터를 잡은 곳이 이 항목이라 이동·놓기도 여기로 온다. */
  onDragMove: (event: ReactPointerEvent<HTMLElement>) => void
  onDragEnd: (event: ReactPointerEvent<HTMLElement>) => void
}

/**
 * 주방 바닥에 깔리는 음식 트레이.
 *
 * 예전에는 "먹이주기" 버튼 → 시트 열기 → 음식 고르기 → 닫기 였다. 세 번을
 * 눌러야 한 번 먹였고, 그 사이에 펫은 화면에서 가려져 있었다. 육성 게임에서
 * 제일 자주 하는 행동이 제일 번거로웠던 셈이다.
 *
 * 지금은 여기서 곧바로 펫에게 끌어다 놓는다. 먹이는 동안 펫이 계속 보이고,
 * 무엇을 주는지가 손끝에 남는다.
 *
 * **버튼이 아니라 `<li>` 다.** 끌기가 주 조작이라 버튼으로 두면 브라우저가
 * 클릭·포커스 링·드래그 시작을 서로 다르게 처리해 손끝이 어긋난다. 대신
 * 키보드로도 쓸 수 있게 액션 바의 "먹이주기"를 남겨 두었다(App.tsx).
 */
export function FoodTray({ counts, dragging, onDragStart, onDragMove, onDragEnd }: FoodTrayProps) {
  const owned = FOOD_IDS.filter((id) => (counts[id] ?? 0) > 0)

  if (owned.length === 0) {
    return <p className="pt-tray__empty">가방이 비었어요. 상점에서 음식을 사 오세요.</p>
  }

  return (
    <ul className="pt-tray" aria-label="가방 속 음식. 펫에게 끌어다 놓으세요.">
      {owned.map((id) => (
        <li
          key={id}
          className="pt-tray__item"
          data-dragging={dragging === id ? 'true' : undefined}
          onPointerDown={(event) => onDragStart(id, event)}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          /* 이름은 화면에 적지 않는다. 이 바는 46px 을 넘으면 캔버스 배율이
             2 에서 1 로 떨어져 방이 절반 크기가 된다(App.css 의 배치 바 주석).
             그림만으로 무엇인지 알 수 있으므로 이름은 읽어 주기용으로 남긴다. */
          aria-label={`${FOODS[id].label} ${counts[id] ?? 0}개`}
        >
          <img className="pt-tray__icon" src={foodIconUrl(id)} alt="" draggable={false} />
          <span className="pt-tray__count">{counts[id]}</span>
        </li>
      ))}
    </ul>
  )
}
