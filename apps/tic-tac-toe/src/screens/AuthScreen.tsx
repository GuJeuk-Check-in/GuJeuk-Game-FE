import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '@gujuck/api'
import { GameShell } from '@gujuck/ui'
import { authApi } from '../api'

interface Props {
  onAuthenticated: (token: string) => void
  /** 로그인 없이 AI와 연습하기. */
  onPlayLocal: () => void
}

export function AuthScreen({ onAuthenticated, onPlayLocal }: Props) {
  const [mode, setMode] = useState<'login' | 'signUp'>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      const call = mode === 'login' ? authApi.login : authApi.signUp
      const result = await call({ nickname: nickname.trim(), password })
      onAuthenticated(result.token)
    } catch (caught) {
      // 서버가 message를 실어 보내므로 그대로 보여준다. 그 외에는 네트워크 문제다.
      setError(caught instanceof ApiError ? caught.message : '서버에 연결하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <GameShell>
      <div className="ttt-center">
        <form className="ttt-card" onSubmit={submit}>
          <h1 className="ttt-card__title">틱택토</h1>
          <p className="ttt-card__lead">
            {mode === 'login' ? '닉네임으로 로그인하세요.' : '닉네임과 비밀번호로 가입합니다.'}
          </p>

          <label className="ttt-field">
            <span>닉네임</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              autoComplete="username"
              maxLength={12}
              required
            />
          </label>

          <label className="ttt-field">
            <span>비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {error && <p className="ttt-error">{error}</p>}

          <button className="gj-btn gj-btn--primary" type="submit" disabled={busy}>
            {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작'}
          </button>

          <button
            className="gj-btn"
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signUp' : 'login')
              setError('')
            }}
          >
            {mode === 'login' ? '계정이 없어요' : '이미 계정이 있어요'}
          </button>

          {/* 상대가 없어도 규칙을 익힐 수 있어야 한다. 로그인은 대전에만 필요하다. */}
          <button className="gj-btn ttt-ghost" type="button" onClick={onPlayLocal}>
            로그인 없이 AI와 연습
          </button>
        </form>
      </div>
    </GameShell>
  )
}
