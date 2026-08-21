import { useCallback, useEffect, useRef, useState } from 'react'
import { tokenStore } from '@gujuck/api'
import { API_BASE } from './api'
import { createTicTacToeSocket, toMark } from './socket'
import type { ServerMessage, TicTacToeSocket, VanishingView } from './socket'
import type { Board, Cell, Mark } from './game/types'

/** 화면 단계. App이 이 값만 보고 무엇을 그릴지 정한다. */
export type Phase = 'auth' | 'lobby' | 'waiting' | 'playing'

export interface OnlineProfile {
  nickname: string
  rating: number
}

export interface MatchResult {
  won: boolean
  winner: Mark | null
  line: readonly number[] | null
  reason: string
  ratingDelta: number
  rating: number
}

const EMPTY_BOARD: Board = Object.freeze(Array<Cell>(9).fill(null))
const NO_VANISHING: VanishingView = { x: -1, o: -1 }

/**
 * 소켓과 화면을 잇는 곳.
 *
 * ─── 로컬 게임과 다른 점 ─────────────────────────────────────────────────
 * 로컬(useGame)은 규칙을 직접 굴려 상태를 만든다. 온라인은 그러지 않는다.
 * 판도 차례도 승패도 서버가 보내주는 값을 그대로 받아 그린다. 클라가 미리
 * 계산해 그려두면 서버가 거부했을 때 화면과 진실이 어긋난다.
 *
 * 그래서 여기에는 규칙이 한 줄도 없다. rules.ts는 로컬 대전에서만 쓴다.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function useMatch() {
  const [phase, setPhase] = useState<Phase>('auth')
  const [profile, setProfile] = useState<OnlineProfile | null>(null)
  const [opponent, setOpponent] = useState<OnlineProfile | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [myMark, setMyMark] = useState<Mark>('X')

  const [board, setBoard] = useState<Board>(EMPTY_BOARD)
  const [turn, setTurn] = useState<Mark>('X')
  const [vanishing, setVanishing] = useState<VanishingView>(NO_VANISHING)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [notice, setNotice] = useState('')

  /**
   * 열려 있는 소켓과 그 생존 표시.
   *
   * alive를 따로 두는 이유: 새로 연결하거나 화면을 떠날 때 우리가 직접 소켓을
   * 닫는데, 그때도 onClose가 불린다. 구분하지 않으면 로그인할 때마다 "서버와
   * 연결이 끊겼습니다"가 뜬다(개발 모드 StrictMode 재마운트에서도 마찬가지).
   */
  const socketRef = useRef<{ socket: TicTacToeSocket; alive: { value: boolean } } | null>(null)

  /** 우리가 의도적으로 닫는다. 끊김 알림을 띄우지 않는다. */
  const closeSocket = useCallback(() => {
    const current = socketRef.current
    if (!current) return

    current.alive.value = false
    current.socket.close()
    socketRef.current = null
  }, [])

  const applyBoard = useCallback((message: ServerMessage) => {
    setBoard((message.board as (string | null)[]).map((cell) => (cell ? toMark(cell) : null)))
    setTurn(toMark(message.turn))
    setVanishing((message.vanishing as VanishingView | undefined) ?? NO_VANISHING)
  }, [])

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'READY':
          setProfile({
            nickname: message.nickname as string,
            rating: message.rating as number,
          })
          break

        case 'ROOM_CREATED':
          setRoomCode(message.code as string)
          setMyMark(toMark(message.you))
          setPhase('waiting')
          setNotice('상대가 코드를 입력하면 시작합니다.')
          break

        case 'ROOM_JOINED':
          setRoomCode(message.code as string)
          setMyMark(toMark(message.you))
          setOpponent(message.opponent as OnlineProfile)
          setNotice('')
          break

        case 'OPPONENT_JOINED':
          setOpponent(message.opponent as OnlineProfile)
          setNotice('')
          break

        case 'GAME_START':
          applyBoard(message)
          setResult(null)
          setPhase('playing')
          setNotice('')
          break

        case 'MOVE':
          applyBoard(message)
          setNotice('')
          break

        case 'GAME_OVER':
          setResult({
            won: message.won as boolean,
            winner: message.winner ? toMark(message.winner) : null,
            line: (message.line as number[] | null) ?? null,
            reason: message.reason as string,
            ratingDelta: message.ratingDelta as number,
            rating: message.rating as number,
          })
          setProfile((current) =>
            current ? { ...current, rating: message.rating as number } : current,
          )
          break

        case 'RESUMED':
          // 끊겼다 돌아왔다. 판 전체를 다시 받으므로 그대로 덮어쓰면 된다.
          setMyMark(toMark(message.you))
          applyBoard(message)
          setPhase('playing')
          setNotice('다시 연결됐습니다.')
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
    [applyBoard],
  )

  const connect = useCallback(
    (token: string) => {
      closeSocket()

      const alive = { value: true }
      const socket = createTicTacToeSocket({
        baseUrl: API_BASE,
        token,
        onMessage: handleMessage,
        // 우리가 닫은 소켓이면 알리지 않는다.
        onClose: () => {
          if (alive.value) setNotice('서버와 연결이 끊겼습니다.')
        },
      })

      socketRef.current = { socket, alive }
      setPhase('lobby')
    },
    [handleMessage, closeSocket],
  )

  /** 로그인 성공 직후. 토큰을 저장하고 소켓을 연다. 프로필은 READY가 채운다. */
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
    setProfile(null)
    setOpponent(null)
    setResult(null)
    setNotice('')
    setPhase('auth')
  }, [closeSocket])

  const createRoom = useCallback(() => socketRef.current?.socket.createRoom(), [])
  const joinRoom = useCallback((code: string) => socketRef.current?.socket.joinRoom(code), [])
  const resign = useCallback(() => socketRef.current?.socket.resign(), [])

  const place = useCallback(
    (index: number) => {
      // 내 차례가 아니거나 이미 찬 칸이면 보내지 않는다. 서버도 막지만
      // 굳이 왕복해서 에러를 받아올 이유가 없다.
      if (result || turn !== myMark || board[index] !== null) return
      socketRef.current?.socket.move(index)
    },
    [result, turn, myMark, board],
  )

  const backToLobby = useCallback(() => {
    setPhase('lobby')
    setRoomCode('')
    setOpponent(null)
    setResult(null)
    setNotice('')
  }, [])

  // 새로고침해도 토큰이 있으면 바로 로비로 들어간다.
  useEffect(() => {
    const saved = tokenStore.get()
    if (saved) connect(saved)
    // 최초 1회만. connect가 바뀌어도 다시 붙으면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 화면을 떠날 때 소켓을 닫는다. 안 닫으면 개발 모드 재마운트에서 두 벌 열린다.
  useEffect(() => closeSocket, [closeSocket])

  return {
    phase,
    profile,
    opponent,
    roomCode,
    myMark,
    board,
    turn,
    vanishing,
    result,
    notice,
    authenticated,
    logout,
    createRoom,
    joinRoom,
    place,
    resign,
    backToLobby,
  }
}

export type Match = ReturnType<typeof useMatch>
