import { useEffect, useRef } from 'react'

export interface IdleWarningProps {
  /**
   * 남은 초. **null 이면 시간이 다 돼서 지금 나가는 중이다.**
   *
   * 두 상태를 한 카드가 맡는 이유는, 카드가 사라졌다 다른 것이 뜨면 그 사이에
   * 화면이 아무 말도 하지 않기 때문이다. 조작이 되는 것처럼 보이는 그 몇 초
   * 동안 사람이 무언가를 하면 그것은 어디에도 저장되지 않는다.
   */
  secondsLeft: number | null
  nickname: string
  onStay: () => void
}

/**
 * 곧 자동으로 나간다는 경고, 그리고 나가는 중이라는 알림. (PET_SERVER_API.md §12 의 4번)
 *
 * 기관에서 한 기기를 여러 사람이 번갈아 쓰므로, 나가기를 잊고 자리를 뜨면 다음
 * 사람이 앞사람 계정으로 계속 논다. 그래서 5분간 조작이 없으면 스스로 나가는데,
 * **예고 없이 튕기면 화면을 읽고 있던 사람이 무슨 일이 일어났는지 모른다.**
 * 이 게임에는 사용자가 누를 때까지 무한정 떠 있는 판이 여럿이다(결과 카드,
 * 튜토리얼, 충돌 카드).
 *
 * 경고 상태에는 닫기 버튼이 따로 없다. **아무 데나 건드리면 사라진다** — 화면을
 * 만지는 것이 곧 "여기 사람이 있다"는 신호이고, 그것을 듣는 것은 이 컴포넌트가
 * 아니라 window 에 걸린 조작 리스너다(useIdleLogout). 가운데 버튼은 어디를
 * 눌러야 할지 헤매지 않게 두는 큰 과녁이다.
 *
 * 뒤를 완전히 가리지 않는다. 하던 것이 그대로 있다는 게 보여야 "잠깐 멈춘 것"
 * 으로 읽힌다 — 다 지워진 화면은 이미 나간 것처럼 보인다.
 */
export function IdleWarning({ secondsLeft, nickname, onStay }: IdleWarningProps) {
  const leaving = secondsLeft === null

  /**
   * 뜨는 순간 포커스를 카드 안으로 옮긴다.
   *
   * **role="alertdialog" 는 포커스가 들어와야 읽힌다.** live region 이 아니라
   * dialog 계열이라, 옮기지 않으면 화면 낭독기를 쓰는 사람은 이 카드가 떴다는
   * 것을 영영 모른 채 30초 뒤에 로그인 화면을 만난다.
   *
   * 포커스 이동 자체는 조작으로 치지 않는다(useIdleLogout 의 ACTIVITY_EVENTS 에
   * focus 가 없다). 그래서 카드가 자기 자신을 열자마자 닫는 일은 없다.
   */
  const stayRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 나가는 중에는 누를 것이 없으므로 카드 자체에 포커스를 준다.
    const target = stayRef.current ?? sheetRef.current
    target?.focus()
  }, [leaving])

  return (
    <div className="pt-idle" role="alertdialog" aria-labelledby="pt-idle-title">
      {/* tabIndex 는 포커스를 받기 위한 것이지 탭 순서에 끼기 위한 것이 아니다.
          그래서 -1 이다. */}
      <div className="pt-idle__sheet" ref={sheetRef} tabIndex={-1}>
        <h2 className="pt-idle__title" id="pt-idle-title">
          {leaving ? '다음 사람을 위해 나가요' : '아직 거기 있어요?'}
        </h2>

        <p className="pt-idle__lead">
          {/* 닉네임을 넣는 것은 공용 기기이기 때문이다. 지나가던 다른 사람이
              이 카드를 봤을 때 "내가 아니네"를 알아채는 자리이기도 하다. */}
          <strong>{nickname}</strong>
          {leaving ? ' 님의 진행을 정리하고 있어요.' : ' 님, 한동안 조작이 없어서 곧 나가요.'}
        </p>

        {leaving ? null : (
          // aria-live 를 두지 않는다. 1초마다 숫자가 바뀌는 값이라 켜 두면 낭독기가
          // 30번 읽는다. 위 문장이 이미 상황을 말했고, 숫자는 눈으로 보는 것이다.
          <p className="pt-idle__count" aria-hidden="true">
            <strong>{secondsLeft}</strong>초
          </p>
        )}

        {leaving ? null : (
          <button
            className="gj-btn gj-btn--primary pt-idle__stay"
            type="button"
            ref={stayRef}
            onClick={onStay}
          >
            계속 놀기
          </button>
        )}

        {/* **"서버에 올린다"고 약속하지 않는다.** 나갈 때 올리기가 실패해도 나가는
            경로가 있어서(usePet 의 logout) 지키지 못할 수 있는 말이다. "남는다"는
            양쪽 다 참이다 — 올렸으면 서버에, 못 올렸으면 이 기기에 남는다. */}
        <p className="pt-idle__note">
          {leaving
            ? '잠시만요. 끝나면 로그인 화면으로 돌아가요.'
            : '나가도 진행은 남아요. 다시 로그인하면 이어서 놀 수 있어요.'}
        </p>
      </div>
    </div>
  )
}
