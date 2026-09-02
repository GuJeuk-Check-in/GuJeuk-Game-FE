import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '@gujuck/api'
import type { AuthResult } from '@gujuck/api'
import { authApi } from '../api'
import petUrl from '../assets/pet-adult.png'
import petBlinkUrl from '../assets/pet-adult-blink.png'

/** 서버의 회원 제약과 같은 값이다(AuthRequest 의 @Size). 여기서 미리 걸러 준다. */
const NICKNAME_MIN = 2
const NICKNAME_MAX = 12
const PASSWORD_MIN = 4

export interface AuthScreenProps {
  onAuthenticated: (result: AuthResult) => void
  /**
   * 로그인 화면으로 되돌아온 이유. 스스로 나간 것이 아니면 반드시 읽어야 한다.
   *
   * 토큰 만료는 사용자가 아무것도 누르지 않았는데 일어난다. 이유 없이 로그인
   * 화면이 뜨면 사람은 게임이 고장 났다고 생각한다.
   */
  notice?: string | null
}

/**
 * 입장 화면. **펫타운은 로그인이 입장 조건이다.**
 *
 * 다른 게임은 "로그인 없이 혼자 하기"를 열어 두지만 여기는 그럴 수 없다.
 * 기관에서 한 기기를 여러 사람이 번갈아 쓰기 때문이다(PET_SERVER_API.md §2) —
 * 익명으로 시작하면 그 진행이 누구 것인지 영영 알 수 없고, 다음 사람이 그대로
 * 이어받게 된다.
 */
export function AuthScreen({ onAuthenticated, notice }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signUp'>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 눌러 볼 것이 없는 화면이라 펫이 한 번씩 깜빡이는 것만으로 살아 있게 보인다.
  // 깜빡임 규칙은 게임 안과 같은 모듈에 있지만(face.ts) 여기서는 렌더 루프가
  // 없으므로 CSS 애니메이션으로 대신한다 — 그림 두 장을 겹쳐 두고 번갈아 숨긴다.

  const trimmed = nickname.trim()
  const ready = trimmed.length >= NICKNAME_MIN && password.length >= PASSWORD_MIN

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || busy) return

    setError('')
    setBusy(true)

    try {
      const call = mode === 'login' ? authApi.login : authApi.signUp
      onAuthenticated(await call({ nickname: trimmed, password }))
    } catch (caught) {
      // 서버가 message 를 실어 보내므로 그대로 보여준다. 그 밖은 네트워크 문제다.
      setError(caught instanceof ApiError ? caught.message : '서버에 연결하지 못했습니다.')
      setBusy(false)
    }
    // 성공하면 이 화면이 통째로 사라지므로 busy 를 되돌리지 않는다. 되돌리면
    // 사라지는 순간에 버튼 글자가 한 번 깜빡인다.
  }

  return (
    <form className="pt-auth" onSubmit={submit}>
      {notice ? (
        // role="alert" 이라 화면 낭독기가 입력칸보다 먼저 읽어준다.
        <p className="pt-auth__notice" role="alert">
          {notice}
        </p>
      ) : null}

      <div className="pt-auth__pet" aria-hidden="true">
        <img className="pt-auth__pet-img" src={petUrl} alt="" />
        <img className="pt-auth__pet-img is-blink" src={petBlinkUrl} alt="" />
      </div>

      <h1 className="pt-auth__title">펫타운</h1>
      <p className="pt-auth__lead">
        {mode === 'login'
          ? '내 펫을 만나려면 로그인해 주세요.'
          : '닉네임과 비밀번호로 새로 시작합니다.'}
      </p>

      <label className="pt-auth__field">
        <span className="pt-auth__label">닉네임</span>
        <input
          className="pt-prompt__input"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          autoComplete="username"
          maxLength={NICKNAME_MAX}
          placeholder={`${NICKNAME_MIN}~${NICKNAME_MAX}자`}
          enterKeyHint="next"
          required
        />
      </label>

      <label className="pt-auth__field">
        <span className="pt-auth__label">비밀번호</span>
        <input
          className="pt-prompt__input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={`${PASSWORD_MIN}자 이상`}
          enterKeyHint="done"
          required
        />
      </label>

      {error ? (
        <p className="pt-auth__error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="gj-btn gj-btn--primary" type="submit" disabled={!ready || busy}>
        {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작'}
      </button>

      <button
        className="gj-btn gj-btn--ghost"
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'signUp' : 'login')
          setError('')
        }}
      >
        {mode === 'login' ? '아직 계정이 없어요' : '이미 계정이 있어요'}
      </button>

      {/* 공용 기기에서 가장 흔한 사고가 로그아웃을 잊는 것이다. 들어오기 전에
          한 번 읽어 두면 나갈 때 그 버튼을 찾는다. */}
      <p className="pt-auth__hint">다 놀았으면 오른쪽 위 나가기를 눌러 주세요.</p>
    </form>
  )
}
