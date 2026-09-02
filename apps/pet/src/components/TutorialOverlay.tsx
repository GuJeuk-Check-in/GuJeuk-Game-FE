import { useEffect, useState } from 'react'
import type { TutorialHighlight, TutorialStep } from '../game/pet/tutorial'
// 표식의 이름과 어휘는 highlight.ts 한 곳에서 온다. 다는 쪽과 찾는 쪽이 같은
// 상수를 지나야 오타가 컴파일 타임에 걸린다.
import { HIGHLIGHT_ATTR } from './highlight'

/**
 * 튜토리얼 중에도 반드시 눌려야 하는 것들의 표식.
 *
 * **오버레이가 "무엇이 필요한지"를 판단하지 않는다.** 방을 옮기고 그 방의 행동을
 * 하는 것은 이 게임의 기본 문법이고, 튜토리얼의 모든 단계가 그 둘을 거쳐야
 * 끝난다(§9 의 2~5단계는 전부 "방으로 가서 무엇을 한다"이다). 강조 대상 하나만
 * 남기고 전부 막으면 **2단계에서 화면이 잠긴다** — 강조 대상이 배고픔 게이지라
 * 누를 수조차 없기 때문이다. 그래서 통과시킬 것은 각 요소가 스스로 표시하고,
 * 오버레이는 표시된 것을 뚫어 줄 뿐이다.
 */
const PASS_ATTR = 'data-pt-tutorial-pass'

/** 강조 테두리가 대상에 딱 붙지 않게 두는 여백(px). */
const HOLE_PAD = 6

/**
 * 구멍을 뚫다 조각이 이보다 많아지면 계산을 접는다.
 *
 * 사각형에서 사각형을 빼면 조각이 최대 4개로 늘어난다. 실제 배치에서는 열몇
 * 개로 끝나지만, 요소가 늘어 조각이 폭발하면 화면 전체가 div 로 뒤덮인다.
 * 그 경우에는 막기를 포기하고 강조만 남긴다 — 튜토리얼이 화면을 못 쓰게 만드는
 * 것보다 낫다.
 */
const MAX_BLOCKERS = 64

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface TutorialOverlayProps {
  /** 지금 단계. tutorial.ts 가 준 값을 그리기만 한다 — 규칙은 여기 없다. */
  step: TutorialStep
  /** 건너뛸 수 있는가. 판단은 tutorial.ts 의 canSkip 이 한다. */
  canSkip: boolean
  /** 확인으로 넘어가는 단계에서만 쓴다(step.completedBy === 'confirm'). */
  onConfirm: () => void
  onSkip: () => void
}

function toRect(element: Element, pad: number): Rect {
  const box = element.getBoundingClientRect()
  return {
    left: Math.round(box.left - pad),
    top: Math.round(box.top - pad),
    width: Math.round(box.width + pad * 2),
    height: Math.round(box.height + pad * 2),
  }
}

/** 화면에 실제로 자리를 차지하고 있는가. 감춰진 요소의 0×0 상자를 뚫지 않는다. */
function isVisible(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0
}

/**
 * 사각형들에서 구멍 하나를 뺀다. 겹치지 않는 것은 그대로 둔다.
 *
 * 겹치는 사각형은 구멍 위·아래·왼쪽·오른쪽 조각으로 쪼갠다. 순서를 위·아래
 * 먼저로 잡아야 좌우 조각의 높이가 구멍 높이로 줄어 조각이 겹치지 않는다.
 */
function subtract(rects: readonly Rect[], hole: Rect): Rect[] {
  const holeRight = hole.left + hole.width
  const holeBottom = hole.top + hole.height
  const result: Rect[] = []

  for (const rect of rects) {
    const right = rect.left + rect.width
    const bottom = rect.top + rect.height

    const overlaps =
      hole.left < right && holeRight > rect.left && hole.top < bottom && holeBottom > rect.top

    if (!overlaps) {
      result.push(rect)
      continue
    }

    if (hole.top > rect.top) {
      result.push({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: hole.top - rect.top,
      })
    }
    if (holeBottom < bottom) {
      result.push({
        left: rect.left,
        top: holeBottom,
        width: rect.width,
        height: bottom - holeBottom,
      })
    }

    const bandTop = Math.max(rect.top, hole.top)
    const bandBottom = Math.min(bottom, holeBottom)

    if (hole.left > rect.left) {
      result.push({
        left: rect.left,
        top: bandTop,
        width: hole.left - rect.left,
        height: bandBottom - bandTop,
      })
    }
    if (holeRight < right) {
      result.push({
        left: holeRight,
        top: bandTop,
        width: right - holeRight,
        height: bandBottom - bandTop,
      })
    }
  }

  return result
}

interface Layout {
  /** 강조 테두리를 두를 자리. 대상이 화면에 없으면 null. */
  highlight: Rect | null
  /** 어두워지고 손이 닿지 않는 조각들. */
  blockers: readonly Rect[]
}

function measure(highlight: TutorialHighlight): Layout {
  const screen: Rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }

  const target =
    highlight === 'none' ? null : document.querySelector(`[${HIGHLIGHT_ATTR}="${highlight}"]`)
  const targetRect = target === null ? null : toRect(target, HOLE_PAD)

  const holes: Rect[] = []
  if (targetRect !== null && isVisible(targetRect)) holes.push(targetRect)

  document.querySelectorAll(`[${PASS_ATTR}]`).forEach((element) => {
    const rect = toRect(element, 2)
    if (isVisible(rect)) holes.push(rect)
  })

  let blockers: Rect[] = [screen]
  for (const hole of holes) {
    blockers = subtract(blockers, hole)
    if (blockers.length > MAX_BLOCKERS) return { highlight: targetRect, blockers: [] }
  }

  return { highlight: targetRect, blockers }
}

/**
 * 말풍선 자리.
 *
 * 강조 대상이 화면 위쪽에 있으면 그 아래에, 아래쪽에 있으면 그 위에 붙인다.
 * 대상 위에 겹쳐 두면 방금 강조한 것을 자기가 가린다.
 */
function bubbleStyle(highlight: Rect | null): { top?: number; bottom?: number } {
  if (highlight === null) return { bottom: Math.round(window.innerHeight * 0.28) }

  const below = highlight.top + highlight.height
  if (below < window.innerHeight / 2) return { top: below + 12 }
  return { bottom: window.innerHeight - highlight.top + 12 }
}

/**
 * 튜토리얼 말풍선과 강조.
 *
 * **이 컴포넌트는 튜토리얼 규칙을 하나도 모른다.** 몇 단계인지도, 무엇이 이
 * 단계를 끝내는지도 판단하지 않는다. step 에 적힌 문구를 띄우고, 적힌 대상을
 * 찾아 테두리를 두르고, 확인이 필요한 단계에만 버튼을 낸다. 조건 판정이 여기로
 * 들어오는 순간 tutorial.ts 와 두 벌이 되어 "화면은 넘어갔는데 세이브는 그대로"
 * 가 만들어진다.
 */
export function TutorialOverlay({ step, canSkip, onConfirm, onSkip }: TutorialOverlayProps) {
  const [layout, setLayout] = useState<Layout>({ highlight: null, blockers: [] })

  // 대상의 자리는 방 전환·회전·게이지 갱신으로 계속 움직인다. 한 번 재고 마는
  // 대신 매 프레임 다시 재되, 값이 달라졌을 때만 상태를 바꾼다 — 그러지 않으면
  // 매 프레임 리렌더가 돌아 배치 애니메이션이 끊긴다.
  useEffect(() => {
    let frame = 0
    let previous = ''

    const sync = () => {
      const next = measure(step.highlight)
      const key = JSON.stringify(next)
      if (key === previous) return
      previous = key
      setLayout(next)
    }

    // **첫 측정은 프레임을 기다리지 않는다.** requestAnimationFrame 은 브라우저가
    // 프레임을 미루는 동안(탭이 가려짐·백그라운드 렌더러) 한 번도 불리지 않을 수
    // 있는데, 그 상태로 두면 오버레이가 강조도 막기도 없이 말풍선만 띄운 채 서
    // 있게 된다. 처음 한 번은 반드시 재고, 그다음부터 프레임을 따라간다.
    sync()

    const loop = () => {
      sync()
      frame = window.requestAnimationFrame(loop)
    }

    frame = window.requestAnimationFrame(loop)
    // 프레임이 멈춰 있어도 화면 크기가 바뀌면 자리는 반드시 다시 재야 한다.
    window.addEventListener('resize', sync)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', sync)
    }
  }, [step.highlight])

  const { highlight, blockers } = layout
  const place = bubbleStyle(highlight)

  return (
    <div className="pt-tut" role="dialog" aria-modal="false" aria-live="polite">
      {blockers.map((rect) => (
        <div
          key={`${rect.left},${rect.top},${rect.width},${rect.height}`}
          className="pt-tut__block"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      ))}

      {highlight ? (
        <div
          className="pt-tut__ring"
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      ) : null}

      {/* key 를 단계 id 로 두어 단계가 바뀔 때마다 등장 애니메이션이 다시 돈다.
          말풍선이 조용히 글자만 갈리면 다음 지시가 온 것을 놓친다. */}
      <div key={step.id} className="pt-tut__bubble" style={place}>
        <p className="pt-tut__text">{step.text}</p>

        <div className="pt-tut__buttons">
          {/* 넘기는 조건이 '확인'인 단계에서만 버튼이 뜬다. 나머지 단계는 실제로
              해 봐야 넘어간다(§9) — 버튼을 두면 읽고 넘기는 안내가 된다. */}
          {step.completedBy === 'confirm' ? (
            <button type="button" className="gj-btn gj-btn--primary pt-tut__ok" onClick={onConfirm}>
              확인
            </button>
          ) : null}

          {/* 0~1단계(부화·이름)는 건너뛸 수 없다. 그 판단은 tutorial.ts 가 한다. */}
          {canSkip ? (
            <button type="button" className="gj-btn gj-btn--ghost pt-tut__skip" onClick={onSkip}>
              건너뛰기
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
