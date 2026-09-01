import type { ActionId } from '../game/rooms'

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
 * 아직 만들지 않은 것들(M3 미니게임 · M4 상점).
 *
 * 버튼을 감추지 않고 비활성으로 남기는 이유: 방은 이미 여섯 개고 좌우로 넘기면
 * 놀이터와 상점이 나온다. 그 방에 아무것도 없으면 "고장 났나"로 읽힌다.
 * 대신 **눌리게 두지는 않는다** — 눌러서 아무 일도 없는 것이 제일 나쁘다.
 */
const COMING_SOON: readonly ActionId[] = ['play', 'shop']

export interface ActionBarProps {
  /** 지금 방에서 할 수 있는 것. rooms.ts 의 RoomDef.actions 를 그대로 받는다. */
  actions: readonly ActionId[]
  /** 자고 있으면 재우기 버튼이 깨우기로 바뀐다. 한 자리에 두 동작을 두지 않는다. */
  sleeping: boolean
  onAction: (id: ActionId) => void
}

/**
 * 방마다 다른 액션 바.
 *
 * 방을 컴포넌트로 나누지 않았으므로(rooms.ts 의 주석) 버튼도 데이터에서 만든다.
 * 방이 늘어도 여기는 그대로다.
 */
export function ActionBar({ actions, sleeping, onAction }: ActionBarProps) {
  return (
    <div className="pt-actions">
      {actions.map((id) => {
        const soon = COMING_SOON.includes(id)
        const label = id === 'sleep' && sleeping ? '깨우기' : LABEL[id]

        return (
          <button
            key={id}
            type="button"
            className={soon ? 'gj-btn pt-actions__btn' : 'gj-btn gj-btn--primary pt-actions__btn'}
            disabled={soon}
            onClick={() => onAction(id)}
          >
            <span className="pt-actions__label">{label}</span>
            {soon ? <span className="pt-actions__soon">곧 열려요</span> : null}
          </button>
        )
      })}
    </div>
  )
}
