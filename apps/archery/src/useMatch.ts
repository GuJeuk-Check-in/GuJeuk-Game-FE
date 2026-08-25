import { useCallback, useEffect, useRef, useState } from 'react'
import { tokenStore } from '@gujuck/api'
import { API_BASE } from './api'
import { createArcherySocket } from './socket'
import type { ArcherySocket, ServerMessage } from './socket'
import type { ArcheryGame, ShotInput, ShotResult } from './game/ArcheryGame'

export type Phase = 'auth' | 'lobby' | 'waiting' | 'playing'

export interface OnlineProfile {
  nickname: string
  rating: number
}

export interface MatchResult {
  won: boolean
  reason: string
  myTotal: number
  theirTotal: number
  ratingDelta: number
  rating: number
}

export interface Scoreboard {
  myShots: number[]
  theirShots: number[]
  myTotal: number
  theirTotal: number
  round: number
  arrowsPerRound: number
  suddenDeath: boolean
  yourTurn: boolean
  wind: number
  /** 서버가 한 차례에 주는 시간(초). */
  turnLimitSec: number
}

const EMPTY_BOARD: Scoreboard = {
  myShots: [],
  theirShots: [],
  myTotal: 0,
  theirTotal: 0,
  round: 1,
  arrowsPerRound: 5,
  suddenDeath: false,
  yourTurn: false,
  wind: 0,
  turnLimitSec: 45,
}

/**
 * 소켓과 화면을 잇는 곳.
 *
 * ─── 물리는 여기서 돌지 않는다 ───────────────────────────────────────────
 * 점수판·차례·바람은 전부 서버가 보낸 값을 그대로 쓴다. 다만 화살이 나는
 * 것만은 각자 화면에서 계산한다 — 서버가 중계한 입력을 ArcheryGame에 그대로
 * 넣으면 같은 궤적이 나오기 때문이다.
 *
 * 그래서 내 발은 "내가 쏜다 → 결과를 서버로 보고", 상대 발은 "서버가 준
 * 입력으로 재생"이 된다.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function useMatch() {
  const [phase, setPhase] = useState<Phase>('auth')
  const [profile, setProfile] = useState<OnlineProfile | null>(null)
  const [opponent, setOpponent] = useState<OnlineProfile | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [board, setBoard] = useState<Scoreboard>(EMPTY_BOARD)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [notice, setNotice] = useState('')
  /** 지금 차례가 시작한 시각. 남은 시간을 화면에서 세는 데 쓴다. */
  const [turnAt, setTurnAt] = useState(() => Date.now())
  /** 소켓이 살아 있는지. 끊기면 화면에 돌아올 길을 띄운다. */
  const [connected, setConnected] = useState(false)

  const socketRef = useRef<{ socket: ArcherySocket; alive: { value: boolean } } | null>(null)
  const gameRef = useRef<ArcheryGame | null>(null)
  /**
   * 캔버스가 붙기 전에 GAME_START가 올 수 있다. 그때 차례를 흘리면 첫 발을
   * 영영 못 쏘므로 담아뒀다가 붙는 순간 적용한다.
   */
  const pendingTurn = useRef<{ canShoot: boolean; wind: number } | null>(null)
  /**
   * 상대 화살이 다 날아간 뒤에 적용할 차례.
   *
   * 재생 중에 바로 내 차례를 열면 상대 화살이 아직 날아가는 동안 조준이 되어
   * 화면에 화살이 두 개 뜬다. 재생이 끝나는 순간에 연다.
   */
  const turnAfterReplay = useRef<{ canShoot: boolean; wind: number } | null>(null)

  const applyTurn = useCallback((canShoot: boolean, wind: number) => {
    const game = gameRef.current
    if (game) game.setTurn(canShoot, wind)
    else pendingTurn.current = { canShoot, wind }
  }, [])

  const closeSocket = useCallback(() => {
    const current = socketRef.current
    if (!current) return

    // 우리가 닫는 것이므로 끊김 알림을 띄우지 않는다.
    current.alive.value = false
    current.socket.close()
    socketRef.current = null
  }, [])

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'READY':
          setProfile({
            nickname: message.nickname as string,
            rating: message.rating as number,
          })
          setConnected(true)
          setNotice('')
          // 처음 붙는 것이면 로비로 보낸다. 대결 중 다시 붙는 것이면 화면을
          // 건드리지 않는다 — 곧 RESUMED가 와서 판을 되살린다.
          setPhase((current) => (current === 'auth' ? 'lobby' : current))
          break

        case 'ROOM_CREATED':
          setRoomCode(message.code as string)
          setPhase('waiting')
          setNotice('상대가 코드를 입력하면 시작합니다.')
          break

        case 'GAME_START':
        case 'RESUMED': {
          const next = readBoard(message)
          setBoard(next)
          setTurnAt(Date.now())
          setOpponent((message.opponent as OnlineProfile | undefined) ?? null)
          setResult(null)
          setPhase('playing')
          setNotice(message.type === 'RESUMED' ? '다시 연결됐습니다.' : '')
          gameRef.current?.reset()
          applyTurn(next.yourTurn, next.wind)
          break
        }

        case 'SHOT': {
          const next = readBoard(message)
          setBoard(next)
          setTurnAt(Date.now())
          setNotice('')

          const game = gameRef.current

          if (message.mine === true) {
            // 내 화살은 이미 내 화면에서 날아갔다. 차례만 갱신한다.
            applyTurn(next.yourTurn, next.wind)
          } else if (message.timedOut === true || !game) {
            // 시간을 넘겨 적힌 발은 날아간 화살이 없다. 캔버스가 아직 안 붙은
            // 경우도 마찬가지로 재생할 수 없는데, 그냥 흘리면 turnAfterReplay가
            // 영영 남아 내 차례가 다시 열리지 않는다. 바로 연다.
            applyTurn(next.yourTurn, next.wind)
          } else {
            // 상대 화살을 같은 입력으로 재생한다. 내 차례는 재생이 끝난 뒤에 연다.
            //
            // 바람은 shotWind를 쓴다. next.wind는 다음 발에 불 바람이라 이 화살과
            // 무관하다 — 라운드를 닫는 발에서는 서버가 그 직전에 새로 뽑기 때문에,
            // 둘을 헷갈리면 상대 화면에서만 궤적이 어긋난다.
            turnAfterReplay.current = { canShoot: next.yourTurn, wind: next.wind }
            game.replay({
              angle: message.angle as number,
              power: message.power as number,
              wind: message.shotWind as number,
            })
          }
          break
        }

        case 'GAME_OVER':
          setResult({
            won: message.won as boolean,
            reason: message.reason as string,
            myTotal: message.myTotal as number,
            theirTotal: message.theirTotal as number,
            ratingDelta: message.ratingDelta as number,
            rating: message.rating as number,
          })
          setProfile((current) =>
            current ? { ...current, rating: message.rating as number } : current,
          )
          applyTurn(false, 0)
          setNotice('')
          break

        case 'OPPONENT_LEFT':
          setNotice(
            `상대의 연결이 끊겼습니다. ${message.graceSec}초 안에 돌아오지 않으면 승리합니다.`,
          )
          break

        case 'OPPONENT_BACK':
          setNotice('상대가 돌아왔습니다.')
          break

        case 'ERROR':
          setNotice(message.message as string)
          break

        default:
          break
      }
    },
    [applyTurn],
  )

  const connect = useCallback(
    (token: string) => {
      closeSocket()

      const alive = { value: true }
      const socket = createArcherySocket({
        baseUrl: API_BASE,
        token,
        onMessage: handleMessage,
        onClose: () => {
          if (!alive.value) return
          setConnected(false)
          setNotice('서버와 연결이 끊겼습니다.')
        },
      })

      socketRef.current = { socket, alive }
    },
    [handleMessage, closeSocket],
  )

  /** 캔버스가 붙었을 때 게임 인스턴스를 넘겨받는다. */
  const attachGame = useCallback((game: ArcheryGame | null) => {
    gameRef.current = game
    if (!game) return

    const pending = pendingTurn.current
    if (pending) {
      game.setTurn(pending.canShoot, pending.wind)
      pendingTurn.current = null
    }
  }, [])

  /** 화살이 멈췄을 때 게임이 부른다. */
  const handleShotLanded = useCallback(
    (input: ShotInput, result: ShotResult, by: 'me' | 'them') => {
      if (by === 'me') {
        // 점수는 내가 계산했다. 각도·세기를 함께 보내야 상대 화면에서 같은
        // 화살이 재생된다.
        socketRef.current?.socket.shoot(input.angle, input.power, result.score)
        return
      }

      // 상대 화살이 다 날아갔다. 이제 내 차례를 연다.
      const next = turnAfterReplay.current
      turnAfterReplay.current = null
      if (next) applyTurn(next.canShoot, next.wind)
    },
    [applyTurn],
  )

  const authenticated = useCallback(
    (token: string) => {
      tokenStore.set(token)
      connect(token)
    },
    [connect],
  )

  const logout = useCallback(() => {
    tokenStore.clear()
    closeSocket()
    setConnected(false)
    setProfile(null)
    setOpponent(null)
    setResult(null)
    setNotice('')
    setPhase('auth')
  }, [closeSocket])

  /** 끊긴 뒤 다시 붙는다. 방이 살아 있으면 서버가 RESUMED로 판을 되살린다. */
  const retry = useCallback(() => {
    const saved = tokenStore.get()
    if (!saved) {
      setPhase('auth')
      return
    }
    setNotice('다시 연결하는 중…')
    connect(saved)
  }, [connect])

  const createRoom = useCallback(() => socketRef.current?.socket.createRoom(), [])
  const joinRoom = useCallback((code: string) => socketRef.current?.socket.joinRoom(code), [])
  const resign = useCallback(() => socketRef.current?.socket.resign(), [])

  const backToLobby = useCallback(() => {
    // 서버에 알리지 않으면 방이 남아, 새로고침했을 때 재접속이 그 방을 찾아
    // 붙여 취소한 방으로 되돌아간다.
    socketRef.current?.socket.leaveRoom()
    setPhase('lobby')
    setRoomCode('')
    setOpponent(null)
    setResult(null)
    setBoard(EMPTY_BOARD)
    setNotice('')
  }, [])

  // 새로고침해도 토큰이 있으면 바로 로비로 들어간다.
  useEffect(() => {
    const saved = tokenStore.get()
    if (saved) connect(saved)
    // 최초 1회만. connect가 바뀌어도 다시 붙으면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => closeSocket, [closeSocket])

  return {
    phase,
    connected,
    turnAt,
    profile,
    opponent,
    roomCode,
    board,
    result,
    notice,
    attachGame,
    handleShotLanded,
    authenticated,
    logout,
    createRoom,
    joinRoom,
    resign,
    retry,
    backToLobby,
  }
}

export type Match = ReturnType<typeof useMatch>

function readBoard(message: ServerMessage): Scoreboard {
  return {
    myShots: (message.myShots as number[] | undefined) ?? [],
    theirShots: (message.theirShots as number[] | undefined) ?? [],
    myTotal: (message.myTotal as number | undefined) ?? 0,
    theirTotal: (message.theirTotal as number | undefined) ?? 0,
    round: (message.round as number | undefined) ?? 1,
    arrowsPerRound: (message.arrowsPerRound as number | undefined) ?? 5,
    suddenDeath: (message.suddenDeath as boolean | undefined) ?? false,
    yourTurn: (message.yourTurn as boolean | undefined) ?? false,
    wind: (message.wind as number | undefined) ?? 0,
    turnLimitSec: (message.turnLimitSec as number | undefined) ?? 45,
  }
}
