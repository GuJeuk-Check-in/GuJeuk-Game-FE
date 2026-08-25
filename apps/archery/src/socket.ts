/**
 * 양궁 소켓.
 *
 * ─── 무엇을 주고받는가 ───────────────────────────────────────────────────
 * 서버는 궤적을 계산하지 않는다. 화살은 서로 부딪히지 않고 같은 입력이면 같은
 * 궤적이 나오므로, 발사 입력(각도·세기·바람)만 중계하면 상대 화면에서 같은
 * 화살이 난다. 서버가 관리하는 건 차례와 바람과 점수판뿐이다.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 프로토콜을 공용 패키지가 아니라 앱 안에 두는 이유는 알까기·틱택토와 같다.
 * 게임마다 어휘가 완전히 달라서, 모아두면 그 파일이 모든 게임의 말을 떠안는다.
 */

export interface ServerMessage {
  type: string
  [key: string]: unknown
}

export interface ArcherySocketOptions {
  /** 예: http://localhost:8090 — http(s)를 ws(s)로 바꿔서 접속한다. */
  baseUrl: string
  token: string
  onMessage: (message: ServerMessage) => void
  onClose?: () => void
  onError?: () => void
}

export interface ArcherySocket {
  createRoom(): void
  joinRoom(code: string): void
  /**
   * 한 발을 보고한다.
   *
   * angle·power는 상대 화면에서 같은 화살을 재생하는 데 쓰이고, score는 쏜
   * 쪽이 계산한 값이다. 서버는 범위만 확인한다.
   */
  shoot(angle: number, power: number, score: number): void
  /** 방을 떠난다. 이걸 안 보내면 서버에 방이 그대로 남는다. */
  leaveRoom(): void
  resign(): void
  close(): void
  readonly isOpen: boolean
}

export function createArcherySocket(options: ArcherySocketOptions): ArcherySocket {
  const { baseUrl, token, onMessage, onClose, onError } = options

  const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/$/, '')
  const socket = new WebSocket(`${wsUrl}/ws/archery?token=${encodeURIComponent(token)}`)

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
    shoot: (angle, power, score) => send({ type: 'SHOT', angle, power, score }),
    leaveRoom: () => send({ type: 'LEAVE_ROOM' }),
    resign: () => send({ type: 'RESIGN' }),
    close: () => socket.close(),
    get isOpen() {
      return socket.readyState === WebSocket.OPEN
    },
  }
}
