// 펫타운의 타입 계약.
//
// 규칙 모듈(stats · economy · save)과 화면이 같은 모양을 보게 만드는 곳이다.
// 여기에는 로직을 두지 않는다 — 값이 어떻게 변하는지는 각 규칙 모듈이 정한다.

/** 0~100 실수. 화면에는 반올림해 보여주지만 내부는 실수로 둔다. */
export type StatName = 'hunger' | 'mood' | 'clean' | 'energy'

export type Stats = Record<StatName, number>

/** 상점과 인벤토리가 다루는 물건. 음식만 있는 것은 M1 범위이기 때문이다. */
/**
 * 먹일 수 있는 것.
 *
 * 순서는 economy.ts 의 FOODS 와 같게 싼 것부터 적는다. FOOD_IDS 가 그 순서를
 * 그대로 쓰고, 가방과 상점이 그 순서로 그린다.
 */
export type FoodId =
  | 'apple'
  | 'candy'
  | 'orange'
  | 'cookie'
  | 'strawberry'
  | 'bread'
  | 'milk'
  | 'cheese'
  | 'donut'
  | 'watermelon'
  | 'cake'

/**
 * 방에 놓는 가구. 먹는 것이 아니라 배치하는 것이라 FoodId 와 나눠 둔다.
 *
 * 둘을 한 타입으로 뭉치면 feed() 에 화분을 넘겨도 컴파일이 통과한다.
 */
export type FurnitureId =
  'plant' | 'frame' | 'lamp' | 'cushion' | 'clock' | 'shelf' | 'fishbowl' | 'teddy' | 'vase'

/** 가방에 들어갈 수 있는 것 전부. 음식은 먹고, 가구는 놓는다. */
export type ItemId = FoodId | FurnitureId

export type RoomId = 'living' | 'kitchen' | 'bath' | 'bed' | 'play' | 'shop'

/** 외형 단계. 능력 차이는 없고 크기와 머리 비율만 다르다. */
export type Stage = 'baby' | 'child' | 'adult'

export interface PetIdentity {
  name: string
  /** 부화 시각(epoch ms). 나이를 보여줄 때 쓴다. */
  bornAt: number
  level: number
  exp: number
}

/** 잠들어 있는 동안의 상태. 깨어 있으면 null 이다. */
export interface SleepState {
  since: number
}

export interface RoomDecor {
  /** 벽지·바닥은 M4 범위 밖이다. 방마다 그림을 새로 뽑아야 해서 자리만 잡아 둔다. */
  wallpaper: string
  floor: string
  /** 거실에 놓인 가구. 좌표는 논리 픽셀(360×640)의 왼쪽 위 기준이다. */
  placed: readonly { item: FurnitureId; x: number; y: number }[]
}

export interface TutorialState {
  step: number
  done: boolean
}

/**
 * 하루 단위로 초기화되는 값들.
 *
 * date 는 로컬 시각 기준 YYYY-MM-DD 다. UTC 로 두면 한국에서 오전 9시에 날짜가
 * 바뀌어 "자정에 초기화된다"는 약속이 깨진다.
 */
export interface DailyState {
  date: string
  coinsEarned: number
  /**
   * 오늘 미니게임으로 얻은 EXP. 상한(DAILY_EXP_CAP)을 재는 데 쓴다.
   *
   * 코인과 나란히 둔다. 예전에는 코인만 세고 EXP 는 아무도 세지 않아 성장이
   * 설계보다 훨씬 빨랐다.
   */
  expEarned: number
  checkedIn: boolean
  pets: number
}

/**
 * localStorage 에 통째로 들어가는 값.
 *
 * M1 에서 쓰지 않는 필드(room · tutorial)도 처음부터 넣어 둔다. 나중에 필드를
 * 추가하려면 마이그레이션이 필요한데, 마이그레이션은 세이브를 날리는 사고가 가장
 * 자주 나는 지점이다. 지금 비어 있는 값을 넣는 편이 훨씬 싸다.
 */
export interface PetSave {
  version: 1
  pet: PetIdentity
  stats: Stats
  wallet: { coins: number }
  inventory: Partial<Record<ItemId, number>>
  room: RoomDecor
  sleep: SleepState | null
  tutorial: TutorialState
  daily: DailyState
  /** 마지막으로 화면을 본 시각(epoch ms). 오프라인 경과 계산의 기준이다. */
  lastSeenAt: number
}

/** 오프라인 경과를 적용한 결과. 복귀 카드가 이 값을 그대로 보여준다. */
export interface ElapsedReport {
  /** 실제로 반영된 시간(ms). 상한에 걸리면 실제 부재 시간보다 짧다. */
  appliedMs: number
  /** 사용자가 자리를 비운 진짜 시간(ms). 문구에 쓴다. */
  awayMs: number
  /** 상한(12시간)에 걸려 잘렸는가. */
  capped: boolean
  /** 스탯별 변화량. 음수는 감소다. */
  delta: Stats
  /** 자는 동안 지났는가. */
  slept: boolean
}
