// 스프라이트 로딩과 프레임 정의.
//
// PNG 는 Vite 의 에셋 import 로만 가져온다. 경로 문자열을 손으로 적으면 빌드가
// 붙이는 해시(`pet.a1b2c3.png`)를 따라갈 수 없어, 개발 서버에서는 멀쩡하다가
// 배포에서만 404 가 난다.

import itemAppleUrl from '../assets/item-apple.png'
import petUrl from '../assets/pet.png'
import roomLivingUrl from '../assets/room-living.png'

/**
 * 한 벌로 다 불러온 스프라이트.
 *
 * 하나씩 도착하는 대로 그리지 않는다. 방만 있고 펫이 없는 중간 상태가 화면에
 * 남으면 "펫이 사라졌다"로 보인다.
 */
export interface SpriteSet {
  readonly roomLiving: HTMLImageElement
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

async function loadAll(): Promise<SpriteSet> {
  const [roomLiving, pet, itemApple] = await Promise.all([
    loadImage('room-living', roomLivingUrl),
    loadImage('pet', petUrl),
    loadImage('item-apple', itemAppleUrl),
  ])

  return { roomLiving, pet, itemApple }
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
