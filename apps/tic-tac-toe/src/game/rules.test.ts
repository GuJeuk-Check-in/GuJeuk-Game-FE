import { describe, expect, it } from 'vitest'

import {
  applyMove,
  bestMove,
  createInitialState,
  evaluate,
  legalMoves,
  vanishingCell,
} from './rules'
import type { GameState } from './types'

describe('틱택토 순환 규칙', () => {
  it('각 플레이어의 네 번째 말을 놓은 뒤 가장 오래된 말을 제거한다', () => {
    const before: GameState = {
      board: ['X', 'O', 'X', 'O', 'X', 'O', null, null, null],
      history: { X: [0, 2, 4], O: [1, 3, 5] },
      turn: 'X',
    }

    expect(vanishingCell(before.history, 'X')).toBe(0)
    expect(applyMove(before, 6)).toEqual({
      board: [null, 'O', 'X', 'O', 'X', 'O', 'X', null, null],
      history: { X: [2, 4, 6], O: [1, 3, 5] },
      turn: 'O',
    })
  })

  it('새 말을 먼저 놓고 오래된 말을 제거해 스스로 완성한 줄도 무너질 수 있다', () => {
    const before: GameState = {
      board: ['X', 'X', null, 'O', null, 'O', null, null, 'X'],
      history: { X: [0, 1, 8], O: [3, 5] },
      turn: 'X',
    }

    const after = applyMove(before, 2)
    expect(after.board).toEqual([null, 'X', 'X', 'O', null, 'O', null, null, 'X'])
    expect(evaluate(after.board).winner).toBeNull()
  })

  it('승리 줄과 빈 칸을 기존 규칙대로 판정한다', () => {
    expect(evaluate(['O', null, 'X', 'O', 'X', null, 'O', null, 'X'])).toEqual({
      winner: 'O',
      line: [0, 3, 6],
    })
    expect(legalMoves(['O', null, 'X', 'O', 'X', null, 'O', null, 'X'])).toEqual([1, 5, 7])
  })

  it('이미 찬 칸은 상태 객체까지 그대로 돌려준다', () => {
    const state = applyMove(createInitialState(), 4)
    expect(applyMove(state, 4)).toBe(state)
  })

  it('AI는 즉시 이기는 수를 고른다', () => {
    const state: GameState = {
      board: ['O', 'O', null, 'X', 'X', null, null, null, null],
      history: { X: [3, 4], O: [0, 1] },
      turn: 'O',
    }
    expect(bestMove(state, 'O')).toBe(2)
  })
})
