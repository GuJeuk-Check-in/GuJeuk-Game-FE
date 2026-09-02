import { useState } from 'react'

export interface LogoutSheetProps {
  nickname: string
  petName: string | null
  /** 성공하면 이 화면이 통째로 사라진다. 실패하면 문구를 돌려준다. */
  onConfirm: () => Promise<string | null>
  onCancel: () => void
}

/**
 * 나가기 확인.
 *
 * 확인을 한 번 받는 이유가 둘이다.
 *
 * 1. HUD 의 나가기 버튼은 작고 다른 버튼 옆에 있다. 잘못 눌러 나가면 다시
 *    로그인해야 한다.
 * 2. **지금 누구로 로그인되어 있는지를 보여주는 유일한 자리다.** 공용 기기라
 *    앞사람이 나가지 않고 자리를 뜬 경우가 있고, 그때 다음 사람은 여기서
 *    "내가 아니네"를 알아챈다.
 *
 * 나가기는 서버에 올리고 나서 로컬을 지운다(PET_SERVER_API.md §10). 올리는 데
 * 시간이 걸리므로 진행 중임을 반드시 보여준다 — 아무 반응이 없으면 한 번 더
 * 누르게 되고, 그 사이 다른 것을 누르면 그것도 세이브에 들어간다.
 */
export function LogoutSheet({ nickname, petName, onConfirm, onCancel }: LogoutSheetProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = () => {
    if (busy) return
    setBusy(true)
    setError(null)

    void onConfirm().then((message) => {
      // 성공하면 곧 언마운트되지만, 실패했을 때 다시 누를 수 있어야 한다.
      setBusy(false)
      if (message) setError(message)
    })
  }

  return (
    <div className="pt-logout" role="dialog" aria-modal="true" aria-labelledby="pt-logout-title">
      <div className="pt-logout__sheet">
        <h2 className="pt-logout__title" id="pt-logout-title">
          <strong>{nickname}</strong> 님, 나갈까요?
        </h2>

        <p className="pt-logout__lead">
          {petName === null
            ? '진행을 서버에 올리고 이 기기에서 지워요.'
            : `${petName}의 진행을 서버에 올리고 이 기기에서 지워요. 다음에 로그인하면 그대로 이어서 놀 수 있어요.`}
        </p>

        {error ? (
          <p className="pt-logout__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="gj-btn gj-btn--primary pt-logout__go"
          type="button"
          onClick={confirm}
          disabled={busy}
        >
          {busy ? '올리는 중…' : '올리고 나가기'}
        </button>
        <button className="gj-btn" type="button" onClick={onCancel} disabled={busy}>
          더 놀래요
        </button>
      </div>
    </div>
  )
}
