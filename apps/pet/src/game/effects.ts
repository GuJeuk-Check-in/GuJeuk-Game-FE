// 돌봄 반응에 붙는 파티클.
//
// 씻기면 거품이 오르고 쓰다듬으면 하트가 뜬다. 예전에는 펫이 한 번 튀고 토스트가
// 뜨는 것이 전부라, 무엇을 했는지가 **글자로만** 남았다. 육성 게임에서 제일 자주
// 하는 행동일수록 그 순간이 눈에 보여야 한다.
//
// **그림 파일을 쓰지 않는다.** 도형 몇 개면 되는 것에 에셋을 늘리면 팔레트 양자화
// 파이프라인(tools/pixelize.mjs)을 한 번 더 돌려야 하고, 거품 하나 크기를 바꿀
// 때마다 그 과정을 반복하게 된다. 색은 팔레트에서만 집는다.
//
// 좌표는 논리 좌표(360×640)다. 캔버스 배율과 레터박스는 PetGame 이 이미 걸어
// 두었으므로 여기서는 신경 쓰지 않는다.

import { paletteCss } from './palette'

export type ParticleKind = 'bubble' | 'heart' | 'crumb' | 'sparkle' | 'zzz'

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  ageSec: number
  lifeSec: number
  size: number
  /** 좌우로 흔들리는 위상. 거품이 일직선으로 오르면 기계처럼 보인다. */
  phase: number
}

/**
 * 화면에 동시에 둘 수 있는 최대 개수.
 *
 * 문지르는 동안 계속 뿜기 때문에 상한이 없으면 오래 문지를수록 프레임이 떨어진다.
 * 넘치면 **가장 오래된 것부터** 버린다 — 새로 뿜은 것이 사라지면 손끝에 반응이
 * 없는 것처럼 느껴진다.
 */
export const MAX_PARTICLES = 60

/** 중력을 받는 것은 부스러기뿐이다. 나머지는 뜨거나 흩어진다. */
const GRAVITY: Partial<Record<ParticleKind, number>> = { crumb: 320 }

const COLOR: Record<ParticleKind, string> = {
  bubble: paletteCss('accce4'),
  heart: paletteCss('feaae4'),
  crumb: paletteCss('dea38b'),
  sparkle: paletteCss('fff7a0'),
  zzz: paletteCss('6c5671'),
}

const OUTLINE = paletteCss('28282e')
const HIGHLIGHT = paletteCss('fff7e4')

interface Spec {
  lifeSec: [number, number]
  size: [number, number]
  vx: [number, number]
  vy: [number, number]
  /** 좌우 흔들림의 폭(px). 0 이면 흔들리지 않는다. */
  sway: number
}

const SPEC: Record<ParticleKind, Spec> = {
  bubble: { lifeSec: [0.9, 1.5], size: [3, 7], vx: [-10, 10], vy: [-46, -22], sway: 9 },
  heart: { lifeSec: [0.8, 1.2], size: [7, 11], vx: [-18, 18], vy: [-58, -34], sway: 5 },
  crumb: { lifeSec: [0.5, 0.8], size: [2, 4], vx: [-52, 52], vy: [-70, -30], sway: 0 },
  sparkle: { lifeSec: [0.4, 0.7], size: [3, 6], vx: [-70, 70], vy: [-70, 10], sway: 0 },
  zzz: { lifeSec: [1.4, 1.9], size: [8, 13], vx: [6, 16], vy: [-24, -14], sway: 4 },
}

function between([min, max]: [number, number], random: () => number): number {
  return min + (max - min) * random()
}

/** 파티클 하나를 만든다. 난수를 주입받아 테스트가 결과를 못 박을 수 있게 한다. */
export function spawn(
  kind: ParticleKind,
  x: number,
  y: number,
  random: () => number = Math.random,
): Particle {
  const spec = SPEC[kind]

  return {
    kind,
    x,
    y,
    vx: between(spec.vx, random),
    vy: between(spec.vy, random),
    ageSec: 0,
    lifeSec: between(spec.lifeSec, random),
    size: between(spec.size, random),
    phase: random() * Math.PI * 2,
  }
}

/**
 * 한 프레임 굴린다. 수명이 다한 것은 빠진 새 배열을 돌려준다.
 *
 * 입력을 변형하지 않는 것은 이 파일의 다른 모듈들과 같은 이유다 — 렌더 도중
 * 배열이 바뀌면 그 프레임에 그린 것과 다음 프레임의 상태가 어긋난다.
 */
export function step(particles: readonly Particle[], dtSec: number): Particle[] {
  const next: Particle[] = []

  for (const p of particles) {
    const ageSec = p.ageSec + dtSec
    if (ageSec >= p.lifeSec) continue

    const gravity = GRAVITY[p.kind] ?? 0
    const vy = p.vy + gravity * dtSec

    next.push({ ...p, ageSec, vy, x: p.x + p.vx * dtSec, y: p.y + vy * dtSec })
  }

  return next
}

/** 넘치면 오래된 것부터 버린다. */
export function trim(particles: readonly Particle[]): Particle[] {
  if (particles.length <= MAX_PARTICLES) return [...particles]
  return particles.slice(particles.length - MAX_PARTICLES)
}

/** 수명의 마지막 구간에서 서서히 사라진다. 갑자기 없어지면 깜빡인 것처럼 보인다. */
function alphaOf(p: Particle): number {
  const t = p.ageSec / p.lifeSec
  const FADE_FROM = 0.65
  if (t <= FADE_FROM) return 1
  return Math.max(0, 1 - (t - FADE_FROM) / (1 - FADE_FROM))
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const r = size / 4
  ctx.beginPath()
  ctx.arc(x - r, y - r, r, 0, Math.PI * 2)
  ctx.arc(x + r, y - r, r, 0, Math.PI * 2)
  ctx.fill()
  // 아래쪽 삼각형. 두 원과 겹쳐 하트 모양이 된다.
  ctx.beginPath()
  ctx.moveTo(x - size / 2, y - r)
  ctx.lineTo(x + size / 2, y - r)
  ctx.lineTo(x, y + size / 2)
  ctx.closePath()
  ctx.fill()
}

/** z 를 획 세 개로 그린다. 글꼴을 쓰면 도트 화면에서 혼자 매끈해 보인다. */
function drawZ(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const half = size / 2
  const thick = Math.max(1, Math.round(size / 6))
  ctx.fillRect(x - half, y - half, size, thick)
  ctx.fillRect(x - half, y + half - thick, size, thick)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.PI / 4)
  ctx.fillRect(-thick / 2, -half, thick, size)
  ctx.restore()
}

/**
 * 전부 그린다.
 *
 * `offsetX` 는 방 전환 중의 가로 이동량이다. 파티클도 방과 함께 밀려야 방을
 * 옮기는 동안 거품만 제자리에 남지 않는다.
 */
export function draw(
  ctx: CanvasRenderingContext2D,
  particles: readonly Particle[],
  offsetX: number,
): void {
  for (const p of particles) {
    const spec = SPEC[p.kind]
    const sway = spec.sway === 0 ? 0 : Math.sin(p.phase + p.ageSec * 7) * spec.sway
    const x = p.x + offsetX + sway
    const y = p.y

    ctx.save()
    ctx.globalAlpha = alphaOf(p)
    ctx.fillStyle = COLOR[p.kind]

    if (p.kind === 'bubble') {
      // 속이 빈 동그라미 + 작은 반사광. 채우면 물방울이 아니라 구슬로 보인다.
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 1
      ctx.globalAlpha = alphaOf(p) * 0.55
      ctx.beginPath()
      ctx.arc(x, y, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = alphaOf(p)
      ctx.stroke()
      ctx.fillStyle = HIGHLIGHT
      ctx.beginPath()
      ctx.arc(x - p.size * 0.3, y - p.size * 0.3, Math.max(1, p.size * 0.22), 0, Math.PI * 2)
      ctx.fill()
    } else if (p.kind === 'heart') {
      drawHeart(ctx, x, y, p.size)
    } else if (p.kind === 'zzz') {
      drawZ(ctx, x, y, p.size)
    } else if (p.kind === 'sparkle') {
      // 마름모. 별을 그리면 이 크기에서는 뭉개져 점으로 보인다.
      ctx.beginPath()
      ctx.moveTo(x, y - p.size)
      ctx.lineTo(x + p.size * 0.45, y)
      ctx.lineTo(x, y + p.size)
      ctx.lineTo(x - p.size * 0.45, y)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(p.size), Math.round(p.size))
    }

    ctx.restore()
  }
}
