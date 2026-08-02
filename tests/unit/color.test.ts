import { describe, expect, it } from 'vitest'
import {
  hsvaToRgba,
  rgbaToHsva,
  rgbaToHex,
  parseHexColor,
  parseColorString,
  hsvaToCss,
} from '~/utils/color'

describe('color utilities', () => {
  it('hsvaToRgba round-trips pure red', () => {
    expect(hsvaToRgba(0, 1, 1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('rgbaToHsva then hsvaToRgba is identity on opaque colors', () => {
    for (const [r, g, b] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 200, 50]] as const) {
      const hsva = rgbaToHsva(r, g, b, 1)
      expect(hsvaToRgba(hsva.h, hsva.s, hsva.v, hsva.a)).toEqual({ r, g, b, a: 1 })
    }
  })

  it('rgbaToHex omits alpha when fully opaque, includes when not', () => {
    expect(rgbaToHex(255, 0, 0, 1)).toBe('#ff0000')
    expect(rgbaToHex(255, 0, 0, 0.5)).toBe('#ff000080')
  })

  it('parseHexColor accepts 3-digit shorthand', () => {
    expect(parseHexColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('hsvaToCss returns rgba(...) when alpha < 1', () => {
    expect(hsvaToCss({ h: 0, s: 1, v: 1, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('parseColorString returns null on garbage', () => {
    expect(parseColorString('not-a-color')).toBeNull()
  })
})
