import type { ActionId } from '../game/rooms'
import type { TutorialHighlight } from '../game/pet/tutorial'
import { highlightAttrs } from './highlight'

/** 버튼에 적히는 말. 방 정의(rooms.ts)는 무엇을 하는지만 알고 문구는 모른다. */
const LABEL: Record<ActionId, string> = {
  feed: '먹이주기',
  wash: '씻기기',
  pat: '쓰다듬기',
  sleep: '재우기',
  play: '미니게임',
  shop: '상점',
}

/**
 * 튜토리얼이 강조할 수 있는 버튼.
 *
 * 오버레이는 `data-pt-highlight` 값으로 자기 대상을 찾는다(TutorialOverlay).
 * 4·5단계가 놀이터·상점 버튼을 콕 집어 가리킨다.
 *
 * 값의 타입이 string 이 아니라 TutorialHighlight 인 것이 중요하다 — 어휘를
 * tutorial.ts 와 맞춰 두지 않으면 오타가 빌드를 통과하고 링만 사라진다.
 * 바 전체에 달아 두던 'action' 표식은 뺐다. 어느 단계도 그것을 가리키지 않아
 * 표식만 남아 있었고, 쓰이지 않는 어휘는 다음 사람에게 "쓰이는 것"으로 읽힌다.
 */
const HIGHLIGHT_OF: Partial<Record<ActionId, TutorialHighlight>> = {
  play: 'play',
  shop: 'shop',
}

export interface ActionBarProps {
  /** 지금 방에서 할 수 있는 것. rooms.ts 의 RoomDef.actions 를 그대로 받는다. */
  actions: readonly ActionId[]
  /** 자고 있으면 재우기 버튼이 깨우기로 바뀐다. 한 자리에 두 동작을 두지 않는다. */
  sleeping: boolean
  /**
   * 이 방이 아직 잠겨 있으면 그 이유. 열려 있으면 null.
   *
   * 잠긴 방으로는 애초에 넘어갈 수 없으므로(App 이 isRoomUnlocked 로 막는다)
   * 보통은 null 이다. 그래도 두는 이유: 잠금 판정이 이동 한 곳에만 있으면,
   * 나중에 "설정에서 튜토리얼 다시 보기"(§9)로 이미 들어와 있는 방이 다시
   * 잠기는 순간 **버튼은 그대로 눌린다.** 방이 잠겼다는 사실은 그 방을 그리는
   * 곳에서도 보여야 한다.
   */
  lockedReason?: string | null
  onAction: (id: ActionId) => void
  /**
   * 거실에서만 온다. 배치 모드로 들어간다.
   *
   * rooms.ts 의 actions 에 'decorate' 를 넣지 않은 것은 그 배열이 규칙 모듈
   * (actions.ts)의 돌봄 행동과 짝을 이루기 때문이다. 꾸미기는 펫을 돌보는
   * 행동이 아니라 화면 모드 전환이라, 같은 목록에 섞으면 handleAction 이
   * "돌봄이 아닌 것"을 하나씩 걸러내는 함수가 된다.
   */
  onDecorate?: () => void
}

/**
 * 방마다 다른 액션 바.
 *
 * 방을 컴포넌트로 나누지 않았으므로(rooms.ts 의 주석) 버튼도 데이터에서 만든다.
 * 방이 늘어도 여기는 그대로다.
 */
export function ActionBar({
  actions,
  sleeping,
  lockedReason,
  onAction,
  onDecorate,
}: ActionBarProps) {
  if (lockedReason) {
    return (
      <div className="pt-actions pt-actions--locked">
        <p className="pt-actions__lock" role="status">
          <span aria-hidden="true">🔒</span> {lockedReason}
        </p>
      </div>
    )
  }

  return (
    <div className="pt-actions">
      {actions.map((id) => {
        const label = id === 'sleep' && sleeping ? '깨우기' : LABEL[id]
        const highlight = HIGHLIGHT_OF[id]

        return (
          <button
            key={id}
            type="button"
            className="gj-btn gj-btn--primary pt-actions__btn"
            // 튜토리얼 중에도 이 버튼은 눌려야 한다. 2~5단계는 전부 "방으로 가서
            // 무엇을 한다"이고, 그 무엇이 여기 있다(TutorialOverlay 의 PASS_ATTR).
            data-pt-tutorial-pass=""
            {...(highlight ? highlightAttrs(highlight) : {})}
            onClick={() => onAction(id)}
          >
            <span className="pt-actions__label">{label}</span>
          </button>
        )
      })}

      {onDecorate ? (
        <button
          type="button"
          className="gj-btn pt-actions__btn pt-actions__btn--decor"
          onClick={onDecorate}
        >
          <span className="pt-actions__label">꾸미기</span>
        </button>
      ) : null}
    </div>
  )
}
