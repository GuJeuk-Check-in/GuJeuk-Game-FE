import { HOUR_MS, OFFLINE_CAP_MS } from '../game/pet/economy'
import type { ElapsedReport, StatName } from '../game/types'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** StatBar 와 같은 짧은 이름을 쓴다. 같은 스탯이 화면마다 다르게 불리면 안 된다. */
const STAT_LABEL: Record<StatName, string> = {
  hunger: '밥',
  mood: '기분',
  clean: '청결',
  energy: '기운',
}

/** 표시 순서. Object.keys 순서에 기대면 언젠가 뒤바뀐다. */
const STAT_ORDER: readonly StatName[] = ['hunger', 'mood', 'clean', 'energy']

/**
 * "3일 5시간"처럼 큰 단위 둘까지만 읽어준다.
 *
 * "77시간 12분"은 사람이 감을 잡지 못한다. 복귀 카드의 목적은 정확한 시간이
 * 아니라 "얼마나 오래 비웠는지"를 한눈에 알려주는 것이다.
 */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const days = Math.floor(total / DAY_MS)
  const hours = Math.floor((total % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((total % HOUR_MS) / MINUTE_MS)

  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
  return `${minutes}분`
}

/**
 * 받침 유무로 조사를 고른다.
 *
 * 이름이 사용자 입력이라 조사를 하나로 고정하면 "구름은/구르미는"처럼 절반이
 * 어색해진다. 한글 음절의 종성은 (코드 - 0xac00) % 28 로 판별된다.
 */
function particle(word: string, withJong: string, withoutJong: string): string {
  const last = word.codePointAt(word.length - 1)
  if (last === undefined) return withoutJong
  const isHangulSyllable = last >= 0xac00 && last <= 0xd7a3
  if (!isHangulSyllable) return withoutJong
  return (last - 0xac00) % 28 === 0 ? withoutJong : withJong
}

export interface WelcomeBackCardProps {
  report: ElapsedReport
  petName: string
  onClose: () => void
}

/**
 * 복귀 요약 카드.
 *
 * 무슨 일이 있었는지 알려주지 않으면 사용자는 게이지가 왜 줄었는지 모르고,
 * 그 상태에서 줄어든 게이지는 버그로 읽힌다(명세 §5).
 */
export function WelcomeBackCard({ report, petName, onClose }: WelcomeBackCardProps) {
  // 0으로 반올림되는 변화는 줄에서 뺀다. "기분 0"이 네 줄 늘어서 있으면
  // 정작 크게 줄어든 스탯이 묻힌다.
  const changed = STAT_ORDER.filter((stat) => Math.round(report.delta[stat]) !== 0)

  return (
    <div className="pt-welcome" role="dialog" aria-modal="true" aria-labelledby="pt-welcome-title">
      <div className="pt-welcome__sheet">
        <h2 className="pt-welcome__title" id="pt-welcome-title">
          {formatDuration(report.awayMs)} 만이야!
        </h2>
        <p className="pt-welcome__lead">
          {petName}
          {particle(petName, '은', '는')}{' '}
          {report.slept ? '자면서 기다렸어요.' : '기다리고 있었어요.'}
        </p>

        {changed.length > 0 ? (
          <ul className="pt-welcome__list">
            {changed.map((stat) => {
              const delta = Math.round(report.delta[stat])
              return (
                <li key={stat} className="pt-welcome__row">
                  <span className="pt-welcome__stat">{STAT_LABEL[stat]}</span>
                  <span
                    className={delta < 0 ? 'pt-welcome__delta is-down' : 'pt-welcome__delta is-up'}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="pt-welcome__lead">달라진 건 없어요.</p>
        )}

        {report.capped ? (
          // 상한을 숨기면 "2주 비웠는데 왜 조금만 줄었지"가 버그로 읽힌다.
          <p className="pt-welcome__note">
            오래 비웠지만 {formatDuration(OFFLINE_CAP_MS)}까지만 반영했어요. 밥 한 번이면 금방
            회복돼요.
          </p>
        ) : null}

        <button
          type="button"
          className="gj-btn gj-btn--primary pt-welcome__close"
          onClick={onClose}
        >
          다녀왔어
        </button>
      </div>
    </div>
  )
}
