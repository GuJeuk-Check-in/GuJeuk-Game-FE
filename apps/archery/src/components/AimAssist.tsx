import { useEffect, useState } from 'react'
import { Icon } from '@gujuck/ui'
import type { ArcheryGame } from '../game/ArcheryGame'

/** 각도는 0~85도, 세기는 5~100%. 버튼 한 번에 이만큼 움직인다. */
const ANGLE_STEP = 5
const POWER_STEP = 5
const MAX_ANGLE_DEG = 85

interface Props {
  game: ArcheryGame | null
  /** 지금 쏠 수 있는지. 상대 차례거나 화살이 날고 있으면 잠근다. */
  canShoot: boolean
}

/**
 * 드래그 없이 쏘는 조작.
 *
 * WCAG 2.2 AA는 드래그로만 되는 동작에 단일 포인터 대체 수단을 두도록 요구한다.
 * 당겨서 쏘는 것 말고 방법이 없으면 그 기준을 못 맞춘다. 버튼이라 키보드로도
 * 그대로 조작된다.
 *
 * 숨겨 두는 이유는 화면을 좁히지 않기 위해서다. 접는 상태여도 탭 순서에는
 * 그대로 있어 키보드로 닿는다.
 */
export function AimAssist({ game, canShoot }: Props) {
  const [open, setOpen] = useState(false)
  const [angle, setAngle] = useState(45)
  const [power, setPower] = useState(85)

  // 열려 있는 동안에만 캔버스에 미리 보여준다. 닫으면 조준선을 거둔다.
  useEffect(() => {
    if (!game) return
    game.setAssist(open ? angle : null, power / 100)
  }, [game, open, angle, power])

  return (
    <div className="ar-assist">
      <button
        type="button"
        className="gj-btn gj-btn--ghost ar-btn--sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="target" size={15} />
        조작 도우미
      </button>

      {open && (
        <div className="ar-assist__panel">
          <div className="ar-assist__row">
            <span className="ar-assist__label">각도</span>
            <button
              type="button"
              className="gj-btn ar-btn--sm"
              onClick={() => setAngle((v) => Math.max(0, v - ANGLE_STEP))}
              aria-label={`각도 ${ANGLE_STEP}도 낮추기`}
            >
              −
            </button>
            <output className="ar-assist__value">{angle}°</output>
            <button
              type="button"
              className="gj-btn ar-btn--sm"
              onClick={() => setAngle((v) => Math.min(MAX_ANGLE_DEG, v + ANGLE_STEP))}
              aria-label={`각도 ${ANGLE_STEP}도 높이기`}
            >
              +
            </button>
          </div>

          <div className="ar-assist__row">
            <span className="ar-assist__label">세기</span>
            <button
              type="button"
              className="gj-btn ar-btn--sm"
              onClick={() => setPower((v) => Math.max(POWER_STEP, v - POWER_STEP))}
              aria-label={`세기 ${POWER_STEP}퍼센트 낮추기`}
            >
              −
            </button>
            <output className="ar-assist__value">{power}%</output>
            <button
              type="button"
              className="gj-btn ar-btn--sm"
              onClick={() => setPower((v) => Math.min(100, v + POWER_STEP))}
              aria-label={`세기 ${POWER_STEP}퍼센트 높이기`}
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="gj-btn gj-btn--primary"
            disabled={!canShoot}
            onClick={() => game?.fireAssist()}
          >
            <Icon name="arrow" size={16} />
            쏘기
          </button>
        </div>
      )}
    </div>
  )
}
