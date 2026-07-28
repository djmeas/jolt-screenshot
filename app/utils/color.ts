export type Hsva = { h: number, s: number, v: number, a: number }
export type Rgba = { r: number, g: number, b: number, a: number }

export function hsvaToRgba(h: number, s: number, v: number, a: number): Rgba {
  const hue = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (hue < 60) { r = c; g = x }
  else if (hue < 120) { r = x; g = c }
  else if (hue < 180) { g = c; b = x }
  else if (hue < 240) { g = x; b = c }
  else if (hue < 300) { r = x; b = c }
  else { r = c; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a }
}

export function rgbaToHsva(r: number, g: number, b: number, a: number): Hsva {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / d + 2)
    else h = 60 * ((rn - gn) / d + 4)
  }
  if (h < 0) h += 360
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max, a }
}

export function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  const base = `#${to2(r)}${to2(g)}${to2(b)}`
  return a >= 1 ? base : `${base}${to2(a * 255)}`
}

export function parseHexColor(input: string): Rgba | null {
  let hex = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(hex)) hex = hex.split('').map(c => c + c).join('')
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 }
  }
  if (/^[0-9a-fA-F]{8}$/.test(hex)) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100 }
  }
  return null
}

export function parseColorString(input: string): Hsva | null {
  const str = input.trim()
  if (str.startsWith('#')) {
    const rgba = parseHexColor(str)
    return rgba ? rgbaToHsva(rgba.r, rgba.g, rgba.b, rgba.a) : null
  }
  const m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (m) {
    const a = m[4] === undefined ? 1 : Math.min(Math.max(parseFloat(m[4]), 0), 1)
    return rgbaToHsva(Number(m[1]), Number(m[2]), Number(m[3]), a)
  }
  return null
}

export function hsvaToCss(hsva: Hsva): string {
  const { r, g, b, a } = hsvaToRgba(hsva.h, hsva.s, hsva.v, hsva.a)
  if (a >= 1) return rgbaToHex(r, g, b, 1)
  const alpha = Math.round(a * 100) / 100
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const CHECKER_GRADIENTS = 'linear-gradient(45deg, rgba(0,0,0,0.15) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.15) 75%), linear-gradient(45deg, rgba(0,0,0,0.15) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.15) 75%)'

export function colorOverCheckerStyle(color: string): Record<string, string> {
  return {
    backgroundImage: `linear-gradient(${color}, ${color}), ${CHECKER_GRADIENTS}`,
    backgroundSize: 'auto, 8px 8px, 8px 8px',
    backgroundPosition: '0 0, 0 0, 4px 4px',
    backgroundColor: '#ffffff',
  }
}
