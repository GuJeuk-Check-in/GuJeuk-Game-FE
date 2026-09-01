import { useRef } from 'react'
import type { ReactNode, TouchEvent } from 'react'
import type { RoomDef } from '../game/rooms'

/**
 * 스와이프로 인정하는 최소 가로 이동(px).
 *
 * 44px(터치 최소 크기)보다 조금 크게 잡았다. 이보다 짧으면 버튼을 누르려다
 * 손가락이 미끄러진 것까지 방 이동으로 읽혀, 누를 때마다 방이 바뀐다.
 */
const SWIPE_MIN_PX = 48

/**
 * 가로가 세로보다 이만큼 커야 스와이프로 본다.
 *
 * 세로 스크롤이 없는 화면이지만, 대각선으로 그은 손짓까지 방 이동으로 받으면
 * 펫을 쓰다듬으려는 동작이 전부 방 이동이 된다.
 */
const SWIPE_AXIS_RATIO = 1.5

/** 이보다 오래 끌면 스와이프가 아니라 화면을 짚고 있던 것으로 본다. */
const SWIPE_MAX_MS = 800

interface TouchOrigin {
  x: number
  y: number
  at: number
}

export interface RoomNavProps {
  room: RoomDef
  /** 화살표에 붙일 이웃 방 이름. rooms.ts 의 roomAt 이 끝에서 순환시킨다. */
  prevLabel: string
  nextLabel: string
  onPrev: () => void
  onNext: () => void
  /** 방 화면 자체(캔버스). 스와이프를 받는 면이 이 아이를 감싼다. */
  children: ReactNode
}

/**
 * 방 이동 조작.
 *
 * 화살표 버튼과 스와이프를 한 컴포넌트가 함께 갖는 이유: 둘은 같은 조작의 두
 * 입력 방식이다. 스와이프만 App 으로 빼면 "방을 옮기는 규칙"이 두 파일로 갈리고,
 * 임계값을 고칠 때 한쪽만 바뀐다.
 *
 * 터치 핸들러를 캔버스를 감싼 div 에 두고 preventDefault 를 부르지 않는다.
 * 그래야 안쪽에서 일어나는 탭이 그대로 살아, 나중에 펫을 직접 탭하는 조작을
 * 붙일 때 이 컴포넌트를 건드리지 않아도 된다.
 */
export function RoomNav({ room, prevLabel, nextLabel, onPrev, onNext, children }: RoomNavProps) {
  const origin = useRef<TouchOrigin | null>(null)

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    // 손가락이 둘 이상이면 확대 동작이다. 방 이동으로 읽지 않는다.
    if (event.touches.length !== 1) {
      origin.current = null
      return
    }
    const touch = event.touches[0]
    origin.current = { x: touch.clientX, y: touch.clientY, at: Date.now() }
  }

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = origin.current
    origin.current = null
    if (!start) return

    const touch = event.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y

    if (Date.now() - start.at > SWIPE_MAX_MS) return
    if (Math.abs(dx) < SWIPE_MIN_PX) return
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return

    // 오른쪽으로 밀면 왼쪽 방이 따라 들어온다. 종이를 넘기는 방향과 같다.
    if (dx > 0) onPrev()
    else onNext()
  }

  return (
    <div
      className="pt-roomnav"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        origin.current = null
      }}
    >
      {children}

      <p className="pt-roomnav__name">{room.label}</p>

      <button
        type="button"
        className="pt-roomnav__arrow pt-roomnav__arrow--prev"
        onClick={onPrev}
        aria-label={`이전 방: ${prevLabel}`}
      >
        <span aria-hidden="true">◀</span>
      </button>
      <button
        type="button"
        className="pt-roomnav__arrow pt-roomnav__arrow--next"
        onClick={onNext}
        aria-label={`다음 방: ${nextLabel}`}
      >
        <span aria-hidden="true">▶</span>
      </button>
    </div>
  )
}
