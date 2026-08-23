import type { Mark } from './game/types'

/**
 * 틱택토 소켓.
 *
 * ─── 왜 앱 안에 있는가 ───────────────────────────────────────────────────
 * 연결·인증·재전송 큐는 게임과 무관하지만, 주고받는 메시지는 게임마다 완전히
 * 다르다. 알까기는 돌을 배치하고 튕기고 스킬을 걸지만 틱택토는 칸 번호 하나를
 * 보낼 뿐이다. 이런 프로토콜을 공용 패키지에 모아두면 게임이 늘어날수록 그
 * 파일이 모든 게임의 어휘를 떠안게 된다.
 *
 * 그래서 프로토콜은 각 게임 앱이 갖는다. @gujuck/api는 서버 주소와 토큰만
 * 책임진다.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 브라우저 WebSocket은 헤더를 붙일 수 없어서 토큰을 쿼리로 넘긴다.
 */

/** 각자 다음 수에 사라질 칸. 해당 없으면 -1. */
export interface VanishingView {
  x: number
  o: number
}

/** 서버가 보내는 메시지. type으로 갈라 읽는다. */
export interface ServerMessage {
  type: string
  [key: string]: unknown
}

export interface TicTacToeSocketOptions {
  /** 예: http://localhost:8090 — http(s)를 ws(s)로 바꿔서 접속한다. */
  baseUrl: string
  token: string
  onMessage: (message: ServerMessage) => void
  onClose?: () => void
  onError?: () => void
}

export interface TicTacToeSocket {
  createRoom(): void
  joinRoom(code: string): void
  /** 둘 칸의 번호만 보낸다. 차례인지·빈 칸인지·무엇이 사라지는지는 서버가 정한다. */
  move(index: number): void
  resign(): void
  close(): void
  readonly isOpen: boolean
}

export function createTicTacToeSocket(options: TicTacToeSocketOptions): TicTacToeSocket {
  const { baseUrl, token, onMessage, onClose, onError } = options

  const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/$/, '')
  const socket = new WebSocket(`${wsUrl}/ws/tic-tac-toe?token=${encodeURIComponent(token)}`)

  // 소켓이 열리기 전에 보낸 메시지는 예외를 던진다. 사용자가 화면을 빨리
  // 조작하면 실제로 일어나므로 큐에 담아뒀다가 열릴 때 흘려보낸다.
  const pending: string[] = []

  socket.addEventListener('open', () => {
    while (pending.length > 0) socket.send(pending.shift() as string)
  })
  socket.addEventListener('message', (event) => {
    onMessage(JSON.parse(event.data as string) as ServerMessage)
  })
  socket.addEventListener('close', () => onClose?.())
  socket.addEventListener('error', () => onError?.())

  function send(payload: Record<string, unknown>): void {
    const text = JSON.stringify(payload)
    if (socket.readyState === WebSocket.OPEN) socket.send(text)
    else pending.push(text)
  }

  return {
    createRoom: () => send({ type: 'CREATE_ROOM' }),
    joinRoom: (code) => send({ type: 'JOIN_ROOM', code }),
    move: (index) => send({ type: 'MOVE', index }),
    resign: () => send({ type: 'RESIGN' }),
    close: () => socket.close(),
    get isOpen() {
      return socket.readyState === WebSocket.OPEN
    },
  }
}

/** 서버가 쓰는 소문자 마크('x'/'o')를 앱의 Mark로 바꾼다. */
export function toMark(value: unknown): Mark {
  return String(value).toUpperCase() === 'O' ? 'O' : 'X'
}
