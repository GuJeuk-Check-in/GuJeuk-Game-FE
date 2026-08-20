import { useCallback, useEffect, useRef, useState } from 'react'
import { createGameSocket, tokenStore } from '@gujuck/api'
import type { GameSocket, PlacedStone, Player, Profile, ServerMessage } from '@gujuck/api'
import { API_BASE } from './api'
import type { AlkkagiGame, AlkkagiSnapshot } from './game/AlkkagiGame'

export type Phase = 'auth' | 'lobby' | 'waiting' | 'placing' | 'playing' | 'over'

export interface MatchResult {
  won: boolean
  ratingDelta: number
  rating: number
  reason: string
}

const IDLE_SNAPSHOT: AlkkagiSnapshot = {
  mode: 'placement',
  turn: null,
  black: 5,
  white: 5,
  settling: false,
  placementValid: true,
}

/**
 * 소켓과 게임 인스턴스를 잇는 곳.
 *
 * 화면(App)은 여기서 나온 phase와 snapshot만 보고 그린다. 소켓 메시지 처리와
 * 물리 인스턴스 제어가 컴포넌트 안에 흩어지면 재접속·언마운트에서 새는 곳이 생긴다.
 */
export function useMatch() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [phase, setPhase] = useState<Phase>('auth')
  const [roomCode, setRoomCode] = useState('')
  const [myColor, setMyColor] = useState<Player>('black')
  const [opponent, setOpponent] = useState<Profile | null>(null)
  const [snapshot, setSnapshot] = useState<AlkkagiSnapshot>(IDLE_SNAPSHOT)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [notice, setNotice] = useState('')
  const [opponentPlaced, setOpponentPlaced] = useState(false)

  const socketRef = useRef<GameSocket | null>(null)
  const gameRef = useRef<AlkkagiGame | null>(null)
  /** 캔버스가 붙기 전에 GAME_START가 오면 여기 담아뒀다 적용한다. */
  const pendingStart = useRef<{ stones: PlacedStone[]; turn: Player } | null>(null)

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'READY':
        setProfile({
          nickname: message.nickname as string,
          rating: message.rating as number,
          wins: 0,
          losses: 0,
        })
        break

      case 'ROOM_CREATED':
        setRoomCode(message.code as string)
        setMyColor(message.you as Player)
        setPhase('waiting')
        setNotice('상대가 코드를 입력하면 시작합니다.')
        break

      case 'ROOM_JOINED':
        setRoomCode(message.code as string)
        setMyColor(message.you as Player)
        setOpponent(message.opponent as Profile)
        break

      case 'OPPONENT_JOINED':
        setOpponent(message.opponent as Profile)
        break

      case 'PLACEMENT_START':
        setPhase('placing')
        setOpponentPlaced(false)
        setNotice('내 진영 안에 돌 5개를 배치하세요.')
        break

      case 'OPPONENT_PLACED':
        setOpponentPlaced(true)
        break

      case 'PLACEMENT_AUTO':
        setNotice('시간이 지나 기본 배치로 시작합니다.')
        break

      case 'GAME_START': {
        const stones = message.stones as PlacedStone[]
        const turn = message.first as Player
        setPhase('playing')
        setNotice('')

        if (gameRef.current) gameRef.current.startGame(stones, turn)
        else pendingStart.current = { stones, turn }
        break
      }

      case 'FLICK':
        gameRef.current?.applyFlick(
          message.stoneId as number,
          message.vx as number,
          message.vy as number,
        )
        break

      case 'TURN':
        gameRef.current?.setTurn(message.turn as Player)
        if (message.timedOut) setNotice('제한 시간이 지나 차례가 넘어갔습니다.')
        else setNotice('')
        break

      case 'DESYNC':
        gameRef.current?.finish()
        setPhase('over')
        setResult(null)
        setNotice(message.message as string)
        break

      case 'GAME_OVER':
        gameRef.current?.finish()
        setPhase('over')
        setResult({
          won: message.won as boolean,
          ratingDelta: message.ratingDelta as number,
          rating: message.rating as number,
          reason: message.reason as string,
        })
        setProfile((current) =>
          current ? { ...current, rating: message.rating as number } : current,
        )
        break

      case 'OPPONENT_DISCONNECTED':
        setNotice(`상대 연결이 끊겼습니다. ${message.graceSec}초 안에 돌아오지 않으면 승리합니다.`)
        break

      case 'OPPONENT_RECONNECTED':
        setNotice('상대가 돌아왔습니다.')
        break

      case 'ERROR':
        setNotice(message.message as string)
        break

      default:
        break
    }
  }, [])

  const connect = useCallback(
    (token: string) => {
      socketRef.current?.close()
      socketRef.current = createGameSocket({
        baseUrl: API_BASE,
        token,
        onMessage: handleMessage,
        onClose: () => setNotice('서버와 연결이 끊겼습니다.'),
      })
      setPhase('lobby')
    },
    [handleMessage],
  )

  /** 로그인 성공 직후. 토큰을 저장하고 소켓을 연다. */
  const authenticated = useCallback(
    (token: string, next: Profile) => {
      tokenStore.set(token)
      setProfile(next)
      connect(token)
    },
    [connect],
  )

  const logout = useCallback(() => {
    tokenStore.clear()
    socketRef.current?.close()
    socketRef.current = null
    setProfile(null)
    setPhase('auth')
    setResult(null)
    setNotice('')
  }, [])

  // 새로고침해도 토큰이 있으면 바로 로비로 들어간다.
  useEffect(() => {
    const saved = tokenStore.get()
    if (saved) connect(saved)
  }, [connect])

  useEffect(() => () => socketRef.current?.close(), [])

  const attachGame = useCallback((game: AlkkagiGame | null) => {
    gameRef.current = game

    if (game && pendingStart.current) {
      game.startGame(pendingStart.current.stones, pendingStart.current.turn)
      pendingStart.current = null
    }
  }, [])

  return {
    profile,
    phase,
    roomCode,
    myColor,
    opponent,
    snapshot,
    result,
    notice,
    opponentPlaced,
    setSnapshot,
    attachGame,
    authenticated,
    logout,
    createRoom: () => socketRef.current?.createRoom(),
    joinRoom: (code: string) => socketRef.current?.joinRoom(code.trim().toUpperCase()),
    place: (stones: { x: number; y: number }[]) => socketRef.current?.place(stones),
    flick: (stoneId: number, vx: number, vy: number) => socketRef.current?.flick(stoneId, vx, vy),
    turnEnd: (hash: string, black: number, white: number, firstZero: Player | null) =>
      socketRef.current?.turnEnd(hash, black, white, firstZero),
    resign: () => socketRef.current?.resign(),
    backToLobby: () => {
      setPhase('lobby')
      setResult(null)
      setNotice('')
      setOpponent(null)
      setRoomCode('')
    },
  }
}

export type Match = ReturnType<typeof useMatch>
