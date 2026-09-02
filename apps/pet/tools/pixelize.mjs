#!/usr/bin/env node
// AI 생성 이미지를 펫타운의 도트 에셋으로 바꾼다.
//
// 큰 그림(2048²)을 최종 크기로 줄이고, 고정 16색 팔레트로 스냅한다. 이 양자화가
// 서로 다른 생성물의 톤을 강제로 통일하는 장치다 — 에셋이 한 세트처럼 보이게
// 만드는 것은 프롬프트가 아니라 이 단계다. 설계 근거는 docs/PET_TOWN_SPEC.md §12.
//
// 배경 제거는 여기서 하지 않는다. 생성 모델이 단색 배경 지시를 무시하므로(§12.5)
// 전용 누끼 도구로 알파를 딴 뒤 그 결과를 이 스크립트에 넣는다.
//
// 팔레트에는 순수 검정도 순수 흰색도 없다(가장 어두운 색 1a1c2c, 가장 밝은 색
// f4f4f4). 검은 외곽선은 1a1c2c 로, 흰 하이라이트는 f4f4f4 로 붙는다. 의도된 동작이다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PALETTE_TS = resolve(HERE, '../src/game/palette.ts')

// ────────────────────────────────────────────────────────────────────────────
// 종료 규약
// ────────────────────────────────────────────────────────────────────────────

// 에러는 전부 여기를 지난다. 에셋 파이프라인이 나쁜 결과를 조용히 통과시키면
// 그 결과는 게임에 들어가고, 원인은 몇 주 뒤에 찾게 된다.
function fail(what, why, how) {
  console.error(`\n[pixelize] 실패: ${what}`)
  if (why) console.error(`  원인: ${why}`)
  if (how) console.error(`  조치: ${how}`)
  console.error('')
  process.exit(1)
}

function warn(message) {
  console.error(`[pixelize] 경고: ${message}`)
}

// ────────────────────────────────────────────────────────────────────────────
// 팔레트 — 단일 출처인 palette.ts 에서 읽는다
// ────────────────────────────────────────────────────────────────────────────

// .mjs 는 .ts 를 import 할 수 없다. 그래서 텍스트로 읽어 정규식으로 뽑되,
// 파싱이 무른 대신 검증을 단단하게 한다. 파일 형태가 바뀌면 15색으로 조용히
// 도는 게 아니라 즉시 죽어야 한다. 여기에 하드코딩된 폴백 팔레트를 두는 것은
// 어떤 이유로도 허용하지 않는다 — 그게 §12.2 가 막으려는 정확히 그 사고다.
function loadPalette() {
  if (!existsSync(PALETTE_TS)) {
    fail(
      '팔레트 파일을 찾을 수 없다',
      `${PALETTE_TS} 가 없다`,
      'apps/pet/src/game/palette.ts 를 복구하라. 이 스크립트는 팔레트를 자체 보유하지 않는다.',
    )
  }
  const text = readFileSync(PALETTE_TS, 'utf8')
  // 줄 맨 앞의 선언만 본다. 주석 안에 파싱 계약을 설명하는 문장이 들어와도
  // 그걸 배열로 오인하지 않게 하려는 것이다.
  const block = text.match(/^export const PALETTE\s*=\s*\[([^\]]*)\]/m)
  if (!block) {
    fail(
      '팔레트 배열을 파싱하지 못했다',
      `${PALETTE_TS} 에서 "export const PALETTE = [ ... ]" 형태를 찾지 못했다`,
      '배열 리터럴 형태를 되돌리거나, pixelize.mjs 의 loadPalette() 정규식을 함께 고쳐라.',
    )
  }
  const hexes = [...block[1].matchAll(/'([0-9a-fA-F]{6})'/g)].map((m) => m[1].toLowerCase())
  if (hexes.length !== 16) {
    fail(
      '팔레트 색 개수가 16이 아니다',
      `${hexes.length}개를 읽었다: ${hexes.join(',')}`,
      'palette.ts 의 PALETTE 배열을 16개로 맞춰라. Sweetie 16 은 정확히 16색이다.',
    )
  }
  if (new Set(hexes).size !== 16) {
    fail(
      '팔레트에 중복 색이 있다',
      hexes.join(','),
      '붙여넣기 사고다. palette.ts 를 원본 출처와 다시 대조하라.',
    )
  }
  return hexes
}

// ────────────────────────────────────────────────────────────────────────────
// 색 변환 — sRGB 전달 함수와 OKLab
// ────────────────────────────────────────────────────────────────────────────

// 인코딩된 sRGB 값을 그대로 평균하면 어두워지고 탁해진다. 평균은 반드시 선형
// 광량에서 한다. 이 단계를 빼면 큰 그림을 줄일 때마다 전체가 한 단계씩 어두워져
// 팔레트 스냅이 매번 한 칸 어두운 색으로 붙는다.
//
// 0.04045 / 0.0031308 은 한 쌍이다. 다른 문헌의 0.03928 과 섞어 쓰면 라운드트립이
// 깨진다. 어느 쪽을 쓰느냐보다 정·역이 같은 쌍이냐가 중요하다.
const EOTF = new Float64Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  EOTF[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function toSrgb8(linear) {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}

// 알파에는 절대 적용하지 않는다. 알파는 커버리지이지 밝기가 아니다.
// 이것이 이 파이프라인에서 가장 흔한 무증상 버그다.

// Björn Ottosson 의 OKLab. 입력은 선형 sRGB 다. 인코딩된 8비트를 그대로
// 행렬에 넣으면 안 된다.
function oklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

// RGB 유클리드를 쓰지 않는 이유: 팔레트가 16색뿐이라 스냅이 큰 색 거리를 두고
// 일어나고, 판정 하나하나가 최종 픽셀을 확정한다. sRGB 거리는 1a1c2c(짙은 남색)와
// 333c57(짙은 슬레이트)을 가깝게 보므로, 그늘의 중간 픽셀들이 노이즈를 따라 두 색
// 사이를 오가며 지글거리는 얼룩이 된다. OKLab 은 명도·색상이 거의 균일해서 같은
// 그늘 램프가 일관되게 한 색으로 붙는다.
// L 에 가중치를 낮추지 마라 — 16색에서 형태를 지탱하는 것은 명암이다.
function labDist2(a, b) {
  const d0 = a[0] - b[0]
  const d1 = a[1] - b[1]
  const d2 = a[2] - b[2]
  return d0 * d0 + d1 * d1 + d2 * d2
}

// 상수를 손으로 옮겨 적었으므로 자체 테스트를 반드시 둔다.
// 실패하면 상수나 반올림이 틀린 것이고, 결과 이미지로는 원인을 못 찾는다.
function assertColorMath() {
  for (let c = 0; c < 256; c++) {
    if (toSrgb8(EOTF[c]) !== c) {
      fail(
        '감마 라운드트립 자체 테스트 실패',
        `toSrgb8(EOTF(${c})) === ${toSrgb8(EOTF[c])}`,
        'EOTF / 역 EOTF 상수쌍(0.04045 · 0.0031308)이나 반올림을 확인하라.',
      )
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────────

const USAGE = `사용법:
  node tools/pixelize.mjs --in <입력.png> --out <출력.png> --size <32 | 180x320>
    [--colors <hex,hex,...>]  이 에셋이 쓸 색을 팔레트 부분집합으로 제한한다
    [--outline <hex>]         축소 후 실루엣 바깥 1px 를 이 색으로 채운다
    [--alpha-threshold <n>]   알파 이진화 임계. 기본 0.5
    [--despeckle]             이웃과 완전히 동떨어진 1px 점을 다수색으로 덮는다
    [--preview <n>]           <출력>-x<n>.png 로 정수배 확대본을 함께 쓴다`

function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) fail('알 수 없는 인자', `"${token}"`, USAGE)
    const eq = token.indexOf('=')
    const name = eq < 0 ? token.slice(2) : token.slice(2, eq)
    let value = eq < 0 ? null : token.slice(eq + 1)
    if (value === null) {
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        value = next
        i++
      } else {
        value = true
      }
    }
    opts[name] = value
  }
  return opts
}

function parseSize(raw) {
  if (typeof raw !== 'string') fail('--size 가 없다', null, USAGE)
  const parts = raw.toLowerCase().split('x')
  const w = Number(parts[0])
  const h = parts.length === 1 ? w : Number(parts[1])
  if (parts.length > 2 || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
    fail('--size 형식이 잘못됐다', `"${raw}"`, '"32" 또는 "180x320" 처럼 준다.')
  }
  return { w, h }
}

/** 팔레트 인덱스로 바꾼다. 팔레트에 없는 색을 넘기면 조용히 무시하지 않고 죽는다. */
function resolveColors(raw, palette, flagName) {
  if (typeof raw !== 'string') return null
  return raw.split(',').map((token) => {
    const hex = token.trim().replace(/^#/, '').toLowerCase()
    const index = palette.indexOf(hex)
    if (index < 0) {
      fail(
        `${flagName} 에 팔레트에 없는 색이 있다`,
        `"${hex}"`,
        `팔레트 16색 중에서 고른다: ${palette.join(', ')}`,
      )
    }
    return index
  })
}

// ────────────────────────────────────────────────────────────────────────────
// 입력 PNG 디코드와 검증
// ────────────────────────────────────────────────────────────────────────────

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function readChunkTypes(buf) {
  const types = []
  let p = 8
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    types.push({ type, start: p + 8, len })
    if (type === 'IEND') break
    p += 12 + len
  }
  return types
}

function decodeSource(path) {
  if (!existsSync(path)) {
    fail('입력 파일이 없다', path, '경로를 확인하라. 원본은 apps/pet/tools/raw/ 에 둔다.')
  }
  const buf = readFileSync(path)
  // JPEG 을 받지 않는 이유: 크로마 서브샘플링이 경계색을 2px 번지게 만들어
  // 알파 경계 처리를 비대칭으로 실패시킨다.
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
    fail('입력이 PNG 가 아니다', path, 'PNG 로 다시 내보내라. JPEG 은 받지 않는다.')
  }
  const chunks = readChunkTypes(buf)
  // pngjs 는 색공간 청크를 무시하고 원시 바이트만 준다. 생성 도구가 Display P3
  // 프로파일이나 비-sRGB 감마를 박아 넣으면 우리가 적용하는 sRGB EOTF 가 틀린
  // 역함수가 되어 모든 색이 통째로 밀린다. 브라우저는 프로파일을 존중하므로
  // "원본은 맞는데 결과만 이상한" 상태가 된다.
  if (chunks.some((c) => c.type === 'iCCP')) {
    fail(
      '입력에 ICC 프로파일(iCCP)이 있다',
      'pngjs 는 프로파일을 무시하므로 색이 통째로 밀린다',
      'sRGB PNG 로 다시 내보내라 (프로파일 없이).',
    )
  }
  const gama = chunks.find((c) => c.type === 'gAMA')
  if (gama && buf.readUInt32BE(gama.start) !== 45455) {
    fail(
      '입력의 gAMA 가 sRGB(45455)가 아니다',
      `gAMA = ${buf.readUInt32BE(gama.start)}`,
      'sRGB PNG 로 다시 내보내라.',
    )
  }
  const bitDepth = buf[24]
  if (bitDepth !== 8) {
    fail(
      '입력이 채널당 8비트가 아니다',
      `bitDepth = ${bitDepth}`,
      '8비트 PNG 로 다시 내보내라. 16비트는 인덱스 계산이 어긋나 이미지가 찢어진다.',
    )
  }
  const png = PNG.sync.read(buf)
  if (png.data.length !== png.width * png.height * 4) {
    fail(
      '디코드 결과가 RGBA8 규약과 다르다',
      `data ${png.data.length} !== ${png.width}*${png.height}*4`,
      '입력 PNG 를 8비트 RGBA 로 다시 내보내라.',
    )
  }
  return png
}

// ────────────────────────────────────────────────────────────────────────────
// 축소 · 양자화 · 외곽선
// ────────────────────────────────────────────────────────────────────────────

/**
 * 면적 가중 평균으로 줄인다. 배수가 정수가 아니어도 된다 — 각 출력 픽셀이 덮는
 * 소스 영역만 보므로 격자가 어긋나지 않는다. 방이 1152×2048 → 180×320 으로
 * 6.4배 줄어드는 것이 실제 사례다.
 *
 * 색은 선형 광량에서, 알파를 곱한 상태(premultiplied)로 더한다. premultiply 를
 * 빼먹으면 투명한 배경 픽셀의 색까지 평균에 섞여 실루엣 가장자리에 검은 테가
 * 생긴다.
 */
function resample(src, dstW, dstH) {
  const rgb = new Float64Array(dstW * dstH * 3)
  const alpha = new Float64Array(dstW * dstH)
  for (let y = 0; y < dstH; y++) {
    const y0 = (y * src.height) / dstH
    const y1 = ((y + 1) * src.height) / dstH
    for (let x = 0; x < dstW; x++) {
      const x0 = (x * src.width) / dstW
      const x1 = ((x + 1) * src.width) / dstW
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let weight = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = (Math.min(x1, sx + 1) - Math.max(x0, sx)) * wy
          const i = (src.width * sy + sx) << 2
          const al = src.data[i + 3] / 255
          r += EOTF[src.data[i]] * al * w
          g += EOTF[src.data[i + 1]] * al * w
          b += EOTF[src.data[i + 2]] * al * w
          a += al * w
          weight += w
        }
      }
      const p = dstW * y + x
      alpha[p] = a / weight
      if (a > 0) {
        // 알파로 나눠 premultiply 를 되돌린다.
        rgb[p * 3] = r / a
        rgb[p * 3 + 1] = g / a
        rgb[p * 3 + 2] = b / a
      }
    }
  }
  return { rgb, alpha }
}

/** 도트에는 반투명이 없다. 경계를 임계값 하나로 자른다. */
function binarize(alpha, threshold) {
  const bin = new Uint8Array(alpha.length)
  for (let i = 0; i < alpha.length; i++) bin[i] = alpha[i] >= threshold ? 1 : 0
  return bin
}

/** 불투명 픽셀마다 가장 가까운 팔레트 색의 인덱스를 고른다. */
function quantize(rgb, alphaBin, active) {
  const index = new Int16Array(alphaBin.length).fill(-1)
  for (let p = 0; p < alphaBin.length; p++) {
    if (!alphaBin[p]) continue
    const lab = oklab(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2])
    let best = active[0]
    let bestDist = Infinity
    for (const c of active) {
      const d = labDist2(lab, c.lab)
      if (d < bestDist) {
        bestDist = d
        best = c
      }
    }
    index[p] = best.index
  }
  return index
}

/**
 * 실루엣 바깥 1px 를 어두운 색으로 채운다.
 *
 * 축소 비율이 선 두께를 정한다. 방(6.4:1)은 소스의 굵은 외곽선이 3px 로 살아남지만
 * 펫(32:1)·아이템(85:1)에서는 0.3px 이 되어 평균에 완전히 녹는다. 프롬프트로 "더
 * 굵은 외곽선"을 요구해도 비율이 그대로면 같은 일이 일어난다. 그래서 축소 뒤에
 * 직접 그린다. 근거는 §12.5.
 */
function attachOutline(index, alphaBin, w, h, outlineIndex) {
  const before = Uint8Array.from(alphaBin)
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && before[w * y + x] === 1
  let painted = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = w * y + x
      if (before[p]) continue
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        index[p] = outlineIndex
        alphaBin[p] = 1
        painted++
      }
    }
  }
  return painted
}

/**
 * 외톨이 픽셀 하나를 이웃 다수색으로 덮는다.
 *
 * 해상도를 180×320 에서 360×640 으로 올리자 소스의 미세한 텍스처가 평균에 묻히지
 * 않고 살아남아, 벽·바닥에 다른 색 점이 흩뿌려졌다. 낮은 해상도에서는 없던 문제다.
 *
 * 자기 색과 같은 이웃이 하나도 없을 때만 손댄다. 눈 하이라이트처럼 의도된 1px
 * 점은 보통 같은 색 이웃을 갖거나 다수색이 갈리므로 살아남지만, 그래도 기본은
 * 끄고 필요한 에셋에만 켠다.
 */
function despeckle(index, alphaBin, w, h) {
  const before = Int16Array.from(index)
  let changed = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = w * y + x
      if (!alphaBin[p]) continue
      const mine = before[p]
      const counts = new Map()
      let sameAsMine = false
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = w * ny + nx
        if (!alphaBin[q]) continue
        const c = before[q]
        if (c === mine) sameAsMine = true
        counts.set(c, (counts.get(c) ?? 0) + 1)
      }
      if (sameAsMine || counts.size === 0) continue
      let top = -1
      let topCount = 0
      let tied = false
      for (const [c, n] of counts) {
        if (n > topCount) {
          top = c
          topCount = n
          tied = false
        } else if (n === topCount) {
          tied = true
        }
      }
      if (tied || topCount < 2) continue
      index[p] = top
      changed++
    }
  }
  return changed
}

// ────────────────────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────────────────────

function encode(index, alphaBin, w, h, palette) {
  const png = new PNG({ width: w, height: h })
  for (let p = 0; p < alphaBin.length; p++) {
    const o = p << 2
    if (!alphaBin[p]) continue
    const c = palette[index[p]]
    png.data[o] = c.r
    png.data[o + 1] = c.g
    png.data[o + 2] = c.b
    png.data[o + 3] = 255
  }
  return PNG.sync.write(png)
}

/** 확대는 반드시 정수배 최근접이다. 보간이 끼면 도트가 뭉개진다. */
function upscale(png, factor) {
  const big = new PNG({ width: png.width * factor, height: png.height * factor })
  for (let y = 0; y < big.height; y++) {
    for (let x = 0; x < big.width; x++) {
      const s = (png.width * ((y / factor) | 0) + ((x / factor) | 0)) << 2
      const d = (big.width * y + x) << 2
      for (let k = 0; k < 4; k++) big.data[d + k] = png.data[s + k]
    }
  }
  return PNG.sync.write(big)
}

// ────────────────────────────────────────────────────────────────────────────
// 검증
// ────────────────────────────────────────────────────────────────────────────

// 눈으로 보기 전에 숫자로 먼저 거른다. 여기서 거르지 못하는 것(형태가 읽히는가,
// 세 장이 한 세트로 보이는가)만 tools/check.html 에서 사람이 판정한다.
function measure(buffer, palette) {
  const png = PNG.sync.read(buffer)
  const known = new Set(palette.map((c) => `${c.r},${c.g},${c.b}`))
  const seen = new Set()
  let opaque = 0
  let semi = 0
  let outside = 0
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3]
    if (a === 0) continue
    if (a !== 255) {
      semi++
      continue
    }
    opaque++
    const key = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`
    seen.add(key)
    if (!known.has(key)) outside++
  }
  return { unique: seen.size, opaque, semi, outside }
}

function judge(m) {
  const problems = []
  if (m.outside > 0) {
    problems.push(`팔레트 밖 색이 ${m.outside}픽셀 있다 — 양자화가 새고 있다`)
  }
  if (m.semi > 0) {
    problems.push(`반투명 픽셀이 ${m.semi}개 있다 — 알파 이진화가 새고 있다`)
  }
  if (m.unique > 16) {
    problems.push(`고유색이 ${m.unique}개다 — 16색을 넘을 수 없다`)
  }
  if (m.opaque === 0) {
    problems.push('불투명 픽셀이 하나도 없다 — 결과가 통째로 비었다')
  }
  return problems
}

// ────────────────────────────────────────────────────────────────────────────

function main() {
  assertColorMath()

  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || opts.h) {
    console.log(USAGE)
    return
  }
  if (typeof opts.in !== 'string' || typeof opts.out !== 'string') {
    fail('--in 과 --out 이 모두 필요하다', null, USAGE)
  }

  const hexes = loadPalette()
  const palette = hexes.map((hex, index) => {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return { index, hex, r, g, b, lab: oklab(EOTF[r], EOTF[g], EOTF[b]) }
  })

  const subset = resolveColors(opts.colors, hexes, '--colors')
  const active = (subset ?? palette.map((c) => c.index)).map((i) => palette[i])
  const outline = resolveColors(opts.outline, hexes, '--outline')
  if (outline && outline.length !== 1) {
    fail('--outline 은 색 하나만 받는다', `${outline.length}개를 받았다`, USAGE)
  }

  const threshold = opts['alpha-threshold'] === undefined ? 0.5 : Number(opts['alpha-threshold'])
  if (!(threshold > 0 && threshold <= 1)) {
    fail('--alpha-threshold 가 0~1 범위가 아니다', String(opts['alpha-threshold']), USAGE)
  }

  const { w, h } = parseSize(opts.size)
  const src = decodeSource(opts.in)

  // 소스가 전부 불투명이면 누끼를 빠뜨렸을 가능성이 크다. 다만 방 배경은 원래
  // 전부 불투명하므로 죽이지 않고 알리기만 한다.
  let sourceOpaque = true
  for (let i = 3; i < src.data.length && sourceOpaque; i += 4) {
    if (src.data[i] !== 255) sourceOpaque = false
  }
  if (sourceOpaque && outline) {
    warn('소스에 투명 픽셀이 없다. 누끼를 빠뜨렸다면 --outline 이 아무것도 그리지 않는다.')
  }

  const { rgb, alpha } = resample(src, w, h)
  const alphaBin = binarize(alpha, threshold)
  const index = quantize(rgb, alphaBin, active)
  const speckles = opts.despeckle ? despeckle(index, alphaBin, w, h) : 0
  if (outline) attachOutline(index, alphaBin, w, h, outline[0])

  const buffer = encode(index, alphaBin, w, h, palette)
  writeFileSync(opts.out, buffer)

  const m = measure(buffer, palette)
  const problems = judge(m)
  console.log(
    `${opts.out} ${w}x${h} | 고유색 ${m.unique} | 팔레트밖 ${m.outside} | ` +
      `반투명 ${m.semi} | 불투명 ${m.opaque}` +
      (opts.despeckle ? ` | 점 제거 ${speckles}` : ''),
  )

  if (opts.preview !== undefined) {
    const factor = Number(opts.preview)
    if (!Number.isInteger(factor) || factor < 1) {
      fail('--preview 는 1 이상의 정수여야 한다', String(opts.preview), USAGE)
    }
    const path = opts.out.replace(/\.png$/i, `-x${factor}.png`)
    if (path === opts.out) fail('--out 이 .png 로 끝나지 않는다', opts.out, USAGE)
    writeFileSync(path, upscale(PNG.sync.read(buffer), factor))
    console.log(`  확대본 ${path} (x${factor})`)
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`[pixelize] 불합격: ${p}`)
    process.exit(2)
  }
}

main()
