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
import petAdultUrl from '../assets/pet-adult.png'
import petAdultBlinkUrl from '../assets/pet-adult-blink.png'
import petAdultOpenUrl from '../assets/pet-adult-open.png'
import petAdultSadUrl from '../assets/pet-adult-sad.png'
import petBabyUrl from '../assets/pet-baby.png'
import petBabyBlinkUrl from '../assets/pet-baby-blink.png'
import petBabyOpenUrl from '../assets/pet-baby-open.png'
import petBabySadUrl from '../assets/pet-baby-sad.png'
import petChildUrl from '../assets/pet-child.png'
import petChildBlinkUrl from '../assets/pet-child-blink.png'
import petChildOpenUrl from '../assets/pet-child-open.png'
import petChildSadUrl from '../assets/pet-child-sad.png'
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
import { petSpriteName } from './pet/face'
import type { FaceKind } from './pet/face'
import { ROOMS } from './rooms'
import type { FoodId, FurnitureId, Stage } from './types'

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
 * 펫 스프라이트 12장(성장 3단계 × 표정 4종) → 파일 주소.
 *
 * **키는 face.ts 의 petSpriteName() 이 만드는 이름과 같은 모양이다.** 키 타입을
 * 템플릿 리터럴로 못 박아 두어, 단계나 표정이 하나 늘면 이 표가 컴파일 오류로
 * 먼저 막는다 — 표만 손으로 맞추면 그 조합을 처음 그리는 순간에야 undefined 로
 * 터진다(furnitureSpriteName 과 같은 규칙이다).
 *
 * 이름을 여기서 다시 조립하지 않는 이유는 face.ts 가 적어 둔 그대로다: 문자열을
 * 부르는 쪽마다 붙이면 오타가 런타임까지 살아남는다. 표의 키만 리터럴로 적고,
 * 찾을 때는 petSpriteName() 이 만든 이름으로 찾는다(petAssetUrl).
 */
type PetSpriteKey = `pet-${Stage}` | `pet-${Stage}-${Exclude<FaceKind, 'base'>}`

const PET_ASSET_URLS: Record<PetSpriteKey, string> = {
  'pet-baby': petBabyUrl,
  'pet-baby-blink': petBabyBlinkUrl,
  'pet-baby-sad': petBabySadUrl,
  'pet-baby-open': petBabyOpenUrl,
  'pet-child': petChildUrl,
  'pet-child-blink': petChildBlinkUrl,
  'pet-child-sad': petChildSadUrl,
  'pet-child-open': petChildOpenUrl,
  'pet-adult': petAdultUrl,
  'pet-adult-blink': petAdultBlinkUrl,
  'pet-adult-sad': petAdultSadUrl,
  'pet-adult-open': petAdultOpenUrl,
}

/**
 * 표의 이름을 petSpriteName() 이 만든 이름으로 찾는다.
 *
 * petSpriteName 은 string 을 돌려주므로 좁히는 곳이 한 번은 필요하다. 그 한
 * 곳을 여기로 모으고, 어긋나면 조용히 넘어가지 않고 로딩 시점에 죽는다 — 그림
 * 하나가 undefined 인 채로 진행되면 그 표정이 처음 나오는 순간에야 터지고,
 * 그때는 원인이 "표를 안 고쳤다"라는 것이 전혀 드러나지 않는다.
 */
function petAssetUrl(stage: Stage, face: FaceKind): string {
  const name = petSpriteName(stage, face)
  const url: string | undefined = PET_ASSET_URLS[name as PetSpriteKey]

  if (url === undefined) {
    throw new Error(`[sprites] 펫 스프라이트 '${name}' 이(가) PET_ASSET_URLS 에 없습니다.`)
  }

  return url
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
  /**
   * 성장 3단계 × 표정 4종. `pets[stage][face]` 로 찾는다.
   *
   * **12장을 한 벌로 다 불러온다.** 표정은 깜빡임처럼 0.12초짜리도 있어서, 그
   * 순간에 내려받기 시작하면 첫 깜빡임에서 펫이 한 프레임 사라진다. 레벨업으로
   * 단계가 바뀌는 순간도 같다 — 축하 문구가 뜨는데 펫만 없는 화면이 된다.
   * 12장을 합쳐도 방 배경 한 장 남짓이다.
   */
  readonly pets: Readonly<Record<Stage, Readonly<Record<FaceKind, HTMLImageElement>>>>
  /** `item-apple` 처럼 파일 이름 그대로가 키다. */
  readonly items: Readonly<Record<ItemSpriteName, HTMLImageElement>>
  /** `prop-bomb` 처럼 파일 이름 그대로가 키다. */
  readonly props: Readonly<Record<PropSpriteName, HTMLImageElement>>
  /** `furn-plant` 처럼 파일 이름 그대로가 키다. furnitureSpriteName() 으로 찾는다. */
  readonly furniture: Readonly<Record<FurnitureSpriteName, HTMLImageElement>>
}

/**
 * 한 단계의 펫 스프라이트 안에서 펫이 실제로 차지하는 자리.
 *
 * **눈으로 어림한 값이 아니라 잰 값이다.** 세 단계 모두 알파 > 127 인 픽셀의
 * 경계 상자를 재서 넣었고, 같은 단계의 표정 네 장은 경계가 완전히 같다(표정
 * 변형은 실루엣을 건드리지 않는다). 에셋을 다시 뽑으면 이 값도 다시 재야 한다.
 */
export interface PetMetrics {
  /** 스프라이트 한 변(px). 정사각형이다. */
  readonly size: number
  /** 발바닥 바로 아래 줄. 이 줄이 방의 바닥선(anchor.y)에 닿게 그린다. */
  readonly feetY: number
  /** 불투명 영역의 가로 중심. 스프라이트 한가운데가 아니다. */
  readonly centerX: number
  /** 불투명 영역의 왼쪽 끝(스프라이트 좌표). */
  readonly bodyLeft: number
  /** 불투명 영역의 위쪽 끝(스프라이트 좌표). */
  readonly bodyTop: number
  readonly bodyWidth: number
  readonly bodyHeight: number
}

/**
 * 성장 3단계의 실측값(명세 §6 · §12.11).
 *
 * **단계마다 스프라이트 크기가 다르다**(80 · 104 · 128). 그래서 화면이 쓰는 값은
 * 상수 하나가 아니라 단계별 표다. 어른 값 하나만 들고 그리면 아기는 바닥에
 * 46px 파묻히고 가로로 21px 밀려 선다 — 발밑 기준(feetY)과 가로 중심(centerX)이
 * 둘 다 크기에 따라 다르기 때문이다.
 *
 * 어른의 값이 예전 PET_SPRITE 와 같은 것은 우연이 아니라 같은 그림이라서다.
 * 세 장은 같은 원본을 세 크기로 뽑은 것이고(§12.11), 그래서 크기 비가 곧
 * 좌표 비다 — petScale() 이 그 사실을 쓴다.
 */
export const PET_METRICS: Record<Stage, PetMetrics> = {
  baby: {
    size: 80,
    feetY: 76,
    centerX: 34,
    bodyLeft: 3,
    bodyTop: 4,
    bodyWidth: 63,
    bodyHeight: 72,
  },
  child: {
    size: 104,
    feetY: 99,
    // 실측 중심은 44.5 다(4~85). 정수만 쓰므로 내림한다 — 도트를 소수 좌표에
    // 그리면 뭉개진다(§12.3). 0.5px 은 어느 쪽으로 접어도 눈에 띄지 않는다.
    centerX: 44,
    bodyLeft: 4,
    bodyTop: 6,
    bodyWidth: 82,
    bodyHeight: 93,
  },
  adult: {
    size: 128,
    feetY: 122,
    centerX: 55,
    bodyLeft: 5,
    bodyTop: 7,
    bodyWidth: 101,
    bodyHeight: 115,
  },
}

/**
 * 어른 기준으로 잡아 둔 값을 이 단계로 옮기는 배수.
 *
 * 미니게임의 밸런싱 상수(펫 히트박스 등)는 전부 어른 크기에서 맞춘 값이다.
 * 세 단계가 **같은 그림의 크기만 다른 것**이므로(§12.11) 크기 비를 곱하면 그
 * 값들이 그대로 따라온다. 단계마다 상수를 따로 적으면 하나를 고칠 때 나머지
 * 둘이 남는다.
 */
export function petScale(stage: Stage): number {
  return PET_METRICS[stage].size / PET_METRICS.adult.size
}

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

/**
 * 한 단계의 표정 네 장.
 *
 * 객체 리터럴로 돌려주는 것은 **빠뜨림을 컴파일러가 잡게 하려고**서다.
 * Record<FaceKind, …> 는 네 키를 전부 요구하므로, 표정이 하나 늘면 여기서 먼저
 * 막힌다. 이름 배열을 돌려 표를 채우면 하나를 빠뜨려도 빌드가 통과한다.
 */
async function loadPetStage(stage: Stage): Promise<Record<FaceKind, HTMLImageElement>> {
  const [base, blink, sad, open] = await Promise.all([
    loadImage(petSpriteName(stage, 'base'), petAssetUrl(stage, 'base')),
    loadImage(petSpriteName(stage, 'blink'), petAssetUrl(stage, 'blink')),
    loadImage(petSpriteName(stage, 'sad'), petAssetUrl(stage, 'sad')),
    loadImage(petSpriteName(stage, 'open'), petAssetUrl(stage, 'open')),
  ])

  return { base, blink, sad, open }
}

async function loadAll(): Promise<SpriteSet> {
  // 단계도 같은 이유로 하나씩 적는다. Record<Stage, …> 가 세 단계를 전부 요구한다.
  const [baby, child, adult, rooms, items, props, furniture] = await Promise.all([
    loadPetStage('baby'),
    loadPetStage('child'),
    loadPetStage('adult'),
    loadTable(roomAssetNames(), (name) => ROOM_ASSET_URLS[name]),
    loadTable(ITEM_SPRITE_NAMES, (name) => ITEM_ASSET_URLS[name]),
    loadTable(PROP_SPRITE_NAMES, (name) => PROP_ASSET_URLS[name]),
    // 가구도 첫 벌에 함께 기다린다. 거실에 이미 놓여 있는 가구가 방보다 늦게
    // 도착하면 첫 프레임의 거실이 텅 빈 방으로 보였다가 뒤늦게 채워진다.
    loadTable(FURNITURE_SPRITE_NAMES, (name) => FURNITURE_ASSET_URLS[name]),
  ])

  return {
    rooms,
    pets: { baby, child, adult },
    items,
    props,
    furniture,
  }
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
