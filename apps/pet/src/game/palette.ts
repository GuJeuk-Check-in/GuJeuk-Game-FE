// 펫타운 고정 팔레트 — Vanilla Milkshake.
//
// 출처: lospec 의 vanilla-milkshake. 공식 `.hex` 배포 파일에서 그대로 옮겼다.
// 기억이나 짐작으로 적은 값이 아니다. 한 색이라도 틀리면 양자화 결과가 미묘하게
// 어긋나는데, 그 어긋남은 결과 이미지를 눈으로 봐서는 원인을 찾을 수 없다.
//
// 왜 직접 16색을 짜지 않는가: 명도 분포를 잘못 잡으면 펫과 방 배경이 붙어 보인다.
// 공개 팔레트는 대비와 명도 관계가 이미 검증되어 있다. 펫 색을 팔레트에 맞추지,
// 팔레트를 펫에 맞추지 않는다.
//
// 왜 Sweetie 16 에서 갈아탔는가: 첫 에셋을 뽑아 보니 형광 하늘색 펫과 강한 주황
// 바닥이 촌스러웠다. 후보 11개의 평균 채도를 OKLab 에서 재보니 Sweetie 16 은
// 0.103 으로 상위권이었고, 이 팔레트는 0.075 다. 실제로 같은 원본을 두 팔레트로
// 양자화해 비교한 뒤 골랐다. 근거는 docs/PET_TOWN_SPEC.md §12.7.
//
// **이 팔레트는 밝은 쪽에 치우쳐 있다.** OKLab 명도 0.6 미만이 두 색(28282e,
// 6c5671)뿐이다. 그래서 형태를 지탱하는 것은 명암 그라데이션이 아니라 외곽선이다.
// 어두운 음영을 더 넣으려 해도 쓸 색이 없으므로, 입체감은 외곽선과 색상 차이로
// 만든다. 에셋을 그릴 때 이 제약을 먼저 알고 시작해야 한다.
//
// 이 배열이 팔레트의 **유일한 출처**다.
// - 게임 렌더링 코드는 이 모듈을 import 한다.
// - 후처리 스크립트 `tools/pixelize.mjs` 는 이 파일을 텍스트로 읽어 정규식으로
//   뽑는다 (`.mjs` 가 `.ts` 를 import 할 수 없어서다). 파싱에 실패하면 스크립트는
//   조용한 폴백 없이 즉시 죽는다 — 팔레트가 어긋난 채로 에셋을 전부 뽑는 사고가
//   이 파일이 두 벌로 갈릴 때 생기는 사고다.
//
// 아래 배열 리터럴의 모양(줄 맨 앞에서 시작하는 PALETTE 선언 + 작은따옴표로 감싼
// 6자리 hex)이 스크립트의 파싱 계약이다. 형태를 바꾸면 스크립트가 죽으므로, 바꿀
// 때는 pixelize.mjs 의 loadPalette() 도 함께 고친다. 순서도 바꾸지 마라 — 팔레트
// 인덱스로 색을 지목하는 코드가 전부 밀린다.
export const PALETTE = [
  '28282e',
  '6c5671',
  'd9c8bf',
  'f98284',
  'b0a9e4',
  'accce4',
  'b3e3da',
  'feaae4',
  '87a889',
  'b0eb93',
  'e9f59d',
  'ffe6c6',
  'dea38b',
  'ffc384',
  'fff7a0',
  'fff7e4',
] as const

/** 팔레트에 실제로 존재하는 hex 만 받는 타입. 오타를 컴파일 타임에 잡는다. */
export type PaletteHex = (typeof PALETTE)[number]

/** 0..255 채널 3개. 캔버스 API 에 바로 넘길 수 있는 형태. */
export type Rgb = readonly [number, number, number]

// hex 를 손으로 한 번 더 적어 RGB 표를 만들면 그게 두 번째 출처가 된다.
// 그래서 파생 표는 전부 위 배열에서 계산한다.
export const PALETTE_RGB: readonly Rgb[] = PALETTE.map(
  (hex) =>
    [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ] as const,
)

/** CSS 에서 쓰는 `#rrggbb` 형태. */
export const PALETTE_CSS: readonly string[] = PALETTE.map((hex) => `#${hex}`)

// 이 팔레트에는 순수 검정도 순수 흰색도 없다. 가장 어두운 색과 가장 밝은 색이
// 아래 두 상수다. 흑백 테스트 카드로 확인하다가 "검정이 안 나온다"고 파이프라인을
// 의심하지 않도록 이름을 붙여 둔다. 외곽선은 DARKEST 로, 하이라이트는 LIGHTEST 로
// 붙는 것이 의도된 동작이다.
export const PALETTE_DARKEST: PaletteHex = '28282e'
export const PALETTE_LIGHTEST: PaletteHex = 'fff7e4'

/** 팔레트 인덱스를 찾는다. 팔레트에 없으면 -1. */
export function paletteIndexOf(hex: string): number {
  return (PALETTE as readonly string[]).indexOf(hex.toLowerCase())
}
