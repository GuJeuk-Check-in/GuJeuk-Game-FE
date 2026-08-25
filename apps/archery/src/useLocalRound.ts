import { useCallback, useRef, useState } from 'react'
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

const IDLE: ArcherySnapshot = { canShoot: false, flying: false, pull: 0, angleDeg: null }

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
    setShots((prev) => {
      const next = [...prev, result.score]

      // 다음 발 준비. 마지막 발이었으면 조준을 잠근다.
      if (next.length < ARROWS_PER_ROUND) {
        const nextWind = rollWind()
        setWind(nextWind)
        gameRef.current?.setTurn(true, nextWind)
      } else {
        gameRef.current?.setTurn(false, 0)
      }

      return next
    })
  }, [])

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
