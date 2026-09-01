// 스프라이트 로딩과 프레임 정의.
//
// PNG 는 Vite 의 에셋 import 로만 가져온다. 경로 문자열을 손으로 적으면 빌드가
// 붙이는 해시(`pet.a1b2c3.png`)를 따라갈 수 없어, 개발 서버에서는 멀쩡하다가
// 배포에서만 404 가 난다.

import furnClockUrl from '../assets/furn-clock.png'
import furnCushionUrl from '../assets/furn-cushion.png'
import furnFishbowlUrl from '../assets/furn-fishbowl.png'
import furnFrameUrl from '../assets/furn-frame.png'
import furnLampUrl from '../assets/furn-lamp.png'
import furnPlantUrl from '../assets/furn-plant.png'
import furnShelfUrl from '../assets/furn-shelf.png'
import furnTeddyUrl from '../assets/furn-teddy.png'
import furnVaseUrl from '../assets/furn-vase.png'
import itemAppleUrl from '../assets/item-apple.png'
import itemBreadUrl from '../assets/item-bread.png'
import itemCakeUrl from '../assets/item-cake.png'
import itemCandyUrl from '../assets/item-candy.png'
import itemCheeseUrl from '../assets/item-cheese.png'
import itemCookieUrl from '../assets/item-cookie.png'
import itemDonutUrl from '../assets/item-donut.png'
import itemMilkUrl from '../assets/item-milk.png'
import itemOrangeUrl from '../assets/item-orange.png'
import itemStrawberryUrl from '../assets/item-strawberry.png'
import itemWatermelonUrl from '../assets/item-watermelon.png'
import petUrl from '../assets/pet.png'
import propBirdUrl from '../assets/prop-bird.png'
import propBombUrl from '../assets/prop-bomb.png'
import propCactusSmallUrl from '../assets/prop-cactus-small.png'
import propCactusTallUrl from '../assets/prop-cactus-tall.png'
import propCrateUrl from '../assets/prop-crate.png'
import propDonutUrl from '../assets/prop-donut.png'
import roomBathUrl from '../assets/room-bath.png'
import roomBedUrl from '../assets/room-bed.png'
import roomKitchenUrl from '../assets/room-kitchen.png'
import roomLivingUrl from '../assets/room-living.png'
import roomPlayUrl from '../assets/room-play.png'
import roomShopUrl from '../assets/room-shop.png'
import { ROOMS } from './rooms'
import type { FoodId, FurnitureId } from './types'

/**
 * 방 배경 에셋 이름 → 파일 주소.
 *
 * 키는 rooms.ts 의 `RoomDef.asset` 과 같은 문자열이다.
 *
 * **이 표를 ROOMS 에서 자동으로 만들 수는 없다.** Vite 는 import 경로가 정적
 * 리터럴일 때만 파일을 번들에 넣고 해시를 붙인다. `../assets/${name}.png` 처럼
 * 변수를 끼우면 개발 서버에서는 동작하다가 배포에서만 404 가 난다(이 파일
 * 첫머리의 이유와 같은 함정이다). 그래서 표는 손으로 적고, 대신 ROOMS 와
 * 어긋나지 않는지를 로딩 직전에 검사한다.
 */
const ROOM_ASSET_URLS: Record<string, string> = {
  'room-living': roomLivingUrl,
  'room-kitchen': roomKitchenUrl,
  'room-bath': roomBathUrl,
  'room-bed': roomBedUrl,
  'room-play': roomPlayUrl,
  'room-shop': roomShopUrl,
}

/**
 * 미니게임과 인벤토리가 쓰는 48×48 물건들.
 *
 * **키는 파일 이름 그대로다**(`item-apple`). 접두사를 떼고 `apple` 로 두면
 * 아이템의 `donut` 과 소품의 `donut` 이 같은 이름이 되는데, 간식받기에서 그 둘은
 * 점수 +1 과 +5 로 전혀 다른 물건이다. 방 배경(`room-living`)도 같은 규칙이라
 * 세 표의 키 모양이 하나로 맞는다.
 *
 * 이름 배열을 먼저 두고 표를 `Record<ItemSpriteName, string>` 으로 선언하는 것은
 * 빠뜨림을 컴파일 타임에 잡기 위해서다. 표만 두면 이름 하나를 빠뜨려도 그 물건이
 * 떨어지는 순간에야 undefined 로 터진다.
 */
export const ITEM_SPRITE_NAMES = [
  'item-apple',
  'item-bread',
  'item-cake',
  'item-candy',
  'item-cheese',
  'item-cookie',
  'item-donut',
  'item-milk',
  'item-orange',
  'item-strawberry',
  'item-watermelon',
] as const

export type ItemSpriteName = (typeof ITEM_SPRITE_NAMES)[number]

const ITEM_ASSET_URLS: Record<ItemSpriteName, string> = {
  'item-apple': itemAppleUrl,
  'item-bread': itemBreadUrl,
  'item-cake': itemCakeUrl,
  'item-candy': itemCandyUrl,
  'item-cheese': itemCheeseUrl,
  'item-cookie': itemCookieUrl,
  'item-donut': itemDonutUrl,
  'item-milk': itemMilkUrl,
  'item-orange': itemOrangeUrl,
  'item-strawberry': itemStrawberryUrl,
  'item-watermelon': itemWatermelonUrl,
}

/**
 * 미니게임 소품. 세 게임이 나눠 쓴다.
 *
 * - 간식받기: `prop-bomb`(라이프 -1) · `prop-donut`(황금 도넛 +5)
 * - 폴짝 달리기: `prop-cactus-small` · `prop-cactus-tall` · `prop-crate` ·
 *   `prop-bird`
 *
 * 게임마다 쓰는 것만 따로 불러오지 않는 이유: 미니게임은 방 화면에서 곧바로
 * 시작되는데, 그 순간에 다시 네트워크를 기다리면 첫 프레임이 비어 뜬다. 48×48
 * PNG 여섯 장은 방 배경 한 장보다도 가볍다.
 */
export const PROP_SPRITE_NAMES = [
  'prop-bird',
  'prop-bomb',
  'prop-cactus-small',
  'prop-cactus-tall',
  'prop-crate',
  'prop-donut',
] as const

export type PropSpriteName = (typeof PROP_SPRITE_NAMES)[number]

const PROP_ASSET_URLS: Record<PropSpriteName, string> = {
  'prop-bird': propBirdUrl,
  'prop-bomb': propBombUrl,
  'prop-cactus-small': propCactusSmallUrl,
  'prop-cactus-tall': propCactusTallUrl,
  'prop-crate': propCrateUrl,
  'prop-donut': propDonutUrl,
}

/**
 * 방에 놓는 가구(48×48).
 *
 * **키는 파일 이름 그대로다**(`furn-plant`). 아이템·소품과 같은 규칙이라 네 표의
 * 키 모양이 하나로 맞는다. 세이브에 들어가는 id 는 접두사가 없는 `plant` 이고,
 * 둘 사이는 아래 furnitureSpriteName() 이 잇는다 — 부르는 쪽마다 문자열을 붙이면
 * 오타가 런타임까지 살아 나간다.
 */
export const FURNITURE_SPRITE_NAMES = [
  'furn-clock',
  'furn-cushion',
  'furn-fishbowl',
  'furn-frame',
  'furn-lamp',
  'furn-plant',
  'furn-shelf',
  'furn-teddy',
  'furn-vase',
] as const

export type FurnitureSpriteName = (typeof FURNITURE_SPRITE_NAMES)[number]

const FURNITURE_ASSET_URLS: Record<FurnitureSpriteName, string> = {
  'furn-clock': furnClockUrl,
  'furn-cushion': furnCushionUrl,
  'furn-fishbowl': furnFishbowlUrl,
  'furn-frame': furnFrameUrl,
  'furn-lamp': furnLampUrl,
  'furn-plant': furnPlantUrl,
  'furn-shelf': furnShelfUrl,
  'furn-teddy': furnTeddyUrl,
  'furn-vase': furnVaseUrl,
}

/**
 * 세이브의 가구 id → 스프라이트 이름.
 *
 * 템플릿 리터럴 타입이라 **컴파일러가 검사한다.** FurnitureId 에 가구를 하나
 * 더하면서 위 목록을 빠뜨리면 여기서 타입 오류가 난다 — 표를 손으로 맞추는 것과
 * 달리, 어긋난 채로 빌드가 통과하는 경로가 없다.
 */
export function furnitureSpriteName(id: FurnitureId): FurnitureSpriteName {
  return `furn-${id}`
}

/**
 * 아이템·소품 스프라이트의 한 변(px).
 *
 * 파이프라인이 전부 48×48 로 뽑는다(명세 §12.1). 충돌 상자를 만들 때 이 값을
 * 쓰라고 상수로 둔다 — 게임마다 48 을 손으로 적으면 크기를 바꿀 때 한 곳만 남는다.
 * 가구도 같은 48×48 이라 배치 계산이 이 값을 그대로 쓴다.
 */
export const PROP_SPRITE_SIZE = 48

/**
 * React 화면(상점·가방·꾸미기 바)이 `<img>` 로 걸 주소.
 *
 * 캔버스는 loadSprites() 가 준 HTMLImageElement 를 쓰지만, DOM 쪽은 주소만
 * 있으면 된다. 브라우저가 같은 URL 을 다시 내려받지는 않으므로 두 경로가
 * 겹쳐도 낭비가 없다. **주소를 컴포넌트에서 직접 import 하지 않는 이유**는 이
 * 파일 첫머리와 같다 — 에셋 주소를 아는 곳이 늘어나면 파일 이름을 바꿀 때
 * 빠뜨리는 곳이 생긴다.
 */
export function foodIconUrl(food: FoodId): string {
  return ITEM_ASSET_URLS[`item-${food}`]
}

export function furnitureIconUrl(id: FurnitureId): string {
  return FURNITURE_ASSET_URLS[furnitureSpriteName(id)]
}

/**
 * 한 벌로 다 불러온 스프라이트.
 *
 * 하나씩 도착하는 대로 그리지 않는다. 방만 있고 펫이 없는 중간 상태가 화면에
 * 남으면 "펫이 사라졌다"로 보인다. 방 여섯 장도 같이 기다린다 — 옆 방으로
 * 넘어가는 순간에 그 방만 아직 없어서 검게 비면 전환이 고장 난 것처럼 보인다.
 */
export interface SpriteSet {
  /** rooms.ts 의 `RoomDef.asset` 이름으로 찾는다. ROOMS 의 모든 방이 반드시 들어 있다. */
  readonly rooms: Record<string, HTMLImageElement>
  readonly pet: HTMLImageElement
  /** `item-apple` 처럼 파일 이름 그대로가 키다. */
  readonly items: Readonly<Record<ItemSpriteName, HTMLImageElement>>
  /** `prop-bomb` 처럼 파일 이름 그대로가 키다. */
  readonly props: Readonly<Record<PropSpriteName, HTMLImageElement>>
  /** `furn-plant` 처럼 파일 이름 그대로가 키다. furnitureSpriteName() 으로 찾는다. */
  readonly furniture: Readonly<Record<FurnitureSpriteName, HTMLImageElement>>
  /**
   * `items['item-apple']` 과 같은 이미지다. 표가 생기기 전부터 있던 이름이라
   * 남겨 둔다 — 같은 파일을 두 번 내려받지는 않는다.
   */
  readonly itemApple: HTMLImageElement
}

/**
 * 펫 스프라이트(128×128) 안에서 펫이 실제로 차지하는 자리.
 *
 * **눈으로 어림한 값이 아니라 잰 값이다.** 알파 > 127 인 픽셀의 경계 상자가
 * x 5~105 · y 7~121 이었다. 그래서 불투명 영역의 가로 중심은 스프라이트
 * 한가운데(64)가 아니라 55 이고, 발바닥도 127 이 아니라 121 이다. 스프라이트를
 * 그냥 가운데 정렬해 그리면 펫이 오른쪽으로 9px 밀려 서고, 바닥선에 맞추면
 * 6px 떠 보인다. 에셋을 다시 뽑으면 이 값도 다시 재야 한다.
 *
 * body* 는 같은 측정에서 나온 경계 상자 그대로다. 미니게임의 충돌 상자가 이
 * 값을 쓴다 — 128×128 전체를 상자로 잡으면 펫 옆의 빈 공간에서 폭탄이 터진다.
 */
export const PET_SPRITE = {
  width: 128,
  height: 128,
  /** 발바닥 바로 아래 줄. 이 줄이 바닥선에 닿게 그린다. */
  feetY: 122,
  /** 불투명 영역의 가로 중심. */
  centerX: 55,
  /** 불투명 영역의 왼쪽 끝(스프라이트 좌표). */
  bodyLeft: 5,
  /** 불투명 영역의 위쪽 끝(스프라이트 좌표). */
  bodyTop: 7,
  /** 불투명 영역의 폭(5~105 이므로 101 이다). */
  bodyWidth: 101,
  /** 불투명 영역의 높이(7~121 이므로 115 다). */
  bodyHeight: 115,
} as const

function loadImage(name: string, url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    // onerror 가 넘겨주는 Event 에는 원인이 들어 있지 않다. 어느 에셋이 어느
    // 주소에서 실패했는지는 여기서 직접 적어야 추적이 된다.
    image.onerror = () =>
      reject(new Error(`[sprites] '${name}' 을(를) 불러오지 못했습니다 (${url}).`))

    image.src = url
  })
}

/** 이름 목록을 그대로 키로 쓰는 이미지 표를 만든다. 한 장이라도 실패하면 reject 된다. */
async function loadTable<Name extends string>(
  names: readonly Name[],
  urlOf: (name: Name) => string,
): Promise<Record<Name, HTMLImageElement>> {
  const images = await Promise.all(names.map((name) => loadImage(name, urlOf(name))))

  // 빈 객체에서 시작해 채운다. Object.fromEntries 는 결과 타입이 넓어져
  // 키가 하나 빠져도 컴파일러가 잡지 못한다.
  const table = {} as Record<Name, HTMLImageElement>
  names.forEach((name, index) => {
    table[name] = images[index]
  })

  return table
}

/**
 * ROOMS 가 요구하는 배경 이름들. 중복은 한 번만 남긴다.
 *
 * 표에 없는 이름이 있으면 조용히 건너뛰지 않고 죽는다. 건너뛰면 그 방으로
 * 넘어갔을 때만 화면이 비고, 그 시점에는 원인이 "에셋 표를 안 고쳤다"라는
 * 것이 전혀 드러나지 않는다. 방을 추가하는 사람이 여기서 바로 막히는 편이 싸다.
 */
function roomAssetNames(): string[] {
  const names = [...new Set(ROOMS.map((room) => room.asset))]
  const missing = names.filter((name) => !(name in ROOM_ASSET_URLS))

  if (missing.length > 0) {
    throw new Error(
      `[sprites] ROOMS 가 쓰는 배경이 ROOM_ASSET_URLS 에 없습니다: ${missing.join(', ')}`,
    )
  }

  return names
}

async function loadAll(): Promise<SpriteSet> {
  const [pet, rooms, items, props, furniture] = await Promise.all([
    loadImage('pet', petUrl),
    loadTable(roomAssetNames(), (name) => ROOM_ASSET_URLS[name]),
    loadTable(ITEM_SPRITE_NAMES, (name) => ITEM_ASSET_URLS[name]),
    loadTable(PROP_SPRITE_NAMES, (name) => PROP_ASSET_URLS[name]),
    // 가구도 첫 벌에 함께 기다린다. 거실에 이미 놓여 있는 가구가 방보다 늦게
    // 도착하면 첫 프레임의 거실이 텅 빈 방으로 보였다가 뒤늦게 채워진다.
    loadTable(FURNITURE_SPRITE_NAMES, (name) => FURNITURE_ASSET_URLS[name]),
  ])

  return { rooms, pet, items, props, furniture, itemApple: items['item-apple'] }
}

let pending: Promise<SpriteSet> | null = null

/**
 * 스프라이트를 전부 불러온다. **실패하면 reject 한다** — 빈 이미지로 조용히
 * 넘어가면 화면이 검게 비어도 원인을 알 수 없다. 부르는 쪽이 사용자에게 알린다.
 *
 * 결과를 모듈에 캐시하는 이유는 StrictMode 다. 마운트를 두 번 시키므로
 * 캐시가 없으면 같은 PNG 를 두 번 내려받고 HTMLImageElement 도 두 벌이 남는다.
 */
export function loadSprites(): Promise<SpriteSet> {
  if (pending === null) {
    pending = loadAll().catch((error: unknown) => {
      // 실패한 약속을 캐시에 남기면 네트워크가 한 번 끊긴 것만으로 이후 모든
      // 재시도가 같은 오류를 즉시 되돌려준다. 다시 시도할 수 있게 비운다.
      pending = null
      throw error
    })
  }

  return pending
}
