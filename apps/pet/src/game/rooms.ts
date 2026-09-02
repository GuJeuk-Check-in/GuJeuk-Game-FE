// 방 목록과 방마다 다른 것들.
//
// 방을 화면 컴포넌트로 나누지 않고 데이터로 둔 이유: 방 여섯 개가 하는 일은
// "배경이 다르고, 펫이 서는 자리가 다르고, 액션 바에 뜨는 버튼이 다르다"가
// 전부다. 컴포넌트를 여섯 벌 만들면 같은 코드가 여섯 벌로 갈린다.

import type { RoomId } from './types'

/** 액션 바에 뜨는 버튼. 실제 동작은 game/pet/actions.ts 가 정한다. */
export type ActionId = 'feed' | 'wash' | 'sleep' | 'pat' | 'play' | 'shop'

export interface RoomDef {
  id: RoomId
  label: string
  /** src/assets 안의 배경 파일 이름(확장자 제외). sprites.ts 가 이 이름으로 찾는다. */
  asset: string
  /**
   * 펫이 서는 자리(논리 좌표, 발밑 기준).
   *
   * 방마다 가구가 달라 바닥 높이가 다르다. 한 값으로 통일하면 어떤 방에서는
   * 펫이 욕조에 파묻히고 어떤 방에서는 공중에 뜬다.
   */
  anchor: { x: number; y: number }
  actions: readonly ActionId[]
}

/**
 * 좌우 이동 순서다. 배열 순서가 곧 화면 순서이므로 바꾸면 이동 방향이 바뀐다.
 *
 * 거실이 0번인 것은 첫 화면이기 때문이다. 상점과 놀이터를 끝에 둔 것은 튜토리얼
 * 전까지 잠겨 있어서다(§3).
 */
export const ROOMS: readonly RoomDef[] = [
  {
    id: 'living',
    label: '거실',
    asset: 'room-living',
    anchor: { x: 180, y: 512 },
    actions: ['pat'],
  },
  {
    id: 'kitchen',
    label: '주방',
    asset: 'room-kitchen',
    anchor: { x: 180, y: 512 },
    actions: ['feed'],
  },
  {
    id: 'bath',
    label: '욕실',
    asset: 'room-bath',
    anchor: { x: 180, y: 512 },
    actions: ['wash'],
  },
  {
    id: 'bed',
    label: '침실',
    asset: 'room-bed',
    anchor: { x: 180, y: 512 },
    actions: ['sleep'],
  },
  {
    id: 'play',
    label: '놀이터',
    asset: 'room-play',
    anchor: { x: 180, y: 512 },
    actions: ['play'],
  },
  {
    id: 'shop',
    label: '상점',
    asset: 'room-shop',
    anchor: { x: 180, y: 512 },
    actions: ['shop'],
  },
] as const

export const DEFAULT_ROOM: RoomId = 'living'

export function roomAt(index: number): RoomDef {
  const wrapped = ((index % ROOMS.length) + ROOMS.length) % ROOMS.length
  return ROOMS[wrapped]
}

export function roomIndex(id: RoomId): number {
  const index = ROOMS.findIndex((room) => room.id === id)
  // 없는 방 id 가 들어오면 조용히 0번으로 돌리지 않는다. 세이브에 잘못된 방이
  // 들어 있다는 뜻이고, 그건 알고 넘어가야 할 상태다.
  if (index < 0) throw new Error(`[rooms] 알 수 없는 방 id: ${id}`)
  return index
}
