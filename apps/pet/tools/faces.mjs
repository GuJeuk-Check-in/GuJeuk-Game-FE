#!/usr/bin/env node
// 펫 스프라이트에서 표정 변형(눈 감음 · 처진 눈썹 · 입 벌림)을 만든다.
//
// 명세 §12.1 은 표정 오버레이를 "손으로 찍는다"고 적었다. 그런데 눈과 입은
// 스프라이트 안에서 **기계적으로 찾을 수 있다** — 눈은 몸통 안에 있는 밝은 덩어리
// 두 개이고, 동공과 입은 실루엣 외곽선과 이어지지 않은 어두운 덩어리다. 찾을 수
// 있으면 손으로 찍을 이유가 없다. 성장 3단계 × 표정 3종을 손으로 9벌 찍으면
// 그중 하나만 어긋나도 눈치채기 어렵다.
//
// 이 스크립트는 **원본 스프라이트를 고치지 않는다.** 변형본을 따로 쓴다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

function fail(what, why, how) {
  console.error(`\n[faces] 실패: ${what}`)
  if (why) console.error(`  원인: ${why}`)
  if (how) console.error(`  조치: ${how}`)
  console.error('')
  process.exit(1)
}

const USAGE = `사용법:
  node tools/faces.mjs --in <펫.png> --out-prefix <경로/이름>
    [--dark <hex>]   외곽선·동공 색. 기본 28282e
    [--light <hex>]  흰자 색. 기본 fff7e4
    [--reference <png>]  눈·입 위치를 이 그림에서 찾아 비례로 옮긴다`

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i < 0 || argv[i + 1] === undefined ? fallback : argv[i + 1]
}

const input = flag('in', null)
const outPrefix = flag('out-prefix', null)
if (!input || !outPrefix) fail('--in 과 --out-prefix 가 모두 필요하다', null, USAGE)
if (!existsSync(input)) fail('입력 파일이 없다', input, '경로를 확인하라.')

const DARK = flag('dark', '28282e')
const LIGHT = flag('light', 'fff7e4')
const rgb = (hex) => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
]
const [DR, DG, DB] = rgb(DARK)
const [LR, LG, LB] = rgb(LIGHT)

const reference = flag('reference', null)
if (reference && !existsSync(reference)) fail('--reference 파일이 없다', reference, null)

const png = PNG.sync.read(readFileSync(input))
const { width: W, height: H, data } = png
const at = (x, y) => (W * y + x) << 2
const isOpaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[at(x, y) + 3] === 255
const isColor = (x, y, r, g, b) => {
  if (!isOpaque(x, y)) return false
  const i = at(x, y)
  return data[i] === r && data[i + 1] === g && data[i + 2] === b
}

const isDark = (x, y) => isColor(x, y, DR, DG, DB)
const isLight = (x, y) => isColor(x, y, LR, LG, LB)

/**
 * 눈·입 상자를 찾는다.
 *
 * **작은 스프라이트에서는 이 검출이 무너진다.** 80px 짜리 아기는 눈이 6px 이라
 * 흰자 하나가 통째로 사라져 한쪽만 감기고, 몸 아래 그림자가 입으로 잡혀 검은
 * 덩어리가 생겼다. 세 단계가 같은 그림을 크기만 달리한 것이므로, 큰 그림에서
 * 찾은 상자를 비례로 옮기는 편이 확실하다(--reference).
 */
function detect(img) {
  const w = img.width
  const h = img.height
  const px = img.data
  const idx = (x, y) => (w * y + x) << 2
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[idx(x, y) + 3] === 255
  const same = (x, y, r, g, b) => {
    if (!opaque(x, y)) return false
    const i = idx(x, y)
    return px[i] === r && px[i + 1] === g && px[i + 2] === b
  }
  const comps = (match) => {
    const seen = new Uint8Array(w * h)
    const found = []
    for (let sy = 0; sy < h; sy++) {
      for (let sx = 0; sx < w; sx++) {
        const start = w * sy + sx
        if (seen[start] || !match(sx, sy)) continue
        const stack = [start]
        seen[start] = 1
        let n = 0
        let minX = w
        let minY = h
        let maxX = -1
        let maxY = -1
        while (stack.length > 0) {
          const p = stack.pop()
          const x = p % w
          const y = (p / w) | 0
          n++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
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
            if (seen[q] || !match(nx, ny)) continue
            seen[q] = 1
            stack.push(q)
          }
        }
        found.push({ n, minX, minY, maxX, maxY })
      }
    }
    return found
  }

  const eyes = comps((x, y) => same(x, y, LR, LG, LB))
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
  if (eyes.length !== 2) fail('눈을 찾지 못했다', `흰자 덩어리 ${eyes.length}개`, USAGE)
  eyes.sort((a, b) => a.minX - b.minX)

  const darkComps = comps((x, y) => same(x, y, DR, DG, DB)).sort((a, b) => b.n - a.n)
  const within = (c, box) =>
    c.minX >= box.minX - 1 &&
    c.maxX <= box.maxX + 1 &&
    c.minY >= box.minY - 1 &&
    c.maxY <= box.maxY + 1
  const eyeBottom = Math.max(eyes[0].maxY, eyes[1].maxY)
  const eyeHeight = Math.max(eyes[0].maxY - eyes[0].minY, eyes[1].maxY - eyes[1].minY) + 1
  const found = darkComps
    .slice(1)
    .filter((c) => !eyes.some((e) => within(c, e)))
    .filter((c) => {
      const cx = (c.minX + c.maxX) / 2
      const cy = (c.minY + c.maxY) / 2
      // 눈 바로 아래, 두 눈 사이. **"아래" 에 상한을 두지 않으면 몸 아래 그림자가
      // 입으로 잡힌다** — 아기 스프라이트에서 실제로 그렇게 잡혔다.
      return (
        cy > eyeBottom && cy < eyeBottom + eyeHeight * 3 && cx >= eyes[0].minX && cx <= eyes[1].maxX
      )
    })
    .sort((a, b) => b.n - a.n)[0]
  if (!found) fail('입을 찾지 못했다', '눈 아래 가운데에 어두운 덩어리가 없다', USAGE)
  return { eyes, mouth: found, width: w }
}

// 기준 그림이 있으면 거기서 찾아 비례로 옮긴다. 없으면 자기 자신에서 찾는다.
const source = reference ? PNG.sync.read(readFileSync(reference)) : png
const detected = detect(source)
const ratio = W / detected.width
const scaleBox = (b) => ({
  minX: Math.round(b.minX * ratio),
  minY: Math.round(b.minY * ratio),
  maxX: Math.round(b.maxX * ratio),
  maxY: Math.round(b.maxY * ratio),
})
const whites = detected.eyes.map(scaleBox)
const mouth = scaleBox(detected.mouth)

/**
 * 몸통 색을 정한다.
 *
 * 눈 주변에서 표본을 집었더니 80px 짜리 아기에서 음영 픽셀이 잡혀 눈 자리가
 * 보라색 사각형이 됐다. 스프라이트에서 **가장 많이 쓰인 색**(외곽선·흰자 제외)을
 * 쓰면 크기와 무관하게 몸통 색이 나온다.
 */
function dominantBodyColor() {
  const counts = new Map()
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isOpaque(x, y) || isDark(x, y) || isLight(x, y)) continue
      const i = at(x, y)
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let best = null
  let bestCount = 0
  for (const [key, n] of counts) {
    if (n > bestCount) {
      bestCount = n
      best = key
    }
  }
  if (!best) fail('몸통 색을 찾지 못했다', null, '스프라이트를 확인하라.')
  return best.split(',').map(Number)
}

const BODY = dominantBodyColor()

function clone() {
  const copy = new PNG({ width: W, height: H })
  copy.data.set(data)
  return copy
}

const paint = (target, x, y, [r, g, b]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = at(x, y)
  target.data[i] = r
  target.data[i + 1] = g
  target.data[i + 2] = b
  target.data[i + 3] = 255
}

const wipe = (target, box, extra = 0) => {
  for (let y = box.minY - extra; y <= box.maxY + extra; y++) {
    for (let x = box.minX - extra; x <= box.maxX + extra; x++) {
      if (!isOpaque(x, y)) continue
      paint(target, x, y, BODY)
    }
  }
}

// ── 눈 감음 ──────────────────────────────────────────────────────────────────
// 흰자와 동공을 몸통 색으로 지우고 가로선 하나를 긋는다. 선 두께는 1px 이다 —
// 도트에서 감은 눈은 선 하나로 읽히고, 두 줄이면 찡그린 얼굴이 된다.
const blink = clone()
for (const eye of whites) {
  wipe(blink, eye, 1)
  const y = Math.round((eye.minY + eye.maxY) / 2)
  for (let x = eye.minX; x <= eye.maxX; x++) paint(blink, x, y, [DR, DG, DB])
}
writeFileSync(`${outPrefix}-blink.png`, PNG.sync.write(blink))

// ── 처진 눈썹 ────────────────────────────────────────────────────────────────
// 눈은 그대로 두고 위에 짧은 사선을 얹는다. 바깥쪽이 낮아야 처져 보인다 —
// 반대로 그으면 화난 얼굴이 된다.
const sad = clone()
whites.forEach((eye, index) => {
  const outerLeft = index === 0
  const len = Math.max(3, Math.round((eye.maxX - eye.minX + 1) * 0.9))
  const top = eye.minY - 3
  for (let i = 0; i < len; i++) {
    // i 는 바깥에서 안쪽으로 간다. **바깥쪽이 아래(y 가 큼)** 여야 처져 보인다.
    // 반대로 그으면 눈썹이 안쪽으로 내려오는 화난 얼굴이 된다.
    const t = len === 1 ? 0 : i / (len - 1)
    const x = outerLeft ? eye.minX + i : eye.maxX - i
    const y = top + Math.round((1 - t) * 2)
    if (isOpaque(x, y) && !isDark(x, y)) paint(sad, x, y, [DR, DG, DB])
  }
})
writeFileSync(`${outPrefix}-sad.png`, PNG.sync.write(sad))

// ── 입 벌림 ──────────────────────────────────────────────────────────────────
// 입 자리를 지우고 타원을 채운다. 먹는 동작에서 한 프레임만 바뀌어도 "먹었다"가
// 읽힌다.
const open = clone()
wipe(open, mouth, 1)
const cx = (mouth.minX + mouth.maxX) / 2
const cy = (mouth.minY + mouth.maxY) / 2
const rx = Math.max(2, (mouth.maxX - mouth.minX + 1) / 2)
const ry = Math.max(2, rx * 0.8)
for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const nx = (x - cx) / rx
    const ny = (y - cy) / ry
    if (nx * nx + ny * ny > 1) continue
    if (!isOpaque(x, y)) continue
    paint(open, x, y, [DR, DG, DB])
  }
}
writeFileSync(`${outPrefix}-open.png`, PNG.sync.write(open))

console.log(
  `${input} → ${outPrefix}-{blink,sad,open}.png` +
    (reference ? ` | 위치는 ${reference} 기준 ×${ratio.toFixed(2)}` : ' | 자기 자신에서 검출'),
)
