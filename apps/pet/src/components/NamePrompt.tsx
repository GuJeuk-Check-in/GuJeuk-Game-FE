import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

/** 명세 §9 튜토리얼 1단계의 "1~8자". */
const NAME_MAX_LENGTH = 8

export interface NamePromptProps {
  onSubmit: (name: string) => void
  /** 세이브 복구 안내처럼 이름을 짓기 전에 먼저 읽어야 하는 문구. */
  notice?: string | null
}

/**
 * 첫 실행 화면.
 *
 * 기본 이름을 넣어 두고 그냥 넘기게 하지 않는다. 명세 §16 에서 기본값이 아직
 * 열린 질문이라, 여기서 임의로 정하면 그 값이 사실상 확정되어 버린다.
 * 빈 이름으로는 시작할 수 없게 두는 편이 되돌리기 싸다.
 */
export function NamePrompt({ onSubmit, notice }: NamePromptProps) {
  const [name, setName] = useState('')
  const trimmed = name.trim()

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <form className="pt-prompt" onSubmit={handleSubmit}>
      {notice ? (
        // role="alert" 이라 화면 낭독기가 이름 입력보다 먼저 읽어준다.
        <p className="pt-prompt__notice" role="alert">
          {notice}
        </p>
      ) : null}

      <h1 className="pt-prompt__title">펫타운</h1>
      <label className="pt-prompt__label" htmlFor="pt-name">
        펫의 이름을 지어 주세요
      </label>
      <input
        id="pt-name"
        className="pt-prompt__input"
        value={name}
        onChange={handleChange}
        maxLength={NAME_MAX_LENGTH}
        placeholder={`1~${NAME_MAX_LENGTH}자`}
        autoComplete="off"
        enterKeyHint="done"
      />
      <button type="submit" className="gj-btn gj-btn--primary" disabled={!trimmed}>
        시작하기
      </button>
    </form>
  )
}
