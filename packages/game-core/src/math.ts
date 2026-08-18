export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

/** 라디안 각도를 -PI ~ PI 범위로 정규화한다. */
export function normalizeAngle(radians: number): number {
  const twoPi = Math.PI * 2
  let a = radians % twoPi
  if (a > Math.PI) a -= twoPi
  if (a < -Math.PI) a += twoPi
  return a
}
