import { useState } from 'react'
import { ApiError } from '@gujuck/api'
import type { Profile } from '@gujuck/api'
import { authApi } from '../api'

interface Props {
  onAuthenticated: (token: string, profile: Profile) => void
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'signUp'>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      const call = mode === 'login' ? authApi.login : authApi.signUp
      const result = await call({ nickname: nickname.trim(), password })
      onAuthenticated(result.token, result)
    } catch (caught) {
      // 서버가 message를 실어 보내므로 그대로 보여준다. 그 외에는 네트워크 문제다.
      setError(caught instanceof ApiError ? caught.message : '서버에 연결하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ak-center">
      <form className="ak-card" onSubmit={submit}>
        <h1 className="ak-card__title">알까기</h1>
        <p className="ak-card__lead">
          {mode === 'login' ? '닉네임으로 로그인하세요.' : '닉네임과 비밀번호로 가입합니다.'}
        </p>

        <label className="ak-field">
          <span>닉네임</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            autoComplete="username"
            maxLength={12}
            required
          />
        </label>

        <label className="ak-field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {error && <p className="ak-error">{error}</p>}

        <button className="ak-btn ak-btn--primary" type="submit" disabled={busy}>
          {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작'}
        </button>

        <button
          className="ak-btn ak-btn--ghost"
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signUp' : 'login')
            setError('')
          }}
        >
          {mode === 'login' ? '계정이 없어요' : '이미 계정이 있어요'}
        </button>
      </form>
    </div>
  )
}
