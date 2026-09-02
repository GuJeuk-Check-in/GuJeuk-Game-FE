import { useEffect, useState } from 'react'
import { DAILY_COIN_CAP } from '../game/pet/economy'
import type { Settlement } from '../game/pet/minigames'

/**
 * 숫자가 올라가는 시간(ms).
 *
 * 카드가 뜨자마자 최종 숫자가 박혀 있으면 "얼마를 벌었는지"가 아니라 "얼마를
 * 갖고 있는지"로 읽힌다. 세는 동안이 곧 보상의 연출이다. 다만 이 게임의 한
 * 세션이 1~3분이라, 두 번째 판부터 기다림이 되지 않을 만큼 짧게 잡았다.
 */
const COUNT_UP_MS = 700

/**
 * 0 에서 target 까지 세어 올린다.
 *
 * 값이 정수로만 올라가는 것은 도트 게임의 연출 규칙(정수 픽셀)과 같은 이유다 —
 * 소수점이 흔들리는 숫자는 계산 중인 것처럼 보이지 카운트업으로 읽히지 않는다.
 */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    // 움직임을 끈 사용자에게는 세지 않고 결과만 보여준다. 이 카드에서 숫자는
    // 장식이 아니라 정보라, 애니메이션을 뺀다고 읽을 것이 사라지면 안 된다.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || target <= 0) {
      setValue(target)
      return
    }

    let frame = 0
    const started = performance.now()

    const step = (now: number) => {
      const t = Math.min(1, (now - started) / COUNT_UP_MS)
      setValue(Math.round(target * t))
      if (t < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return value
}

export interface ResultCardProps {
  /** 방금 한 게임 이름. 어떤 놀이의 결과인지 카드가 스스로 밝힌다. */
  label: string
  /** 점수의 단위. 게임마다 다르다(개 · m · 라운드). */
  unit: string
  score: number
  settlement: Settlement
  onAgain: () => void
  onClose: () => void
}

/**
 * 미니게임 결과 카드.
 *
 * **덜 받았으면 왜 덜 받았는지 반드시 밝힌다(명세 §7).** 배고픔 절반도 일일
 * 상한도 조용히 적용하면 "코인이 안 들어왔다"는 버그 신고가 된다. 원래 값과
 * 실제 받은 값을 나란히 보여주는 것이 그 오해를 막는 가장 싼 방법이다.
 */
export function ResultCard({ label, unit, score, settlement, onAgain, onClose }: ResultCardProps) {
  const shownScore = useCountUp(score)
  const shownCoins = useCountUp(settlement.coins)
  // settle 이 이미 내림한 정수다(minigames.ts). 표시용으로 다시 손대지 않는다 —
  // 여기서 한 번 더 반올림해 두면 다음 사람이 Settlement.exp 를 소수로 믿는다.
  const shownExp = useCountUp(settlement.exp)

  const adjusted = settlement.coins !== settlement.coinsBeforeAdjust

  return (
    <div className="pt-result" role="dialog" aria-modal="true" aria-labelledby="pt-result-title">
      <div className="pt-result__sheet">
        <h2 className="pt-result__title" id="pt-result-title">
          {label} 끝!
        </h2>

        <p className="pt-result__score">
          <span className="pt-result__scoreValue">{shownScore}</span>
          <span className="pt-result__scoreUnit">{unit}</span>
        </p>

        <ul className="pt-result__list">
          <li className="pt-result__row">
            <span className="pt-result__key">코인</span>
            <span className="pt-result__coin">+{shownCoins}</span>
          </li>
          <li className="pt-result__row">
            <span className="pt-result__key">경험치</span>
            <span className="pt-result__exp">+{shownExp}</span>
          </li>
        </ul>

        {/* 깎였으면 원래 값을 함께 보여준다. 결과만 바뀌어 있으면 계수가 잘못된
            것인지 벌칙이 걸린 것인지 화면에서 구분할 수 없다. */}
        {adjusted ? (
          <p className="pt-result__before">
            원래 {settlement.coinsBeforeAdjust}코인 → {settlement.coins}코인
          </p>
        ) : null}

        {/* 배고픔 0 은 코인 절반과 EXP 0 을 함께 건다(§4). 둘 중 하나만 밝히면
            "경험치는 왜 0 이지"가 남아 결국 버그로 보인다. */}
        {settlement.hungryHalved ? (
          <p className="pt-result__note">
            배가 고파서 코인이 절반이 되고 경험치도 못 받았어요. 밥부터 주자!
          </p>
        ) : null}

        {settlement.dailyCapped ? (
          <p className="pt-result__note">
            오늘은 충분히 놀았어. 미니게임 코인은 하루 {DAILY_COIN_CAP}까지예요. 내일 또 벌 수
            있어요.
          </p>
        ) : null}

        {settlement.leveledUpTo === null ? null : (
          <p className="pt-result__levelup">레벨업! Lv.{settlement.leveledUpTo}</p>
        )}

        <div className="pt-result__buttons">
          <button type="button" className="gj-btn pt-result__btn" onClick={onClose}>
            그만하기
          </button>
          <button type="button" className="gj-btn gj-btn--primary pt-result__btn" onClick={onAgain}>
            한 판 더
          </button>
        </div>
      </div>
    </div>
  )
}
