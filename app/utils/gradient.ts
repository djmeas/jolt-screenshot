export type GradientBorder = {
  from: string
  to: string
  angle: number
}

export const BORDER_THICKNESS_MIN = 2
export const BORDER_THICKNESS_MAX = 24
export const BORDER_THICKNESS_DEFAULT = 12

export function clampBorderThickness(value: number): number {
  if (!Number.isFinite(value)) return BORDER_THICKNESS_DEFAULT
  return Math.min(BORDER_THICKNESS_MAX, Math.max(BORDER_THICKNESS_MIN, Math.round(value)))
}

export function borderRadiusFor(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0
  return Math.min(32, Math.max(6, Math.round(Math.min(width, height) * 0.025)))
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function generateRandomGradient(rand: () => number = Math.random): GradientBorder {
  const baseHue = rand() * 360
  const hueShift = 40 + rand() * 100
  const direction = rand() < 0.5 ? -1 : 1
  const from = hslToHex(baseHue, 0.7 + rand() * 0.25, 0.55 + rand() * 0.15)
  const to = hslToHex(baseHue + direction * hueShift, 0.7 + rand() * 0.25, 0.5 + rand() * 0.2)
  const angle = Math.floor(rand() * 360)
  return { from, to, angle }
}

export function gradientCss(gradient: GradientBorder): string {
  return `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})`
}

export function gradientEndpoints(width: number, height: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const halfLen = (Math.abs(width * dx) + Math.abs(height * dy)) / 2
  const cx = width / 2
  const cy = height / 2
  return {
    x0: cx - dx * halfLen,
    y0: cy - dy * halfLen,
    x1: cx + dx * halfLen,
    y1: cy + dy * halfLen,
  }
}

export function fillWithGradient(ctx: CanvasRenderingContext2D, width: number, height: number, gradient: GradientBorder) {
  const { x0, y0, x1, y1 } = gradientEndpoints(width, height, gradient.angle)
  const lg = ctx.createLinearGradient(x0, y0, x1, y1)
  lg.addColorStop(0, gradient.from)
  lg.addColorStop(1, gradient.to)
  ctx.fillStyle = lg
  ctx.fillRect(0, 0, width, height)
}

export function compositeWithBorder(source: HTMLCanvasElement, gradient: GradientBorder, thickness: number): HTMLCanvasElement {
  const t = clampBorderThickness(thickness)
  const out = document.createElement('canvas')
  out.width = source.width + 2 * t
  out.height = source.height + 2 * t
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('no-2d-context')
  const radius = borderRadiusFor(source.width, source.height)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, out.width, out.height, radius + t)
  ctx.clip()
  fillWithGradient(ctx, out.width, out.height, gradient)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(t, t, source.width, source.height, radius)
  ctx.clip()
  ctx.drawImage(source, t, t)
  ctx.restore()
  return out
}
