import { useRef } from 'react'
import type { ReactNode, TouchEvent } from 'react'
import type { RoomDef } from '../game/rooms'
import { highlightAttrs } from './highlight'

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
  /**
   * 이웃 방이 아직 잠겨 있는가(§3 의 놀이터·상점).
   *
   * 잠겼어도 **버튼은 그대로 눌린다.** 눌리지 않는 화살표만 두면 왜 안 되는지
   * 알 수 없다 — 이유는 부르는 쪽이 띄운다(§14 "거절도 반응인가").
   */
  prevLocked?: boolean
  nextLocked?: boolean
  /**
   * 스와이프로도 방을 옮길 수 있는가.
   *
   * 배치 모드에서는 끈다. 가구를 끄는 손짓이 그대로 스와이프 조건을 만족해서,
   * 화분을 옮기려 하면 방이 넘어간다.
   */
  swipe?: boolean
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
export function RoomNav({
  room,
  prevLabel,
  nextLabel,
  prevLocked = false,
  nextLocked = false,
  swipe = true,
  onPrev,
  onNext,
  children,
}: RoomNavProps) {
  const origin = useRef<TouchOrigin | null>(null)

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    // 손가락이 둘 이상이면 확대 동작이다. 방 이동으로 읽지 않는다.
    if (!swipe || event.touches.length !== 1) {
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

      {/* 튜토리얼 중에도 방은 옮길 수 있어야 한다. 2~5단계가 전부 다른 방에서
          끝나므로, 화살표를 막으면 그 자리에서 진행이 멈춘다(TutorialOverlay). */}
      <button
        type="button"
        className="pt-roomnav__arrow pt-roomnav__arrow--prev"
        data-pt-tutorial-pass=""
        onClick={onPrev}
        aria-label={`이전 방: ${prevLabel}${prevLocked ? ' (잠김)' : ''}`}
      >
        <span aria-hidden="true">◀</span>
        {/* 옆에 무엇이 있는지 모른 채 누르게 두지 않는다. 이름을 보여 주면
            "어디로 갈까"가 아니라 "주방으로 갈까"가 되어 한 번에 고른다.
            aria-label 에만 있던 정보를 눈에도 내놓는 것이다. */}
        <span className="pt-roomnav__peek" aria-hidden="true">
          {prevLabel}
          {prevLocked ? ' 🔒' : ''}
        </span>
      </button>
      <button
        type="button"
        className="pt-roomnav__arrow pt-roomnav__arrow--next"
        data-pt-tutorial-pass=""
        // 튜토리얼이 "옆 방으로 가라"를 가리킬 때 잡는 대상이다. 생 문자열 대신
        // highlightAttrs 를 지나 어휘가 tutorial.ts 와 어긋나지 않게 한다.
        {...highlightAttrs('roomNext')}
        onClick={onNext}
        aria-label={`다음 방: ${nextLabel}${nextLocked ? ' (잠김)' : ''}`}
      >
        <span aria-hidden="true">▶</span>
        <span className="pt-roomnav__peek" aria-hidden="true">
          {nextLabel}
          {nextLocked ? ' 🔒' : ''}
        </span>
      </button>
    </div>
  )
}
