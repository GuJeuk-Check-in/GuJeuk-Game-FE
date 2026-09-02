// 스탯 감소와 오프라인 경과. 순수 함수만 둔다 — React 도 Canvas 도 모른다.
//
// 수치는 전부 economy.ts 에서 가져온다. 여기에 숫자를 직접 적으면 밸런싱의 출처가
// 두 곳이 되고, 한쪽만 고친 채로 어긋난다.
//
// 근거는 docs/PET_TOWN_SPEC.md §4(스탯) · §5(시간 경과) · §7(재화) 이다.

import type { DailyState, ElapsedReport, PetSave, Stats } from '../types'
import { localDateKey } from './clock'
import {
  clampStat,
  DAILY_CHECKIN_COIN,
  DECAY_PER_HOUR,
  DIRTY_MOOD_PENALTY_PER_HOUR,
  HOUR_MS,
  OFFLINE_CAP_MS,
  SLEEP_DECAY_FACTOR,
  SLEEP_ENERGY_PER_HOUR,
  SLEEP_MAX_MS,
  WELCOME_BACK_MIN_MS,
} from './economy'

/**
 * 자는 동안 에너지를 회복해 주는 구간의 길이(ms).
 *
 * 회복 상한은 "이번에 적용하는 구간"이 아니라 "잠든 뒤 누적 시간"에 걸린다.
 * 그래서 창을 [잠든 뒤 경과 시작, 끝] 으로 놓고 SLEEP_MAX_MS 와 겹치는 부분만 센다.
 * 구간 단위로 매번 8시간을 새로 주면 앱을 여러 번 열었다 닫는 것만으로 무한
 * 회복이 된다.
 */
function sleepRecoverMs(since: number, lastSeenAt: number, appliedMs: number): number {
  const before = Math.max(0, lastSeenAt - since)
  const after = before + appliedMs
  return Math.max(0, Math.min(after, SLEEP_MAX_MS) - Math.min(before, SLEEP_MAX_MS))
}

function decayStats(stats: Stats, hours: number, asleep: boolean, recoverHours: number): Stats {
  const factor = asleep ? SLEEP_DECAY_FACTOR : 1
  const cleanRate = DECAY_PER_HOUR.clean * factor

  // 청결은 경과 도중에 0 에 닿을 수 있다. 기분 추가 감소를 전체 구간에 일괄
  // 적용하면 아직 깨끗했던 시간까지 벌을 받아 값이 과하게 떨어진다. 0 이 되는
  // 시점을 먼저 구해서 그 이후 구간에만 적용한다.
  const hoursUntilDirty = cleanRate > 0 ? stats.clean / cleanRate : Number.POSITIVE_INFINITY
  const dirtyHours = Math.max(0, hours - hoursUntilDirty)

  return {
    hunger: clampStat(stats.hunger - DECAY_PER_HOUR.hunger * factor * hours),
    // 청결 0 벌점에도 factor 를 곱한다. 명세 §4 의 표는 이 벌점을 별개 항목이
    // 아니라 "기분 감소가 시간당 2.0 추가"로 정의하므로, 수면 중 절반 규칙의
    // 대상이다. 빼면 더러운 펫에서는 벌점이 절반으로 깎인 기본 감소와 같아져
    // 재우는 것이 손해가 되고, 절반 규칙을 둔 이유가 그대로 되살아난다.
    mood: clampStat(
      stats.mood -
        DECAY_PER_HOUR.mood * factor * hours -
        DIRTY_MOOD_PENALTY_PER_HOUR * factor * dirtyHours,
    ),
    clean: clampStat(stats.clean - cleanRate * hours),
    // 자는 동안 에너지는 줄지 않고 오히려 회복한다(economy.ts 의 SLEEP_DECAY_FACTOR 주석).
    energy: clampStat(
      asleep
        ? stats.energy + SLEEP_ENERGY_PER_HOUR * recoverHours
        : stats.energy - DECAY_PER_HOUR.energy * hours,
    ),
  }
}

/**
 * 화면에 들어올 때 한 번 도는 함수. 경과 시간 반영 + 수면 회복 + 날짜 넘김을
 * 모두 처리하고, 입력을 변형하지 않은 새 세이브와 리포트를 돌려준다.
 */
export function applyElapsed(save: PetSave, now: number): { next: PetSave; report: ElapsedReport } {
  // 음수 경과는 0 으로 본다. 기기 시계가 되돌아간 경우인데, 그대로 곱하면 스탯이
  // 늘어나 시계를 돌리는 것이 이득이 된다(§5).
  const awayMs = Math.max(0, now - save.lastSeenAt)
  const appliedMs = Math.min(awayMs, OFFLINE_CAP_MS)
  const capped = awayMs > OFFLINE_CAP_MS

  const asleep = save.sleep !== null
  const hours = appliedMs / HOUR_MS
  const recoverHours =
    save.sleep === null ? 0 : sleepRecoverMs(save.sleep.since, save.lastSeenAt, appliedMs) / HOUR_MS

  const stats = decayStats(save.stats, hours, asleep, recoverHours)

  const today = localDateKey(now)
  const rolled = save.daily.date !== today
  const rolledDaily: DailyState = rolled
    ? { date: today, coinsEarned: 0, checkedIn: false, pets: 0 }
    : save.daily

  // 지급 여부는 날짜가 아니라 checkedIn 으로 판단한다. 같은 날 여러 번 열어도
  // 한 번만 주려면 "오늘 이미 받았는가" 하나만 보면 된다.
  const grantCheckin = !rolledDaily.checkedIn
  const daily: DailyState = grantCheckin ? { ...rolledDaily, checkedIn: true } : rolledDaily

  const next: PetSave = {
    ...save,
    stats,
    wallet: { ...save.wallet, coins: save.wallet.coins + (grantCheckin ? DAILY_CHECKIN_COIN : 0) },
    daily,
    lastSeenAt: now,
  }

  const report: ElapsedReport = {
    appliedMs,
    awayMs,
    capped,
    // 0 에서 잘린 뒤의 실제 변화량이다. 이론상 감소량을 그대로 보여주면 복귀
    // 카드가 "배고픔 -72" 라고 하는데 게이지는 10 만 줄어 있는 일이 생긴다.
    delta: {
      hunger: stats.hunger - save.stats.hunger,
      mood: stats.mood - save.stats.mood,
      clean: stats.clean - save.stats.clean,
      energy: stats.energy - save.stats.energy,
    },
    slept: asleep && appliedMs > 0,
  }

  return { next, report }
}

/**
 * 복귀 요약 카드를 띄울 것인가.
 *
 * 판정을 화면의 JSX 안에 두면 M1 완료 기준의 절반("복귀 카드가 뜬다")을 손으로
 * 눌러 보는 것 말고는 확인할 방법이 없다. 순수 함수로 빼서 테스트가 경계를
 * 못 박게 한다.
 *
 * 기준이 appliedMs 가 아니라 awayMs 인 이유: 카드가 말하는 것은 "얼마나 오래
 * 비웠는가"이고, 상한에 잘렸다는 사실 자체는 카드 안에서 따로 알린다. appliedMs
 * 로 재면 상한이 4시간 아래로 내려가는 순간 카드가 영영 뜨지 않는다.
 */
export function shouldShowWelcomeBack(report: ElapsedReport): boolean {
  return report.awayMs >= WELCOME_BACK_MIN_MS
}
