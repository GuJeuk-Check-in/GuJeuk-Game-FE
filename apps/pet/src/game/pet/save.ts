// 세이브 직렬화 · 검증 · 손상 복구. (명세 §10)
//
// 이 게임에서 되돌릴 수 없는 사고는 하나뿐이다 — 세이브가 날아가는 것. 3주 키운
// 펫이 사라지면 그 사람은 돌아오지 않는다. 그래서 읽을 수 없는 값을 만나면
// 조용히 초기화하지 않고, 반드시 원본을 백업 키로 옮긴 뒤 그 사실을 돌려준다.
//
// localStorage 를 직접 참조하지 않고 Storage 를 인자로 받는 이유는 테스트에서
// 가짜 저장소를 넣기 위해서다. 세이브 로직은 테스트가 없으면 사고가 나야만
// 틀린 걸 알게 되는 종류의 코드다.

import type {
  DailyState,
  FurnitureId,
  ItemId,
  PetSave,
  RoomDecor,
  SleepState,
  Stats,
  TutorialState,
} from '../types'
import { STAT_MAX } from './economy'
import { localDateKey } from './clock'
// 시작 단계 번호의 출처는 tutorial.ts 하나다. 여기에 0 을 다시 적으면 그 숫자가
// 두 벌이 된다(tutorial.ts 는 save.ts 를 참조하지 않으므로 순환이 없다).
import { TUTORIAL_START_STEP } from './tutorial'

/**
 * 세이브 키의 접두사. **뒤에 회원 id 를 붙여 쓴다**(saveKey).
 *
 * 이 값 자체는 키가 아니다. 예전에는 그랬는데, 기관에서 한 기기를 여러 사람이
 * 번갈아 쓴다는 것을 뒤늦게 알았다(PET_SERVER_API.md §2).
 */
const SAVE_KEY_PREFIX = 'gj.pet.v1'

/**
 * 이 회원의 세이브가 사는 자리.
 *
 * **칸이 하나면 다음 사람이 앞사람의 펫을 덮어쓴다.** 키를 나누면 로그아웃이
 * 늦거나 브라우저가 갑자기 죽어도 서로의 진행이 섞이지 않는다.
 *
 * 로그인 이전에 쓰던 익명 키(접두사 그 자체)는 **읽지 않는다.** 그 값이 누구
 * 것인지 알 수 없어서다 — 읽으면 공용 기기에서 아무나 그 펫을 이어받는다.
 * 지우지도 않는다. 주인을 모르는 데이터를 지우는 것이 이 게임에서 유일하게
 * 되돌릴 수 없는 일이고, 읽지 않는 이상 남아 있어도 아무 일도 일어나지 않는다.
 */
export function saveKey(memberId: number): string {
  return `${SAVE_KEY_PREFIX}.${memberId}`
}

/**
 * 읽을 수 없는 세이브를 옮겨 두는 키의 접두사.
 *
 * 지우지 않고 옮기는 이유: 복구 로직이 틀렸을 때 사용자의 진행을 되살릴 마지막
 * 수단이 이것뿐이다. 접두사를 export 하는 것은 화면과 테스트가 키 문자열을 다시
 * 적지 않게 하려는 것이다.
 */
export const BACKUP_KEY_PREFIX = 'gj.pet.backup.'

/** 이 코드가 이해하는 세이브 버전. 스키마를 바꾸면 올리고 마이그레이션을 붙인다. */
const CURRENT_VERSION = 1

// 벽지·바닥은 M4(상점·가구)까지 쓰이지 않는 자리표시자다. 밸런싱 수치가 아니라
// 새 세이브의 기본값이라서 economy.ts 가 아니라 여기 둔다.
const DEFAULT_WALLPAPER = 'default'
const DEFAULT_FLOOR = 'default'

/**
 * 세이브에서 인정하는 물건 id 목록.
 *
 * ItemId 는 타입이라 런타임에 남지 않는다. 검증하려면 값으로 된 목록이 따로
 * 필요하고, satisfies 로 둘이 어긋나지 않게 묶어 둔다 — 물건을 추가하면서
 * 여기를 빠뜨리면 그 물건이 세이브에서 조용히 사라진다.
 */
const ITEM_IDS = [
  'apple',
  'bread',
  'cake',
  'plant',
  'frame',
  'lamp',
  'cushion',
  'clock',
  'shelf',
  'fishbowl',
  'teddy',
  'vase',
] as const satisfies readonly ItemId[]

/** 배치된 가구 검증용. ITEM_IDS 와 달리 음식은 놓을 수 없다. */
const FURNITURE_IDS = [
  'plant',
  'frame',
  'lamp',
  'cushion',
  'clock',
  'shelf',
  'fishbowl',
  'teddy',
  'vase',
] as const satisfies readonly FurnitureId[]

/**
 * 읽기 결과.
 *
 * 'recovered' 는 실패가 아니라 "원본을 지키고 새로 시작한다"는 뜻이다. 화면은
 * 이걸 반드시 사용자에게 알려야 한다 — 조용히 새 펫을 주면 진행이 사라진 것으로
 * 보인다.
 */
export type LoadResult =
  | { kind: 'ok'; save: PetSave }
  | { kind: 'empty' }
  | { kind: 'recovered'; reason: string; backupKey: string }

export function createSave(name: string, now: number): PetSave {
  return {
    version: CURRENT_VERSION,
    pet: { name, bornAt: now, level: 1, exp: 0 },
    // 새 펫은 가득 찬 상태로 시작한다. 첫 화면부터 게이지가 비어 있으면
    // 사용자는 자기가 뭘 잘못한 줄 안다.
    stats: { hunger: STAT_MAX, mood: STAT_MAX, clean: STAT_MAX, energy: STAT_MAX },
    wallet: { coins: 0 },
    // 튜토리얼 2단계가 사과 3개를 지급한다(§9). 여기서 미리 주지 않는다.
    inventory: {},
    room: { wallpaper: DEFAULT_WALLPAPER, floor: DEFAULT_FLOOR, placed: [] },
    sleep: null,
    // 튜토리얼은 2단계부터다(§9 의 0·1 은 이 이름 입력 화면이 대신한다). 진입
    // 지급은 startTutorial 이 붙이므로 여기서는 단계만 세운다.
    tutorial: { step: TUTORIAL_START_STEP, done: false },
    daily: { date: localDateKey(now), coinsEarned: 0, expEarned: 0, checkedIn: false, pets: 0 },
    lastSeenAt: now,
  }
}

export function loadSave(storage: Storage, key: string, now: number): LoadResult {
  const raw = storage.getItem(key)
  if (raw === null) return { kind: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return recover(storage, key, raw, now, '저장 파일이 올바른 JSON 이 아니다')
  }

  const stamp = stampOf(parsed, now)

  // 버전 검사가 형식 검사보다 먼저다. 미래 버전을 옛 코드로 해석해서 덮어쓰는
  // 것이 세이브를 날리는 가장 흔한 경로이므로, 필드를 들여다보기 전에 막는다.
  const version = isObject(parsed) ? parsed.version : undefined
  if (isFiniteNumber(version) && version > CURRENT_VERSION) {
    const reason = `더 최신 버전(v${version})의 저장 파일이라 읽지 않았다`
    return recover(storage, key, raw, stamp, reason)
  }

  try {
    return { kind: 'ok', save: parseSave(parsed) }
  } catch (error) {
    if (error instanceof SaveShapeError) return recover(storage, key, raw, stamp, error.message)
    throw error
  }
}

export function writeSave(storage: Storage, key: string, save: PetSave): void {
  // 저장 실패(용량 초과 · 사파리 프라이빗 모드 등)를 삼키지 않는다. 조용히
  // 실패하면 사용자는 진행이 저장되고 있다고 믿은 채 계속 논다.
  storage.setItem(key, JSON.stringify(save))
}

/**
 * 이 회원의 세이브를 로컬에서 지운다. 로그아웃의 마지막 단계다.
 *
 * **서버에 올린 뒤에만 부른다.** 순서가 반대면 진행이 사라진다
 * (PET_SERVER_API.md §10). 반대로 지우지 않고 두면 다음 사람이 그 펫을 본다.
 */
export function clearSave(storage: Storage, key: string): void {
  storage.removeItem(key)
}

/**
 * 서버에서 받은 값을 세이브로 읽는다. 읽을 수 없으면 null.
 *
 * **서버에서 온 값도 손상된 로컬 세이브와 똑같이 다룬다.** 서버는 세이브를
 * 해석하지 않고 보관만 하므로(PET_SERVER_API.md §6) 모양을 보증해 주지 않는다.
 * 그대로 화면에 넣으면 남의 기기에서 올라온 이상한 값이 그 자리에서 렌더링을
 * 죽인다.
 *
 * 백업을 만들지 않는 것은 원본이 서버에 그대로 있기 때문이다 — 로컬 복구와
 * 달리 여기서는 잃을 것이 없다.
 */
export function readServerSave(value: unknown): PetSave | null {
  const version = isObject(value) ? value.version : undefined
  if (isFiniteNumber(version) && version > CURRENT_VERSION) return null

  try {
    return parseSave(value)
  } catch (error) {
    if (error instanceof SaveShapeError) return null
    throw error
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 복구
// ────────────────────────────────────────────────────────────────────────────

/**
 * 원본을 백업 키로 옮기고 복구 결과를 만든다.
 *
 * 백업을 먼저 쓰고 원본을 지운다. 순서가 반대면 백업 쓰기가 실패했을 때 원본만
 * 사라진다. 원본을 지우는 이유는, 남겨 두면 실행할 때마다 같은 값을 다시
 * 백업하며 저장소를 채우기 때문이다. 값 자체는 백업 키에 그대로 남는다.
 */
function recover(
  storage: Storage,
  key: string,
  raw: string,
  stamp: number,
  reason: string,
): LoadResult {
  const backupKey = freeBackupKey(storage, stamp)
  storage.setItem(backupKey, raw)
  storage.removeItem(key)
  return { kind: 'recovered', reason, backupKey }
}

/**
 * 비어 있는 백업 키를 찾는다.
 *
 * 이미 백업이 있으면 절대 덮어쓰지 않는다 — 덮어쓸 수 있는 백업은 백업이 아니다.
 */
function freeBackupKey(storage: Storage, stamp: number): string {
  const base = `${BACKUP_KEY_PREFIX}${stamp}`
  if (storage.getItem(base) === null) return base

  let suffix = 2
  while (storage.getItem(`${base}.${suffix}`) !== null) suffix += 1
  return `${base}.${suffix}`
}

/** 백업 키에 쓸 시각. 원본에서 읽을 수 있으면 그걸 쓴다 — 언제 것인지가 남는다. */
function stampOf(parsed: unknown, now: number): number {
  if (!isObject(parsed)) return now
  const lastSeenAt = parsed.lastSeenAt
  return isFiniteNumber(lastSeenAt) ? lastSeenAt : now
}

// ────────────────────────────────────────────────────────────────────────────
// 검증
//
// 형식적으로 훑지 않고 실제로 본다. 숫자 자리에 문자열이 오거나 stats 에 키가
// 빠진 세이브를 통과시키면, 그 값은 화면과 계산을 지나 NaN 이 되어 저장된다.
// 그 시점에는 원본이 이미 사라진 뒤라 복구할 방법이 없다.
// ────────────────────────────────────────────────────────────────────────────

/** 첫 실패 지점에서 즉시 끊기 위한 내부 신호. loadSave 밖으로 새지 않는다. */
class SaveShapeError extends Error {}

function fail(path: string, expected: string): never {
  throw new SaveShapeError(`${path} 이(가) ${expected} 이(가) 아니다`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** NaN·Infinity 도 거른다. 한 번 섞이면 이후 모든 계산이 조용히 NaN 이 된다. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) fail(path, '객체')
  return value
}

function readNumber(value: unknown, path: string): number {
  if (!isFiniteNumber(value)) fail(path, '유한한 숫자')
  return value
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, '문자열')
  return value
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, '참·거짓')
  return value
}

function parseSave(value: unknown): PetSave {
  const root = readObject(value, 'save')

  const version = readNumber(root.version, 'version')
  if (version !== CURRENT_VERSION) fail('version', `${CURRENT_VERSION}`)

  const pet = readObject(root.pet, 'pet')
  const wallet = readObject(root.wallet, 'wallet')

  // 검증한 값으로 새 객체를 조립한다. 파싱 결과를 그대로 돌려주면 세이브에 섞여
  // 있던 알 수 없는 필드가 다음 저장에 다시 실려 영원히 따라다닌다.
  return {
    version: CURRENT_VERSION,
    pet: {
      name: readString(pet.name, 'pet.name'),
      bornAt: readNumber(pet.bornAt, 'pet.bornAt'),
      level: readNumber(pet.level, 'pet.level'),
      exp: readNumber(pet.exp, 'pet.exp'),
    },
    stats: readStats(root.stats),
    wallet: { coins: readNumber(wallet.coins, 'wallet.coins') },
    inventory: readInventory(root.inventory),
    room: readRoom(root.room),
    sleep: readSleep(root.sleep),
    tutorial: readTutorial(root.tutorial),
    daily: readDaily(root.daily),
    lastSeenAt: readNumber(root.lastSeenAt, 'lastSeenAt'),
  }
}

function readStats(value: unknown): Stats {
  const stats = readObject(value, 'stats')
  return {
    hunger: readNumber(stats.hunger, 'stats.hunger'),
    mood: readNumber(stats.mood, 'stats.mood'),
    clean: readNumber(stats.clean, 'stats.clean'),
    energy: readNumber(stats.energy, 'stats.energy'),
  }
}

/** 모르는 물건 id 는 버린다. 새 물건은 버전이 오르며 들어오고, 그건 위에서 막힌다. */
function readInventory(value: unknown): Partial<Record<ItemId, number>> {
  const raw = readObject(value, 'inventory')
  const inventory: Partial<Record<ItemId, number>> = {}
  for (const id of ITEM_IDS) {
    const count = raw[id]
    if (count === undefined) continue
    inventory[id] = readNumber(count, `inventory.${id}`)
  }
  return inventory
}

function readRoom(value: unknown): RoomDecor {
  const room = readObject(value, 'room')

  const rawPlaced: unknown = room.placed
  if (!Array.isArray(rawPlaced)) fail('room.placed', '배열')

  const placed = rawPlaced.flatMap((entry: unknown, index: number) => {
    const path = `room.placed[${index}]`
    const item = readObject(entry, path)

    // 모르는 가구는 그 항목만 버린다. readInventory 와 같은 정책이다.
    //
    // 여기서 fail() 을 부르면 **세이브 전체가 백업 후 초기화된다** — 3주 키운
    // 펫이 화분 하나 때문에 사라진다. 그리고 그 상황은 실재한다: FURNITURE_IDS 는
    // 손으로 적은 목록이고 satisfies 는 누락을 검사하지 않으므로, 가구를 추가한
    // 신버전에서 놓은 세이브를 캐시로 남은 구버전 번들이 열면 그대로 걸린다.
    // 배치 목록을 통째로 잃는 것이 진행 전체를 잃는 것보다 싸다(§1).
    const id = readFurnitureId(item.item, `${path}.item`)
    if (id === null) return []

    return [{ item: id, x: readNumber(item.x, `${path}.x`), y: readNumber(item.y, `${path}.y`) }]
  })

  return {
    wallpaper: readString(room.wallpaper, 'room.wallpaper'),
    floor: readString(room.floor, 'room.floor'),
    placed,
  }
}

/**
 * 배치된 가구 id 를 확인한다. 모르는 id 면 null 이고, 부르는 쪽이 그 항목을 버린다.
 *
 * 문자열이기만 하면 통과시키면, 이름이 바뀌거나 손으로 고친 세이브에 없는 가구가
 * 들어와 렌더링이 그 자리에서 죽는다. 세이브를 읽는 시점에 걸러야 화면이 뜬다.
 * 다만 **걸러 내기지 세이브 폐기가 아니다** — 이유는 readRoom 에 적었다.
 */
function readFurnitureId(value: unknown, path: string): FurnitureId | null {
  const id = readString(value, path)
  const known = (FURNITURE_IDS as readonly string[]).includes(id)
  return known ? (id as FurnitureId) : null
}

function readSleep(value: unknown): SleepState | null {
  // null 은 "깨어 있다"는 정상 값이다. undefined(필드 누락)는 손상으로 본다.
  if (value === null) return null
  const sleep = readObject(value, 'sleep')
  return { since: readNumber(sleep.since, 'sleep.since') }
}

function readTutorial(value: unknown): TutorialState {
  const tutorial = readObject(value, 'tutorial')
  return {
    // 단계는 배열 인덱스라 정수여야 한다(tutorial.ts). 손으로 고친 2.5 같은 값을
    // 그대로 들이면 그 세이브는 화면이 뜨지 않는데, 손상으로 보고 초기화하기에는
    // 너무 값싼 필드다 — 잘라 넣으면 진행도 화면도 지킨다.
    step: Math.trunc(readNumber(tutorial.step, 'tutorial.step')),
    done: readBoolean(tutorial.done, 'tutorial.done'),
  }
}

function readDaily(value: unknown): DailyState {
  const daily = readObject(value, 'daily')
  return {
    date: readString(daily.date, 'daily.date'),
    coinsEarned: readNumber(daily.coinsEarned, 'daily.coinsEarned'),
    // 이 필드보다 먼저 저장된 세이브에는 없다. 없으면 0 으로 본다 — 하루치
    // 집계일 뿐이라 없다고 세이브를 버릴 값이 아니고, 버전을 올리면 기존
    // 세이브가 전부 거부된다(위의 version 검사).
    expEarned: daily.expEarned === undefined ? 0 : readNumber(daily.expEarned, 'daily.expEarned'),
    checkedIn: readBoolean(daily.checkedIn, 'daily.checkedIn'),
    pets: readNumber(daily.pets, 'daily.pets'),
  }
}
