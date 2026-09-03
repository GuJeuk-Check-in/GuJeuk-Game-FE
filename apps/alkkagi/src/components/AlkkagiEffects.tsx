import { useEffect, useRef, useState } from 'react'
import type { AlkkagiSnapshot } from '../game/AlkkagiGame'

const IMPACT_PARTICLES = Array.from({ length: 12 }, (_, index) => index)

type ArenaSplash = {
  readonly id: number
  readonly kind: 'launch' | 'ringout' | 'grow' | 'anchor' | 'turn'
  readonly eyebrow: string
  readonly label: string
}

export function AlkkagiEffects({
  snapshot,
  collisionId,
}: {
  snapshot: AlkkagiSnapshot
  collisionId: number
}) {
  const previous = useRef(snapshot)
  const nextId = useRef(0)
  const clearSplashTimer = useRef<number | null>(null)
  const [splash, setSplash] = useState<ArenaSplash | null>(null)

  useEffect(() => {
    const before = previous.current
    const event = readEvent(before, snapshot, nextId.current)
    previous.current = snapshot
    if (event === null) return

    nextId.current += 1
    setSplash(event)
    if (clearSplashTimer.current !== null) window.clearTimeout(clearSplashTimer.current)
    clearSplashTimer.current = window.setTimeout(() => setSplash(null), 900)
  }, [snapshot])

  useEffect(
    () => () => {
      if (clearSplashTimer.current !== null) window.clearTimeout(clearSplashTimer.current)
    },
    [],
  )

  return (
    <div className="ak-effects" aria-hidden="true">
      <div className={`ak-impact-flash ${collisionId > 0 ? 'is-active' : ''}`} key={collisionId}>
        <span className="ak-impact-flash__ring" />
        {IMPACT_PARTICLES.map((particle) => (
          <span key={particle} className="ak-impact-flash__particle" />
        ))}
      </div>
      {splash ? (
        <div className={`ak-splash ak-splash--${splash.kind}`} key={splash.id}>
          <span className="ak-splash__eyebrow">{splash.eyebrow}</span>
          <strong>{splash.label}</strong>
        </div>
      ) : null}
      {snapshot.settling ? (
        <div className="ak-speed-lines">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  )
}

function readEvent(before: AlkkagiSnapshot, current: AlkkagiSnapshot, id: number): ArenaSplash | null {
  if (current.black < before.black || current.white < before.white) {
    return { id, kind: 'ringout', eyebrow: '통쾌한 한 방!', label: '링 아웃!' }
  }
  if (current.armingSkill !== before.armingSkill && current.armingSkill !== null) {
    return current.armingSkill === 'GROW'
      ? { id, kind: 'grow', eyebrow: '특수 기술 준비', label: '슈퍼 사이즈!' }
      : { id, kind: 'anchor', eyebrow: '특수 기술 준비', label: '철벽 고정!' }
  }
  if (current.settling && !before.settling) {
    return { id, kind: 'launch', eyebrow: '힘껏 날아간다', label: '슈우웅!' }
  }
  if (current.turn !== before.turn && current.turn !== null && !current.settling) {
    return { id, kind: 'turn', eyebrow: '다음 공격', label: current.turn === 'black' ? '흑 차례!' : '백 차례!' }
  }
  return null
}
