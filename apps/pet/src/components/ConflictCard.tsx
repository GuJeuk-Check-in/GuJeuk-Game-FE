import { useState } from 'react'
import type { ConflictChoice, ConflictSide, ConflictWhen } from '../usePet'

export interface ConflictCardProps {
  when: ConflictWhen
  /** 이 기기 세이브의 요약. */
  local: ConflictSide
  /** 서버 세이브의 요약. **읽지 못했으면 null** 이고, 그때는 가져올 수 없다. */
  server: ConflictSide | null
  petName: string
  onChoose: (choice: ConflictChoice) => Promise<void>
}

/**
 * 언제 논 것인지 사람 말로.
 *
 * 기기 시계가 틀렸을 수 있다는 것을 알면서도 보여주는 이유는 **다른 근거를 함께
 * 주기 때문이다** — 레벨과 코인이 옆에 붙어 있어 시각만으로 고를 일이 없다.
 */
function when(ms: number): string {
  return new Date(ms).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Side({ label, side }: { label: string; side: ConflictSide }) {
  return (
    <li className="pt-conflict__row">
      <span className="pt-conflict__side">{label}</span>
      <span className="pt-conflict__stat">
        Lv.{side.level} · <span aria-hidden="true">◎</span>
        <span className="pt-conflict__sr">코인 </span>
        {side.coins}
      </span>
      <span className="pt-conflict__when">{when(side.at)}</span>
    </li>
  )
}

/**
 * 로컬과 서버가 갈라졌다. **자동으로 합치지 않는다**(PET_SERVER_API.md §5).
 *
 * 어느 쪽이 최신인지 서버도 코드도 판단하지 않는다. 판단 근거가 될 값은
 * `lastSeenAt` 하나인데 그것은 클라이언트가 보낸 것이고, 기기 시계는 틀릴 수
 * 있다. 조용히 한쪽을 고르면 **틀렸을 때 사라진 쪽을 되돌릴 방법이 없다.**
 *
 * 그래서 이 카드는 닫을 수 없다. 고르는 것 말고 할 일이 없는 화면이다.
 */
export function ConflictCard({ when: where, local, server, petName, onChoose }: ConflictCardProps) {
  const [busy, setBusy] = useState<ConflictChoice | null>(null)

  const choose = (choice: ConflictChoice) => {
    if (busy) return
    setBusy(choice)
    void onChoose(choice).finally(() => setBusy(null))
  }

  return (
    <div
      className="pt-conflict"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pt-conflict-title"
    >
      <div className="pt-conflict__sheet">
        <h2 className="pt-conflict__title" id="pt-conflict-title">
          진행이 두 벌이에요
        </h2>

        <p className="pt-conflict__lead">
          {where === 'load'
            ? `${petName}의 진행이 이 기기와 서버에 서로 다르게 남아 있어요.`
            : `${petName}의 진행을 올리려는데 서버에 더 최근 기록이 있어요.`}
        </p>

        <ul className="pt-conflict__list">
          <Side label="이 기기" side={local} />
          {server ? (
            <Side label="서버" side={server} />
          ) : (
            <li className="pt-conflict__row is-broken">
              <span className="pt-conflict__side">서버</span>
              <span className="pt-conflict__when">읽을 수 없어요</span>
            </li>
          )}
        </ul>

        <div className="pt-conflict__buttons">
          <button
            className="gj-btn gj-btn--primary"
            type="button"
            onClick={() => choose('mine')}
            disabled={busy !== null}
          >
            {busy === 'mine' ? '올리는 중…' : '이 기기 것으로 할래요'}
          </button>
          {/* 읽지 못한 세이브는 가져올 수 없다. 눌러 보고 나서 실패하는 것보다
              처음부터 닫아 두는 편이 낫다 — 그 사이에 사람은 이미 잃었다고 믿는다. */}
          <button
            className="gj-btn"
            type="button"
            onClick={() => choose('theirs')}
            disabled={busy !== null || server === null}
          >
            {busy === 'theirs' ? '가져오는 중…' : '서버 것을 가져올래요'}
          </button>
        </div>

        {/* 고르면 다른 쪽이 사라진다는 것을 미리 말한다. 되돌릴 수 없는 선택은
            누른 뒤에 알려 주면 늦다. */}
        <p className="pt-conflict__note">
          {server === null
            ? '서버에 있는 세이브를 읽지 못했어요. 이 기기 것으로 덮어쓸 수 있습니다.'
            : '고르지 않은 쪽은 덮어써져요. 기기마다 시계가 다를 수 있으니 레벨과 코인을 보고 골라 주세요.'}
        </p>
      </div>
    </div>
  )
}
