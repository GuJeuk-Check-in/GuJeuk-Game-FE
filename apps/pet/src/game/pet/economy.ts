// 밸런싱 상수와 그 파생 계산.
//
// **수치는 전부 여기 한 곳에만 둔다.** 감소율이 stats.ts 에, 가격이 화면에 흩어지면
// 밸런싱을 고칠 때마다 찾아다녀야 하고 결국 두 곳이 어긋난다.
//
// 값의 근거는 docs/PET_TOWN_SPEC.md §4·§6·§7 이다. 이 값들은 실제 플레이로 측정한
// 것이 아니라 설계값이므로, 만들어 보고 조정한다. 조정할 때는 바꾼 이유를 그 상수
// 옆에 적는다 — 숫자만 바뀌어 있으면 다음 사람이 되돌린다.

import type { Stage, Stats } from '../types'

export const HOUR_MS = 60 * 60 * 1000

// ────────────────────────────────────────────────────────────────────────────
// 스탯
// ────────────────────────────────────────────────────────────────────────────

export const STAT_MIN = 0
export const STAT_MAX = 100

/**
 * 시간당 감소량.
 *
 * 포만감 100 → 0 까지 약 16.7시간이다. "하루 한 번 들르면 유지되고 이틀 비우면
 * 눈에 띄게 나빠지는" 페이스를 목표로 잡았다.
 */
export const DECAY_PER_HOUR: Stats = {
  hunger: 6.0,
  mood: 4.0,
  clean: 3.0,
  energy: 2.0,
}

/**
 * 자는 동안 감소가 절반이 된다(에너지 제외 — 에너지는 오히려 회복한다).
 *
 * 절반으로 깎지 않으면 잠든 사이 굶게 되어 재우는 행동 자체가 손해가 되고,
 * 아무도 펫을 재우지 않게 된다.
 */
export const SLEEP_DECAY_FACTOR = 0.5

/** 청결이 0이면 기분이 이만큼 더 빨리 준다. 방치가 겹칠수록 나빠지게 만드는 장치다. */
export const DIRTY_MOOD_PENALTY_PER_HOUR = 2.0

// ────────────────────────────────────────────────────────────────────────────
// 시간 경과
// ────────────────────────────────────────────────────────────────────────────

/**
 * 오프라인 경과를 반영하는 상한.
 *
 * 2주 만에 돌아온 사람에게 텅 빈 게이지를 보여주면 그대로 앱을 지운다. 최악의
 * 경우에도 포만감은 100 → 28 로만 떨어진다(6 × 12 = 72).
 */
export const OFFLINE_CAP_MS = 12 * HOUR_MS

/** 이만큼 이상 비웠다 돌아오면 복귀 요약 카드를 띄운다. */
export const WELCOME_BACK_MIN_MS = 4 * HOUR_MS

/** 자는 동안 시간당 회복하는 에너지. */
export const SLEEP_ENERGY_PER_HOUR = 25

/** 이보다 오래 자도 더 회복하지 않는다. 하루 종일 켜 두는 것이 이득이 되면 안 된다. */
export const SLEEP_MAX_MS = 8 * HOUR_MS

// ────────────────────────────────────────────────────────────────────────────
// 돌봄
// ────────────────────────────────────────────────────────────────────────────

export interface FoodSpec {
  readonly price: number
  readonly hunger: number
  readonly mood: number
  /**
   * 먹여서 회복하는 기운. 대부분 0 이다.
   *
   * 에너지는 미니게임 판수를 막는 유일한 자원이라(§4) 아무 음식이나 이걸 주면
   * 그 제한이 사라진다. 우유·치즈만 조금 주고, 그마저도 일일 코인 상한
   * (DAILY_COIN_CAP)이 위에서 막고 있어 무한히 돌지는 않는다. 코인을 써서 한
   * 판을 더 사는 선택지를 만들려는 것이지 제한을 없애려는 것이 아니다.
   */
  readonly energy: number
  readonly exp: number
  readonly label: string
}

/**
 * 상점에서 파는 음식.
 *
 * 처음에는 사과·빵·케이크 셋뿐이었는데, 도트 에셋은 11종이 이미 그려져 있었고
 * 나머지 8종은 import 만 된 채 아무 데서도 쓰이지 않았다. 살 것이 셋뿐이라
 * 주방과 상점에 머물 이유가 없었다.
 *
 * **값만 다른 음식을 늘리는 것은 의미가 없다.** 8종을 넣으면서 역할을 갈랐다.
 *
 * - 사탕·딸기: 싸고 배는 거의 안 부르지만 기분이 크게 오른다. 기분만 떨어졌을 때
 * - 오렌지·쿠키: 값싼 중간치. 자주 들르는 사람이 부담 없이 집는다
 * - 우유·치즈: 기운을 조금 준다. 미니게임을 한 판 더 하고 싶을 때 코인으로 산다
 * - 빵·도넛: 한 번에 크게 채우는 주식
 * - 수박·케이크: 비싸고 확실하다. 오래 비웠다 돌아왔을 때
 *
 * 순서는 싼 것부터다. FOOD_IDS 가 이 순서를 그대로 쓰고 화면이 그대로 그린다.
 */
export const FOODS = {
  apple: { price: 10, hunger: 15, mood: 0, energy: 0, exp: 8, label: '사과' },
  candy: { price: 15, hunger: 5, mood: 12, energy: 0, exp: 5, label: '사탕' },
  orange: { price: 18, hunger: 14, mood: 6, energy: 0, exp: 8, label: '오렌지' },
  cookie: { price: 20, hunger: 18, mood: 5, energy: 0, exp: 7, label: '쿠키' },
  strawberry: { price: 22, hunger: 12, mood: 14, energy: 0, exp: 9, label: '딸기' },
  bread: { price: 25, hunger: 35, mood: 0, energy: 0, exp: 8, label: '빵' },
  milk: { price: 30, hunger: 20, mood: 0, energy: 15, exp: 9, label: '우유' },
  cheese: { price: 35, hunger: 30, mood: 3, energy: 5, exp: 9, label: '치즈' },
  donut: { price: 45, hunger: 45, mood: 12, energy: 0, exp: 10, label: '도넛' },
  watermelon: { price: 55, hunger: 65, mood: 8, energy: 0, exp: 11, label: '수박' },
  cake: { price: 60, hunger: 70, mood: 10, energy: 0, exp: 12, label: '케이크' },
} as const satisfies Record<string, FoodSpec>

export interface FurnitureSpec {
  readonly price: number
  readonly label: string
}

/**
 * 상점에서 파는 가구.
 *
 * 가격을 30~150 으로 벌려 둔 것은 **일일 코인 상한이 300** 이기 때문이다(§7).
 * 싼 것은 하루에 몇 개씩 살 수 있고 비싼 것은 며칠을 모아야 한다. 전부 하루치로
 * 살 수 있으면 상점이 첫날에 소진되고, 전부 며칠치면 처음 며칠이 텅 빈다.
 */
export const FURNITURE = {
  cushion: { price: 30, label: '쿠션' },
  plant: { price: 40, label: '화분' },
  vase: { price: 50, label: '꽃병' },
  frame: { price: 60, label: '액자' },
  clock: { price: 70, label: '벽시계' },
  lamp: { price: 80, label: '스탠드' },
  teddy: { price: 90, label: '곰인형' },
  shelf: { price: 120, label: '책장' },
  fishbowl: { price: 150, label: '어항' },
} as const satisfies Record<string, FurnitureSpec>

/**
 * 포만감이 이 값 이상일 때 먹이면 스탯만 오르고 EXP 는 0 이다.
 *
 * 이 조건이 없으면 사과를 연타하는 것이 최적 전략이 되어 게임이 사라진다.
 */
export const OVEREAT_EXP_THRESHOLD = 90

/** 청결이 이 값 이상일 때 씻기면 같은 이유로 EXP 가 0 이다. */
export const OVERCLEAN_EXP_THRESHOLD = 70

export const WASH_EXP = 6
export const PET_MOOD_GAIN = 5
export const PET_EXP = 2

/** 쓰다듬기로 기분을 무한히 채우지 못하게 하루 횟수를 막는다. */
export const PET_DAILY_LIMIT = 5

/** 기상 시 한 번 준다. 자는 동안 매 시간 주면 방치가 최적 전략이 된다. */
export const WAKE_EXP = 10

// ────────────────────────────────────────────────────────────────────────────
// 레벨
// ────────────────────────────────────────────────────────────────────────────

/**
 * 개발 중에만 켜는 빠른 성장.
 *
 * 육성 게임은 설계대로면 Lv10 까지 한 달이라, 성장과 관련된 것을 고칠 때마다
 * 실제로 며칠을 기다려야 확인이 된다. 그래서 **감속만 하고 이 스위치를 두지
 * 않으면 다음 사람이 확인할 방법이 없어진다.**
 *
 * 기본값은 꺼짐이다. 환경변수가 없으면(테스트 · 배포 빌드) 언제나 설계값으로
 * 돈다 — 켜는 쪽을 명시적으로 만들어야 배포에 실수로 섞이지 않는다.
 * 켜려면 `apps/pet/.env.local` 에 `VITE_PET_FAST_GROWTH=1` 을 적는다.
 */
export const FAST_GROWTH = import.meta.env?.VITE_PET_FAST_GROWTH === '1'

/** 빠른 성장에서 필요 EXP 를 나누는 값. 한 달이 나흘 남짓이 된다. */
const FAST_GROWTH_DIVISOR = 8

/**
 * 다음 레벨까지 필요한 EXP. 선형이다.
 *
 * 지수 곡선을 쓰지 않는 이유는 후반 구간이 벽이 되면 결국 방치 게임이 되기
 * 때문이다. 10레벨까지 누적 3,060 으로(9 × 100 + 60 × (0+1+…+8)), 하루 80~120 을
 * 벌면 26~38일, 약 한 달이다.
 */
export function expForNextLevel(level: number): number {
  const base = 100 + 60 * (level - 1)
  if (!FAST_GROWTH) return base
  return Math.max(10, Math.round(base / FAST_GROWTH_DIVISOR))
}

/**
 * 레벨업 보상 코인.
 *
 * **인자는 "도달한 레벨"이다.** Lv1→2 면 2 를 넘겨 100 이 나온다(명세 §6).
 * 올리기 전 레벨로 부르면 Lv10 까지 누적이 2,700 이 아니라 2,250 이 되어
 * 명세 §7 의 재화 예산과 어긋난다.
 */
export function levelUpReward(level: number): number {
  return 50 * level
}

/** 외형 단계. 능력 차이는 없다 — 크기와 머리 비율만 바뀐다. */
export function stageForLevel(level: number): Stage {
  if (level >= 10) return 'adult'
  if (level >= 5) return 'child'
  return 'baby'
}

/** 단계가 바뀌는 레벨. petPixelSize 가 구간을 잡는 데 쓴다. */
const STAGE_START_LEVEL = { baby: 1, child: 5, adult: 10 } as const

/** 단계별 그림 크기(px). sprites.ts 의 PET_METRICS.size 와 같아야 한다. */
const STAGE_SIZE = { baby: 80, child: 104, adult: 128 } as const

/** 어른이 된 뒤로도 레벨마다 이만큼씩 더 큰다. */
const ADULT_GROWTH_PER_LEVEL = 2

/** 아무리 커도 여기서 멈춘다. 방보다 커지면 우스워진다. */
const MAX_PET_SIZE = 160

/**
 * 이 레벨에서 펫을 몇 픽셀로 그릴지.
 *
 * 예전에는 단계마다 크기가 고정이라 **Lv5→6→7→8→9 가 전부 같은 모습**이었다.
 * 레벨이 올라도 아무 변화가 없으니 키우는 보람이 없다는 말이 나왔다.
 *
 * 그림을 새로 그리지 않고, 있는 단계 그림을 레벨에 따라 조금씩 키운다. 다음
 * 단계의 크기까지 선형으로 이어 두어서 단계가 바뀌는 순간에도 갑자기 커지지
 * 않는다 — 매 레벨 조금씩 자라다가 어느 순간 그림이 바뀌는 모양이 된다.
 *
 * **정수 픽셀로 돌려준다.** 캔버스는 imageSmoothingEnabled=false 라 최근접
 * 확대가 걸리는데, 소수 크기로 그리면 픽셀이 고르지 않게 늘어난다(§12.3).
 */
export function petPixelSize(level: number): number {
  const stage = stageForLevel(level)
  const start = STAGE_START_LEVEL[stage]
  const from = STAGE_SIZE[stage]

  if (stage === 'adult') {
    return Math.min(MAX_PET_SIZE, from + Math.max(0, level - start) * ADULT_GROWTH_PER_LEVEL)
  }

  const next = stage === 'baby' ? 'child' : 'adult'
  const span = STAGE_START_LEVEL[next] - start
  const progress = Math.min(1, Math.max(0, (level - start) / span))

  return Math.round(from + (STAGE_SIZE[next] - from) * progress)
}

// ────────────────────────────────────────────────────────────────────────────
// 재화
// ────────────────────────────────────────────────────────────────────────────

export const DAILY_CHECKIN_COIN = 30
export const TUTORIAL_COMPLETE_COIN = 100

/**
 * 튜토리얼 2단계 진입 지급. 먹일 것이 없으면 2단계에서 그대로 막힌다(§9).
 *
 * 3개인 것은 한 번 먹여 보고도 두 번 더 해 볼 여유를 남기기 위해서다. 1개면
 * 실수로 배부를 때 먹여 EXP 0 을 받은 사람이 남은 튜토리얼을 빈손으로 간다.
 *
 * 개발용 지급 버튼(App.tsx)도 이 값을 쓴다. 같은 개수라는 사실을 주석으로만
 * 적어 두면 한쪽을 고치는 순간 그 주석이 거짓이 된다.
 */
export const TUTORIAL_APPLE_COUNT = 3

/**
 * 튜토리얼 5단계 진입 지급(§9). 가장 싼 가구(쿠션 30)와 음식을 살 수 있는 액수다.
 *
 * **§9 는 "코인 100 을 보장한다"고 적었지만 구현은 하한이 아니라 진입 지급이다.**
 * 하한으로 두려면 정산이 "지금 몇 단계인가"를 물어야 하고, 그러면 §7 의 상한·벌칙
 * 규칙과 튜토리얼 규칙이 한 함수 안에서 섞인다. 명세 쪽 문장을 지급으로 고쳐 둘을
 * 맞췄다(§9 · §14 의 M4 기록).
 */
export const TUTORIAL_START_COIN = 100

/**
 * 튜토리얼을 시작할 때 세우는 배고픔·청결.
 *
 * **가득 찬 게이지로 시작하면 2·3단계가 자기가 시킨 것을 시연하지 못한다.** 새
 * 펫은 배고픔·청결이 100 인데(save.ts 의 createSave), 2단계가 강조한 배고픔
 * 게이지는 사과를 먹여도 100 에서 잘려 1px 도 움직이지 않고 과식 판정
 * (OVEREAT_EXP_THRESHOLD 90)에 걸려 "배부른데도 먹었어요"가 뜬다. 3단계도
 * 같다(OVERCLEAN_EXP_THRESHOLD 70). 두 값 모두 그 문턱 아래로 내려 두어야 첫
 * 행동에서 게이지가 눈에 띄게 차오르고 EXP 도 붙는다(§14 "값이 변할 때 보간되는가").
 *
 * 튜토리얼을 지나면 다시 채워 주지 않는다. 여기서 깎은 만큼은 사과 3개로
 * 되돌릴 수 있는 폭이다.
 */
export const TUTORIAL_START_HUNGER = 60
export const TUTORIAL_START_CLEAN = 50

/**
 * 미니게임으로 하루에 벌 수 있는 코인 상한.
 *
 * 상한이 없으면 반복 플레이로 상점이 하루 만에 소진되고 그다음 날부터 살 게
 * 없어진다. 에너지 100 에서 한 판이 8~12 이므로 8판 남짓이 가능한데, 그 8판이면
 * 이 상한에 대략 닿는다. 두 시스템이 같은 답을 가리키게 맞춘 값이다.
 */
export const DAILY_COIN_CAP = 300

/**
 * 미니게임으로 하루에 얻을 수 있는 EXP 상한.
 *
 * 코인에는 상한이 있는데 EXP 에는 없었다. 그래서 §6 이 "하루 80~120"을 가정하고
 * 짠 한 달짜리 곡선이 실제로는 그보다 훨씬 빨리 지나갔다 — 펫이 며칠 만에 다
 * 커 버리면 그다음에 할 일이 없다.
 *
 * 값은 설계 상한인 120 에 돌봄 몫을 얹어 잡았다. 상한은 **미니게임에만** 건다.
 * 돌봄(먹이기·씻기기·재우기)까지 막으면 하루치를 채운 사람이 펫을 돌볼 이유를
 * 잃는데, 그건 이 게임이 하지 말아야 할 일이다(§4 의 벌칙 원칙과 같다).
 */
export const DAILY_EXP_CAP = 140

/**
 * 배고픔이 0 이면 **미니게임** 코인 획득이 절반이 된다.
 *
 * **아직 아무도 부르지 않는다 — M3 의 미니게임 정산에서 쓴다.** 명세 §4 가
 * 이 벌칙(과 기분 0 의 EXP 0)을 미니게임에서 버는 몫에만 걸기로 못 박았기
 * 때문이다. 돌봄 EXP 까지 깎으면 배고픔 0 인 펫에게 준 첫 끼가 EXP 0 이 되어
 * §4 의 회복 수단 표(사과 +8)와 어긋나고, 방치를 되돌리려는 행동만 벌하게 된다.
 * 출석·레벨업 코인도 대상이 아니다(펫 상태와 무관한 지급이다).
 */
export const HUNGRY_COIN_FACTOR = 0.5

// ────────────────────────────────────────────────────────────────────────────
// 미니게임 (M3 에서 쓴다. 수치를 한 곳에 모아 두려고 미리 적는다)
// ────────────────────────────────────────────────────────────────────────────

export const MINIGAME_ENERGY_COST = {
  catch: 12,
  hop: 12,
  echo: 8,
} as const

export type MinigameId = keyof typeof MINIGAME_ENERGY_COST

/** 잘하면 30~50 코인이 나오도록 잡은 설계값이다. 실측 후 조정한다. */
export const MINIGAME_REWARD = {
  catch: { coin: (score: number) => score, exp: (score: number) => 10 + score / 5 },
  hop: { coin: (meters: number) => Math.floor(meters / 10), exp: (m: number) => 10 + m / 50 },
  echo: { coin: (round: number) => round * 3, exp: (round: number) => 5 + round * 2 },
} as const

// ────────────────────────────────────────────────────────────────────────────

/** 값을 스탯 범위 안으로 자른다. 0 아래로도, 100 위로도 가지 않는다. */
export function clampStat(value: number): number {
  if (value < STAT_MIN) return STAT_MIN
  if (value > STAT_MAX) return STAT_MAX
  return value
}
