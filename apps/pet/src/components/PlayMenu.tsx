import { MINIGAME_ENERGY_COST } from '../game/pet/economy'
import type { MinigameId } from '../game/pet/economy'

/**
 * 메뉴 한 줄.
 *
 * **막힌 이유를 화면이 짓지 않고 받아 온다.** 진입 조건은 canPlay 한 곳에만 있고
 * (game/pet/minigames.ts), 여기서 에너지를 다시 비교하면 규칙이 두 벌로 갈려
 * "버튼은 눌리는데 정산이 거절하는" 상태가 만들어진다.
 */
export interface PlayMenuItem {
  id: MinigameId
  label: string
  hint: string
  ok: boolean
  reason: string
}

export interface PlayMenuProps {
  items: readonly PlayMenuItem[]
  /**
   * 이번 판이 에너지를 소모하지 않는가(튜토리얼 중, §9).
   *
   * 면제되는데도 "기운 -12" 를 그대로 띄우면 화면이 깎이지 않을 값을 예고한다.
   * 판정은 tutorial.ts 가 하고 여기는 결과만 받는다 — 메뉴가 단계를 세면 면제
   * 규칙이 두 벌이 된다(위 PlayMenuItem 주석과 같은 이유다).
   */
  energyFree: boolean
  onPick: (game: MinigameId) => void
  onClose: () => void
}

/**
 * 놀이터에서 미니게임을 고르는 화면.
 *
 * **에너지 비용을 고르기 전에 보여준다.** 명세 §7 의 에너지 예산(100 에서 8판
 * 남짓)은 사용자가 남은 판수를 셀 수 있어야 성립하는데, 들어가 보고 나서야
 * 얼마가 깎이는지 알게 되면 그 계산을 할 수가 없다.
 */
export function PlayMenu({ items, energyFree, onPick, onClose }: PlayMenuProps) {
  return (
    <div className="pt-play" role="dialog" aria-modal="true" aria-labelledby="pt-play-title">
      <div className="pt-play__sheet">
        <h2 className="pt-play__title" id="pt-play-title">
          뭐 하고 놀까?
        </h2>

        <ul className="pt-play__list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.ok ? 'gj-btn gj-btn--primary pt-play__btn' : 'gj-btn pt-play__btn'}
                disabled={!item.ok}
                onClick={() => onPick(item.id)}
              >
                <span className="pt-play__row">
                  <span className="pt-play__label">{item.label}</span>
                  {/* 비용은 오른쪽 끝에 세로로 맞춰 세 게임을 한눈에 비교하게 둔다. */}
                  <span className="pt-play__cost">
                    {energyFree ? '기운 그대로' : `기운 -${MINIGAME_ENERGY_COST[item.id]}`}
                  </span>
                </span>
                <span className="pt-play__hint">{item.hint}</span>
              </button>

              {/* 거절도 반응이다(명세 §14). 눌리지 않는 버튼만 두면 왜 안 되는지 모른다. */}
              {item.ok ? null : (
                <p className="pt-play__reason" role="status">
                  {item.reason}
                </p>
              )}
            </li>
          ))}
        </ul>

        <button type="button" className="gj-btn pt-play__close" onClick={onClose}>
          돌아가기
        </button>
      </div>
    </div>
  )
}
