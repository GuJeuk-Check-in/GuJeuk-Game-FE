// 가구 배치의 규칙. 순수 함수만 둔다 — React 도 Canvas 도 모른다.
//
// 배치는 "가방에서 방으로, 방에서 가방으로" 옮기는 것이 전부다. 그러므로 **가방과
// 방을 항상 한 번에 고친다.** 한쪽만 고치는 함수를 두면 화면이 두 번 부르다 중간에
// 실패했을 때 가구가 복제되거나 사라진다.
//
// 좌표는 논리 픽셀(360×640)의 **왼쪽 위** 기준이다(types.ts 의 RoomDecor 와 같다).
// 중심 기준으로 두면 렌더러가 매번 폭의 절반을 빼야 하고, 그 절반이 홀수일 때
// 소수 좌표가 생겨 도트가 흐려진다.
//
// **이 모듈은 시간을 다루지 않는다.** now 를 받지 않는 것은 배치가 스탯·경과와
// 아무 관계가 없기 때문이다. lastSeenAt 갱신과 저장은 호출자가 한다.
//
// 근거는 docs/PET_TOWN_SPEC.md §3(거실에서 가구 배치) · §11(도트 렌더링 규칙) 이다.

import type { FurnitureId, PetSave } from '../types'
import { FURNITURE } from './economy'

/**
 * 배치 좌표의 기준이 되는 논리 화면 크기와 가구 한 칸의 크기.
 *
 * PetGame.ts 의 LOGICAL_WIDTH · LOGICAL_HEIGHT 와 같은 값이지만 **거기서 가져오지
 * 않는다.** PetGame 은 캔버스와 @gujuck/game-core 를 들고 있고, game/pet/* 는
 * React 도 Canvas 도 몰라야 나중에 서버 검증으로 그대로 옮길 수 있다(§11).
 * 반대 방향(PetGame 이 여기서 읽는 것)은 계층을 거스르지 않으므로 그쪽이 이 값을
 * 가져다 쓴다 — 그래야 한 칸의 크기와 놓을 수 있는 범위를 정하는 곳이 하나로 남는다.
 *
 * 가구 에셋은 전부 48×48 이다(§12.1 의 생성 규격).
 */
export const ROOM_WIDTH = 360
export const ROOM_HEIGHT = 640
export const FURNITURE_SIZE = 48

/**
 * 방 가장자리와 UI 가 먹는 여백.
 *
 * 위아래 40px 씩이 아니라 48px 인 것은 방 이름표와 좌우 화살표가 그 자리에 얹히기
 * 때문이다. 거기 놓인 가구는 놓자마자 UI 에 가려 보이지 않고, 보이지 않으면 다시
 * 집을 수도 없다. 좌우 8px 은 벽 모서리다 — 액자·벽시계는 벽에 걸어야 하므로
 * 세로로는 벽까지 열어 두고 가로만 조금 물린다.
 */
const UI_MARGIN_Y = 48
const WALL_MARGIN_X = 8

/**
 * 가구를 놓을 수 있는 범위(가구의 왼쪽 위 기준).
 *
 * **규칙 쪽에 둔다.** 예전에는 이 네 숫자가 PetGame 에만 있고 여기 clamp 는 화면
 * 크기(0~312 · 0~592)로만 잘랐다. 그러면 규칙만으로는 UI 밑에 놓이는 것을 막지
 * 못하고, 지금 화면이 안전한 것은 App 이 그리기 전에 한 번 더 잘라 주기 때문일
 * 뿐이다 — 나중에 이 모듈을 서버 검증으로 옮기면(§11) 그 서버는 UI 밑 좌표를
 * 그대로 승인한다. 진짜 경계는 한 곳에 있어야 한다.
 */
export const DECOR_AREA = {
  left: WALL_MARGIN_X,
  top: UI_MARGIN_Y,
  right: ROOM_WIDTH - WALL_MARGIN_X - FURNITURE_SIZE,
  bottom: ROOM_HEIGHT - UI_MARGIN_Y - FURNITURE_SIZE,
} as const

/**
 * 한 방에 놓을 수 있는 가구 개수.
 *
 * 산술적으로는 360×640 에 48×48 이 7 × 13 = 91 개 들어가지만, 그건 방이 창고가
 * 되는 값이다. 실제로 비어 있는 곳은 벽(y 120~380 쯤)과 바닥(y 500~600 쯤) 두
 * 띠뿐이고, 그 띠에서도 펫이 서는 자리(rooms.ts 의 anchor 180,512 에 128px 짜리
 * 스프라이트)를 비워 둬야 한다. 좌우로 남는 폭이 130px 남짓이라 한 줄에 48px
 * 짜리가 2~3 개다. 벽 두 줄 + 바닥 한 줄이면 **8** 근처가 되고, 카탈로그 9종을
 * 거의 한 개씩 늘어놓을 수 있으면서 펫이 가구에 파묻히지 않는다.
 *
 * 상한 자체가 필요한 이유는 따로 있다. 세이브에 배열로 그대로 들어가는 값이라
 * 상한이 없으면 코인만 있으면 수백 개가 쌓이고, 그만큼 매 프레임 그려야 하며,
 * 무엇보다 **겹쳐 놓은 가구 아래에 깔린 것을 다시 집을 방법이 없다.**
 */
export const MAX_PLACED = 8

export interface DecorOutcome {
  /** 새 세이브. 입력을 변형하지 않는다. */
  next: PetSave
  /** 실제로 무언가 바뀌었는가. false 면 거절이고 next 는 save 와 같다. */
  changed: boolean
  /** 화면에 한 줄로 띄울 말. 거절이면 이유가 들어간다. */
  message: string
}

/**
 * 가방에서 하나 빼서 방에 놓는다.
 *
 * 가방 확인이 개수 상한보다 먼저다. 순서를 뒤집으면 "가구는 8개까지예요"를 보고
 * 하나 치운 다음 다시 눌렀을 때 그제야 "가방에 없어요"가 뜬다 — 사용자가 헛수고를
 * 하고 나서야 진짜 이유를 알게 된다.
 */
export function place(save: PetSave, item: FurnitureId, x: number, y: number): DecorOutcome {
  const label = FURNITURE[item].label
  const count = save.inventory[item] ?? 0
  if (count < 1) return reject(save, `가방에 ${label} 없어요. 상점에서 살 수 있어요.`)

  if (save.room.placed.length >= MAX_PLACED) {
    return reject(save, `가구는 ${MAX_PLACED}개까지 놓을 수 있어요. 하나 치우고 놓아 주세요.`)
  }

  const next: PetSave = {
    ...save,
    // 0 이 되어도 키를 지우지 않는다. 화면이 "화분 0개"를 그대로 그릴 수 있고,
    // 키가 사라졌다 생겼다 하는 인벤토리는 비교하기 까다롭다(actions.ts 와 같다).
    inventory: { ...save.inventory, [item]: count - 1 },
    room: {
      ...save.room,
      placed: [...save.room.placed, { item, x: clampX(x), y: clampY(y) }],
    },
  }

  return { next, changed: true, message: `${label} 놓았어요.` }
}

/** 이미 놓인 가구를 옮긴다. 가방과 개수는 건드리지 않는다. */
export function moveTo(save: PetSave, index: number, x: number, y: number): DecorOutcome {
  const target = at(save, index)
  if (target === null) return reject(save, '옮길 가구를 찾지 못했어요.')

  const moved = { ...target, x: clampX(x), y: clampY(y) }
  const placed = save.room.placed.map((entry, i) => (i === index ? moved : entry))

  return {
    next: { ...save, room: { ...save.room, placed } },
    changed: true,
    message: `${FURNITURE[target.item].label} 옮겼어요.`,
  }
}

/** 방에서 빼서 가방으로 되돌린다. 개수는 정확히 1 이 돌아온다 — 팔리는 것이 아니다. */
export function pickUp(save: PetSave, index: number): DecorOutcome {
  const target = at(save, index)
  if (target === null) return reject(save, '치울 가구를 찾지 못했어요.')

  const next: PetSave = {
    ...save,
    inventory: { ...save.inventory, [target.item]: (save.inventory[target.item] ?? 0) + 1 },
    room: { ...save.room, placed: save.room.placed.filter((_, i) => i !== index) },
  }

  return { next, changed: true, message: `${FURNITURE[target.item].label} 치웠어요.` }
}

// ────────────────────────────────────────────────────────────────────────────
// 공통
// ────────────────────────────────────────────────────────────────────────────

function reject(save: PetSave, message: string): DecorOutcome {
  return { next: save, changed: false, message }
}

/**
 * index 자리의 가구. 범위 밖이면 null 이다.
 *
 * 정수가 아닌 index 도 없는 것으로 본다. 배열 접근만으로도 undefined 가 나오지만,
 * moveTo 가 그 뒤에서 `i === index` 로 비교하기 때문에 여기서 걸러 두지 않으면
 * "찾지도 못했는데 거절도 안 하는" 경로가 생긴다.
 */
function at(save: PetSave, index: number): { item: FurnitureId; x: number; y: number } | null {
  if (!Number.isInteger(index) || index < 0 || index >= save.room.placed.length) return null
  return save.room.placed[index]
}

/**
 * 좌표를 놓을 수 있는 자리로 자른다(DECOR_AREA).
 *
 * 화면 쪽 미리보기(App 의 고스트)도 이 함수를 쓴다. 규칙과 미리보기가 다른 식으로
 * 자르면 "손끝에 보이던 자리와 놓인 자리가 다르다"가 된다.
 *
 * **정수로 반올림하는 것과 NaN 을 따로 거르는 것이 여기 있는 이유가 있다.** 소수
 * 좌표는 도트를 흐리게 하고(§11), NaN 은 세이브에 실려 나갔다가 다음 로드에서
 * save.ts 의 검증에 걸린다 — 그 시점의 처리는 "백업 후 새로 시작", 즉 가구 하나
 * 때문에 진행 전체가 초기화된다. NaN 은 크기 비교가 전부 false 라 아래 두 줄의
 * 범위 검사를 그대로 빠져나가므로 먼저 잡아야 한다. ±Infinity 는 비교가 되므로
 * 양 끝으로 잘리고, 그 결과는 유한한 값이다.
 */
export function clampToDecorArea(x: number, y: number): { x: number; y: number } {
  return { x: clampX(x), y: clampY(y) }
}

function clampX(value: number): number {
  return clamp(value, DECOR_AREA.left, DECOR_AREA.right)
}

function clampY(value: number): number {
  return clamp(value, DECOR_AREA.top, DECOR_AREA.bottom)
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  const rounded = Math.round(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}
