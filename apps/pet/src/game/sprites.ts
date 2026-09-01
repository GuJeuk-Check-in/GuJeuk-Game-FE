// 스프라이트 로딩과 프레임 정의.
//
// PNG 는 Vite 의 에셋 import 로만 가져온다. 경로 문자열을 손으로 적으면 빌드가
// 붙이는 해시(`pet.a1b2c3.png`)를 따라갈 수 없어, 개발 서버에서는 멀쩡하다가
// 배포에서만 404 가 난다.

import itemAppleUrl from '../assets/item-apple.png'
import petUrl from '../assets/pet.png'
import roomBathUrl from '../assets/room-bath.png'
import roomBedUrl from '../assets/room-bed.png'
import roomKitchenUrl from '../assets/room-kitchen.png'
import roomLivingUrl from '../assets/room-living.png'
import roomPlayUrl from '../assets/room-play.png'
import roomShopUrl from '../assets/room-shop.png'
import { ROOMS } from './rooms'

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
 */
export const PET_SPRITE = {
  width: 128,
  height: 128,
  /** 발바닥 바로 아래 줄. 이 줄이 바닥선에 닿게 그린다. */
  feetY: 122,
  /** 불투명 영역의 가로 중심. */
  centerX: 55,
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
  const names = roomAssetNames()

  const [pet, itemApple, ...roomImages] = await Promise.all([
    loadImage('pet', petUrl),
    loadImage('item-apple', itemAppleUrl),
    ...names.map((name) => loadImage(name, ROOM_ASSET_URLS[name])),
  ])

  const rooms: Record<string, HTMLImageElement> = {}
  names.forEach((name, index) => {
    rooms[name] = roomImages[index]
  })

  return { rooms, pet, itemApple }
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
