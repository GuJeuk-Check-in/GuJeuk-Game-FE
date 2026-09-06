import { useCallback, useEffect, useRef, useState } from 'react'
import type { ArcheryGame, ArcherySnapshot, ShotInput, ShotResult } from './game/ArcheryGame'

export const ARROWS_PER_ROUND = 5

export interface LocalRound {
  /** 몇 발 쐈는지. */
  shots: number[]
  total: number
  wind: number
  finished: boolean
  snapshot: ArcherySnapshot
  attach: (game: ArcheryGame) => void
  onShotLanded: (input: ShotInput, result: ShotResult) => void
  onSnapshot: (snapshot: ArcherySnapshot) => void
  reset: () => void
}

const IDLE: ArcherySnapshot = {
  canShoot: false,
  flying: false,
  pull: 0,
  angleDeg: null,
  busy: false,
}

/** 매 발 새로 뽑는 바람. -1 ~ 1, 소수 한 자리. */
function rollWind(): number {
  return Math.round((Math.random() * 2 - 1) * 10) / 10
}

/**
 * 혼자 쏘는 한 라운드.
 *
 * 서버 없이 이 기기에서만 돈다. 상대가 없어도 감을 익힐 수 있어야 해서 남긴
 * 화면이라, 온라인과 달리 바람도 여기서 뽑는다.
 */
export function useLocalRound(): LocalRound {
  const [shots, setShots] = useState<number[]>([])
  const [wind, setWind] = useState(rollWind)
  const [snapshot, setSnapshot] = useState<ArcherySnapshot>(IDLE)

  const gameRef = useRef<ArcheryGame | null>(null)

  const total = shots.reduce((sum, score) => sum + score, 0)
  const finished = shots.length >= ARROWS_PER_ROUND

  const attach = useCallback((game: ArcheryGame) => {
    gameRef.current = game
    game.setTurn(true, rollWindInto(setWind))
  }, [])

  const onShotLanded = useCallback((_input: ShotInput, result: ShotResult) => {
    setShots((prev) => [...prev, result.score])
  }, [])

  /**
   * 다음 발 준비.
   *
   * 전에는 setShots 업데이터 안에서 난수를 뽑고 게임을 건드렸다. React는 업데이터를
   * 순수 함수로 보고 다시 부를 수 있어서, 그때마다 바람이 다시 뽑히고 setTurn이
   * 다시 불렸다. 발 수가 바뀐 뒤에 한 번만 하도록 옮긴다.
   */
  useEffect(() => {
    const game = gameRef.current
    // 첫 발과 리셋 직후 준비는 attach와 reset이 맡는다.
    if (!game || shots.length === 0) return

    if (shots.length < ARROWS_PER_ROUND) {
      const nextWind = rollWind()
      setWind(nextWind)
      game.setTurn(true, nextWind)
    } else {
      game.setTurn(false, 0)
    }
  }, [shots.length])

  const reset = useCallback(() => {
    setShots([])
    const nextWind = rollWind()
    setWind(nextWind)
    gameRef.current?.reset()
    gameRef.current?.setTurn(true, nextWind)
  }, [])

  return {
    shots,
    total,
    wind,
    finished,
    snapshot,
    attach,
    onShotLanded,
    onSnapshot: setSnapshot,
    reset,
  }
}

/** 바람을 뽑아 상태에도 넣고 값으로도 돌려준다. */
function rollWindInto(set: (value: number) => void): number {
  const value = rollWind()
  set(value)
  return value
}
