/**
 * 게임 소켓.
 *
 * 브라우저 WebSocket은 헤더를 붙일 수 없어서 토큰을 쿼리로 넘긴다.
 * 게임 앱이 소켓을 직접 열지 않는 이유는 fetch와 같다 — 서버 주소와 인증이
 * 여러 곳에 흩어지면 환경을 바꿀 때마다 전부 찾아다녀야 한다.
 */

export type Player = 'black' | 'white'

export interface PlacedStone {
  id: number
  owner: Player
  x: number
  y: number
}

export interface ServerMessage {
  type: string
  [key: string]: unknown
}

export interface GameSocketOptions {
  /** 예: http://localhost:8090 — http(s)를 ws(s)로 바꿔서 접속한다. */
  baseUrl: string
  token: string
  onMessage: (message: ServerMessage) => void
  onClose?: () => void
  onError?: () => void
}

export interface GameSocket {
  createRoom(): void
  joinRoom(code: string): void
  place(stones: { x: number; y: number }[]): void
  flick(stoneId: number, vx: number, vy: number): void
  turnEnd(hash: string, black: number, white: number): void
  resign(): void
  close(): void
  readonly isOpen: boolean
}

export function createGameSocket(options: GameSocketOptions): GameSocket {
  const { baseUrl, token, onMessage, onClose, onError } = options

  const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/$/, '')
  const socket = new WebSocket(`${wsUrl}/ws/game?token=${encodeURIComponent(token)}`)

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
    place: (stones) => send({ type: 'PLACE', stones }),
    flick: (stoneId, vx, vy) => send({ type: 'FLICK', stoneId, vx, vy }),
    turnEnd: (hash, black, white) => send({ type: 'TURN_END', hash, black, white }),
    resign: () => send({ type: 'RESIGN' }),
    close: () => socket.close(),
    get isOpen() {
      return socket.readyState === WebSocket.OPEN
    },
  }
}
