#!/usr/bin/env node
// 여러 물건이 한 장에 그려진 시트를 물건별 PNG 로 쪼갠다.
//
// 왜 시트로 뽑는가: 누끼(배경 제거)가 생성보다 6배 비싸다 — 생성 0.15 크레딧,
// 누끼 1.0 크레딧. 아이템 12개를 한 장씩 뽑으면 13.8 크레딧이지만, 한 장에
// 12개를 그려 누끼를 한 번만 따면 1.15 로 끝난다. 덤으로 같은 이미지에서 나온
// 것들이라 스타일이 더 일관된다. 근거는 docs/PET_TOWN_SPEC.md §12.8.
//
// 격자로 자르지 않는 이유: 생성 모델은 격자를 정확히 지키지 않는다. 알파가
// 이어진 덩어리(연결 성분)를 찾아 그 경계 상자로 자른다.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { PNG } from 'pngjs'

function fail(what, why, how) {
  console.error(`\n[slice] 실패: ${what}`)
  if (why) console.error(`  원인: ${why}`)
  if (how) console.error(`  조치: ${how}`)
  console.error('')
  process.exit(1)
}

const USAGE = `사용법:
  node tools/slice.mjs --in <시트.png> --outdir <폴더>
    [--names <이름,이름,...>]  읽는 순서(위→아래, 왼→오른)대로 파일 이름을 붙인다
    [--prefix <문자열>]        --names 가 없을 때 <prefix>-01.png 로 저장
    [--drop-background <n>]    테두리에서 번져 나가며 배경을 지운다. n 은 허용 색차(기본 30)
    [--min-area <n>]           이보다 작은 덩어리는 부스러기로 보고 버린다. 기본 400
    [--pad <n>]                결과 캔버스 사방 여백(px). 기본 8
    [--tight]                  덩어리마다 제 크기로 자른다(상대 크기가 사라진다)
    [--dry-run]                파일을 쓰지 않고 무엇을 찾았는지만 보고한다`

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

function decode(path) {
  if (!existsSync(path)) fail('입력 파일이 없다', path, '경로를 확인하라.')
  const png = PNG.sync.read(readFileSync(path))
  if (png.data.length !== png.width * png.height * 4) {
    fail('디코드 결과가 RGBA8 이 아니다', `data ${png.data.length}`, '8비트 RGBA PNG 로 내보내라.')
  }
  return png
}

/**
 * 테두리에서 번져 나가며 배경을 지운다.
 *
 * 유료 누끼 도구를 쓰지 않아도 되는 경우가 있다. 시트를 뽑아 보니 배경이 아주
 * 평평했다(테두리 최대 채널 편차 8). 그런 그림에서는 이걸로 충분하고, 누끼
 * 1회가 생성 6~7장 값이므로 아끼는 폭이 크다.
 *
 * **고정색 크로마키가 아니라 테두리에서 번지는 방식이다.** 색만 보고 지우면
 * 물건 안쪽의 배경과 비슷한 색(우유갑의 옅은 하늘색 같은)에 구멍이 뚫린다.
 * 테두리에서 이어진 픽셀만 지우면 굵은 외곽선이 벽 역할을 해서 안쪽이 지켜진다.
 *
 * 배경이 그라데이션이면 이 방법도 실패한다. 그때는 누끼 도구를 쓴다(§12.5).
 */
function dropBackground(png, tolerance) {
  const { width: w, height: h, data } = png

  // 기준색은 테두리의 최빈색이다. 한 점만 찍으면 그 점이 노이즈일 때 전부 어긋난다.
  const counts = new Map()
  const keyAt = (x, y) => {
    const i = (w * y + x) << 2
    return `${data[i]},${data[i + 1]},${data[i + 2]}`
  }
  for (let x = 0; x < w; x++) {
    counts.set(keyAt(x, 0), (counts.get(keyAt(x, 0)) ?? 0) + 1)
    counts.set(keyAt(x, h - 1), (counts.get(keyAt(x, h - 1)) ?? 0) + 1)
  }
  for (let y = 0; y < h; y++) {
    counts.set(keyAt(0, y), (counts.get(keyAt(0, y)) ?? 0) + 1)
    counts.set(keyAt(w - 1, y), (counts.get(keyAt(w - 1, y)) ?? 0) + 1)
  }
  let modal = null
  let best = 0
  for (const [k, n] of counts) {
    if (n > best) {
      best = n
      modal = k
    }
  }
  const [br, bg, bb] = modal.split(',').map(Number)

  const near = (i) =>
    Math.max(Math.abs(data[i] - br), Math.abs(data[i + 1] - bg), Math.abs(data[i + 2] - bb)) <=
    tolerance

  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let top = 0
  const push = (x, y) => {
    const p = w * y + x
    if (seen[p]) return
    if (!near(p << 2)) return
    seen[p] = 1
    stack[top++] = p
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }

  let cleared = 0
  while (top > 0) {
    const p = stack[--top]
    const x = p % w
    const y = (p / w) | 0
    data[(p << 2) + 3] = 0
    cleared++
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }

  return { cleared, modal, ratio: cleared / (w * h) }
}

/**
 * 알파가 이어진 덩어리를 모두 찾는다.
 *
 * 8-이웃으로 잇는다. 4-이웃만 쓰면 대각선으로만 닿은 획(사과 꼭지 같은 것)이
 * 별개 덩어리로 떨어져 나온다.
 *
 * 재귀 대신 명시적 스택을 쓴다. 2048² 짜리 시트에서 한 덩어리가 수십만 픽셀이라
 * 재귀로 하면 콜스택이 넘친다.
 */
function findComponents(png, alphaMin) {
  const { width: w, height: h, data } = png
  const label = new Int32Array(w * h).fill(-1)
  const stack = new Int32Array(w * h)
  const components = []

  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1) continue
    if (data[(start << 2) + 3] < alphaMin) continue

    const id = components.length
    let top = 0
    stack[top++] = start
    label[start] = id

    let minX = w
    let minY = h
    let maxX = -1
    let maxY = -1
    let area = 0

    while (top > 0) {
      const p = stack[--top]
      const x = p % w
      const y = (p / w) | 0
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const q = w * ny + nx
          if (label[q] !== -1) continue
          if (data[(q << 2) + 3] < alphaMin) continue
          label[q] = id
          stack[top++] = q
        }
      }
    }

    components.push({ id, minX, minY, maxX, maxY, area })
  }

  return { label, components }
}

/**
 * 읽는 순서(위→아래, 왼→오른)로 정렬한다.
 *
 * y 로만 정렬하면 같은 줄에 있는 것들이 몇 픽셀 차이로 뒤섞인다. 그래서 세로
 * 중심이 가까운 것들을 한 줄로 묶고, 줄 안에서만 x 로 정렬한다. 묶는 기준을
 * 덩어리 높이의 중앙값에 걸어 두면 크기가 제각각인 시트에서도 버틴다.
 */
function readingOrder(components) {
  if (components.length === 0) return []

  const heights = components.map((c) => c.maxY - c.minY + 1).sort((a, b) => a - b)
  const medianHeight = heights[heights.length >> 1]
  const bandTolerance = medianHeight * 0.6

  const byY = [...components].sort((a, b) => centerY(a) - centerY(b))
  const bands = []
  let band = [byY[0]]
  let bandTop = centerY(byY[0])

  for (const c of byY.slice(1)) {
    if (centerY(c) - bandTop > bandTolerance) {
      bands.push(band)
      band = []
      bandTop = centerY(c)
    }
    band.push(c)
  }
  bands.push(band)

  return bands.flatMap((row) => row.sort((a, b) => centerX(a) - centerX(b)))
}

const centerX = (c) => (c.minX + c.maxX) / 2
const centerY = (c) => (c.minY + c.maxY) / 2

/**
 * 덩어리 하나를 정사각 캔버스에 옮겨 담는다.
 *
 * **자기 덩어리에 속한 픽셀만 복사한다.** 경계 상자를 통째로 잘라내면 옆 물건이
 * 상자 안으로 삐져 들어왔을 때 그 조각까지 따라온다.
 *
 * 캔버스 크기를 모든 덩어리에 대해 같게 잡는 이유는 **상대 크기를 지키기
 * 위해서다.** 각자 제 경계 상자로 자른 뒤 전부 48×48 로 줄이면 사과와 케이크가
 * 같은 크기가 된다. 같은 캔버스에 담아 두면 뒤에서 같은 배율이 걸린다.
 */
function extract(png, label, component, canvasSide, pad) {
  const out = new PNG({ width: canvasSide, height: canvasSide })
  const boxW = component.maxX - component.minX + 1
  const boxH = component.maxY - component.minY + 1
  const offsetX = Math.round((canvasSide - boxW) / 2)
  const offsetY = Math.round((canvasSide - boxH) / 2)

  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const sx = component.minX + x
      const sy = component.minY + y
      if (label[png.width * sy + sx] !== component.id) continue
      const si = (png.width * sy + sx) << 2
      const dx = offsetX + x
      const dy = offsetY + y
      if (dx < 0 || dy < 0 || dx >= canvasSide || dy >= canvasSide) continue
      const di = (canvasSide * dy + dx) << 2
      out.data[di] = png.data[si]
      out.data[di + 1] = png.data[si + 1]
      out.data[di + 2] = png.data[si + 2]
      out.data[di + 3] = png.data[si + 3]
    }
  }

  void pad
  return out
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || opts.h) {
    console.log(USAGE)
    return
  }
  if (typeof opts.in !== 'string') fail('--in 이 없다', null, USAGE)
  if (typeof opts.outdir !== 'string' && !opts['dry-run']) fail('--outdir 이 없다', null, USAGE)

  const minArea = opts['min-area'] === undefined ? 400 : Number(opts['min-area'])
  if (!Number.isFinite(minArea) || minArea < 0) {
    fail('--min-area 가 숫자가 아니다', String(opts['min-area']), USAGE)
  }
  const pad = opts.pad === undefined ? 8 : Number(opts.pad)
  if (!Number.isInteger(pad) || pad < 0)
    fail('--pad 가 0 이상의 정수가 아니다', String(opts.pad), USAGE)

  const png = decode(opts.in)

  if (opts['drop-background'] !== undefined) {
    const tolerance = opts['drop-background'] === true ? 30 : Number(opts['drop-background'])
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      fail('--drop-background 가 숫자가 아니다', String(opts['drop-background']), USAGE)
    }
    const r = dropBackground(png, tolerance)
    console.log(
      `  배경 제거: 기준색 ${r.modal}, 허용 ${tolerance}, ${(r.ratio * 100).toFixed(1)}% 지움`,
    )
    // 거의 안 지웠거나 거의 다 지웠으면 기준색이나 허용치가 틀린 것이다.
    if (r.ratio < 0.1) {
      fail(
        '배경이 거의 지워지지 않았다',
        `${(r.ratio * 100).toFixed(1)}% 만 지웠다`,
        '--drop-background 값을 올리거나, 배경이 그라데이션이면 누끼 도구를 써라.',
      )
    }
    if (r.ratio > 0.97) {
      fail(
        '배경 말고 물건까지 지운 것으로 보인다',
        `${(r.ratio * 100).toFixed(1)}% 를 지웠다`,
        '--drop-background 값을 낮춰라.',
      )
    }
  }

  // 알파가 전부 불투명이면 누끼를 빠뜨린 것이다. 그대로 진행하면 시트 전체가
  // 덩어리 하나로 잡혀 아무것도 쪼개지지 않는다.
  let opaqueEverywhere = true
  for (let i = 3; i < png.data.length && opaqueEverywhere; i += 4) {
    if (png.data[i] !== 255) opaqueEverywhere = false
  }
  if (opaqueEverywhere) {
    fail(
      '시트에 투명 픽셀이 없다',
      '배경이 제거되지 않은 것으로 보인다',
      '누끼 도구로 배경을 먼저 제거하라. 이 스크립트는 알파로 물건을 구분한다.',
    )
  }

  const { label, components } = findComponents(png, 128)
  const kept = components.filter((c) => c.area >= minArea)
  const dropped = components.length - kept.length
  const ordered = readingOrder(kept)

  console.log(`${basename(opts.in)} ${png.width}x${png.height}`)
  console.log(
    `  덩어리 ${components.length}개 중 ${ordered.length}개 채택 (부스러기 ${dropped}개 버림)`,
  )

  if (ordered.length === 0) {
    fail(
      '쓸 만한 덩어리를 찾지 못했다',
      `--min-area ${minArea} 보다 큰 덩어리가 없다`,
      '--min-area 를 낮추거나 시트가 제대로 누끼되었는지 확인하라.',
    )
  }

  const names =
    typeof opts.names === 'string'
      ? opts.names
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
      : null

  if (names && names.length !== ordered.length) {
    // 조용히 앞에서부터 붙이면 이름과 그림이 어긋난 채로 12개가 저장된다.
    // 그 어긋남은 게임에 넣고 나서야 눈에 띈다.
    console.error('')
    console.error('[slice] 찾은 덩어리:')
    ordered.forEach((c, i) => {
      const w = c.maxX - c.minX + 1
      const h = c.maxY - c.minY + 1
      console.error(`  ${i + 1}. ${w}x${h} at (${c.minX},${c.minY}) 면적 ${c.area}`)
    })
    fail(
      '이름 개수와 찾은 덩어리 수가 다르다',
      `이름 ${names.length}개, 덩어리 ${ordered.length}개`,
      '위 목록을 보고 --min-area 를 조정하거나(붙어 버린 물건이 있으면 시트를 다시 뽑는다) --names 를 맞춰라.',
    )
  }

  const maxSide = ordered.reduce((m, c) => Math.max(m, c.maxX - c.minX + 1, c.maxY - c.minY + 1), 0)
  const canvasSide = opts.tight ? 0 : maxSide + pad * 2

  if (opts['dry-run']) {
    ordered.forEach((c, i) => {
      const w = c.maxX - c.minX + 1
      const h = c.maxY - c.minY + 1
      const name = names ? names[i] : `${opts.prefix ?? 'part'}-${String(i + 1).padStart(2, '0')}`
      console.log(`  ${name}: ${w}x${h} at (${c.minX},${c.minY}) 면적 ${c.area}`)
    })
    console.log(`  공통 캔버스 ${canvasSide}x${canvasSide} (--tight 면 각자 크기)`)
    return
  }

  mkdirSync(opts.outdir, { recursive: true })

  ordered.forEach((c, i) => {
    const boxW = c.maxX - c.minX + 1
    const boxH = c.maxY - c.minY + 1
    const side = opts.tight ? Math.max(boxW, boxH) + pad * 2 : canvasSide
    const name = names ? names[i] : `${opts.prefix ?? 'part'}-${String(i + 1).padStart(2, '0')}`
    const out = extract(png, label, c, side, pad)
    const path = join(opts.outdir, `${name}.png`)
    writeFileSync(path, PNG.sync.write(out))
    console.log(`  ${path} ${side}x${side} (원본 ${boxW}x${boxH})`)
  })

  if (!opts.tight) {
    console.log(`  공통 캔버스 ${canvasSide}x${canvasSide} — 상대 크기가 유지된다`)
  }
}

main()
