import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyMove, bestMove, createInitialState, evaluate, vanishingCell } from './rules'
import type { GameState, Mark, Mode, Outcome } from './types'

/** 사람이 잡는 마크. 사람이 항상 선공이다. */
const HUMAN: Mark = 'X'
const AI: Mark = 'O'

/** AI가 두기 전 쉬는 시간(ms). 즉시 두면 사람이 자기 수를 확인하기 전에 판이 바뀐다. */
const AI_THINK_MS = 320

export interface GameApi {
  state: GameState
  outcome: Outcome
  finished: boolean
  mode: Mode
  /** 지금 차례인 쪽이 한 수 두면 사라질 칸. 아직 한도에 안 찼으면 null. */
  vanishing: number | null
  /** 사람이 칸을 눌렀을 때. 둘 수 없는 칸이면 아무 일도 하지 않는다. */
  place: (index: number) => void
  changeMode: (mode: Mode) => void
  reset: () => void
}

/**
 * 규칙과 화면을 잇는 상태 계층.
 *
 * ─── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * 규칙(rules.ts)은 React를 몰라야 하고, 화면(App.tsx)은 상태 전이 규칙을
 * 몰라야 한다. 그 사이를 이 훅이 메운다. 화면은 GameApi만 알면 되므로,
 * 나중에 화면을 통째로 갈아엎어도 게임은 그대로 동작한다.
 *
 * 캔버스 게임(알까기·양궁)에서는 이 자리를 게임 클래스가 대신한다.
 * 클래스가 자기 상태를 갖고 onChange로 스냅샷을 올려보내는 형태다.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function useGame(): GameApi {
  const [mode, setMode] = useState<Mode>('solo')
  const [state, setState] = useState<GameState>(createInitialState)

  // 순수 함수라 board가 바뀔 때만 다시 계산하면 된다.
  const outcome = useMemo(() => evaluate(state.board), [state.board])
  const finished = outcome.winner !== null

  const vanishing = useMemo(
    () => vanishingCell(state.history, state.turn),
    [state.history, state.turn],
  )

  const reset = useCallback(() => {
    setState(createInitialState())
  }, [])

  const play = useCallback((index: number) => {
    // applyMove가 둘 수 없는 칸이면 받은 상태를 그대로 돌려주므로, 그 경우
    // 참조가 같아 리렌더도 일어나지 않는다.
    setState((prev) => applyMove(prev, index))
  }, [])

  const place = useCallback(
    (index: number) => {
      if (finished) return
      if (mode === 'solo' && state.turn !== HUMAN) return
      play(index)
    },
    [finished, mode, state.turn, play],
  )

  const changeMode = useCallback((next: Mode) => {
    setMode(next)
    setState(createInitialState())
  }, [])

  // AI 차례 처리. 타이머를 정리하지 않으면 판을 리셋했을 때 이전 타이머가
  // 뒤늦게 깨어나 지워진 판에 수를 둔다.
  useEffect(() => {
    if (mode !== 'solo' || finished || state.turn !== AI) return

    const timer = window.setTimeout(() => {
      const move = bestMove(state, AI)
      if (move >= 0) play(move)
    }, AI_THINK_MS)

    return () => window.clearTimeout(timer)
  }, [mode, finished, state, play])

  return { state, outcome, finished, mode, vanishing, place, changeMode, reset }
}

export { HUMAN, AI }
