import { describe, expect, it } from 'vitest'
import {
  BORDER_THICKNESS_DEFAULT,
  BORDER_THICKNESS_MAX,
  BORDER_THICKNESS_MIN,
  borderRadiusFor,
  clampBorderThickness,
  generateRandomGradient,
  gradientCss,
  gradientEndpoints,
} from '~/utils/gradient'

describe('borderRadiusFor', () => {
  it('scales with the smaller dimension', () => {
    expect(borderRadiusFor(1000, 800)).toBe(20)
  })

  it('clamps to a minimum for tiny images', () => {
    expect(borderRadiusFor(100, 100)).toBe(6)
  })

  it('clamps to a maximum for huge images', () => {
    expect(borderRadiusFor(8000, 8000)).toBe(32)
  })

  it('returns 0 for invalid dimensions', () => {
    expect(borderRadiusFor(0, 100)).toBe(0)
    expect(borderRadiusFor(-5, 100)).toBe(0)
    expect(borderRadiusFor(Number.NaN, 100)).toBe(0)
  })
})

describe('clampBorderThickness', () => {
  it('clamps below the minimum', () => {
    expect(clampBorderThickness(0)).toBe(BORDER_THICKNESS_MIN)
    expect(clampBorderThickness(-5)).toBe(BORDER_THICKNESS_MIN)
  })

  it('clamps above the maximum', () => {
    expect(clampBorderThickness(100)).toBe(BORDER_THICKNESS_MAX)
  })

  it('rounds to the nearest integer within range', () => {
    expect(clampBorderThickness(10.4)).toBe(10)
    expect(clampBorderThickness(10.6)).toBe(11)
  })

  it('falls back to the default for non-finite input', () => {
    expect(clampBorderThickness(Number.NaN)).toBe(BORDER_THICKNESS_DEFAULT)
    expect(clampBorderThickness(Number.POSITIVE_INFINITY)).toBe(BORDER_THICKNESS_DEFAULT)
  })
})

describe('generateRandomGradient', () => {
  it('produces hex colors and a degree angle', () => {
    const g = generateRandomGradient()
    expect(g.from).toMatch(/^#[0-9a-f]{6}$/)
    expect(g.to).toMatch(/^#[0-9a-f]{6}$/)
    expect(g.angle).toBeGreaterThanOrEqual(0)
    expect(g.angle).toBeLessThan(360)
    expect(Number.isInteger(g.angle)).toBe(true)
  })

  it('is deterministic with an injected random source', () => {
    const seq = [0.5, 0.5, 0.1, 0.5, 0.5, 0.5, 0.5, 0.25]
    let i = 0
    const rand = () => seq[i++ % seq.length]!
    const a = generateRandomGradient(rand)
    i = 0
    const b = generateRandomGradient(rand)
    expect(a).toEqual(b)
  })

  it('keeps hues far enough apart to read as a gradient', () => {
    const g = generateRandomGradient(() => 0.5)
    expect(g.from).not.toBe(g.to)
  })
})

describe('gradientCss', () => {
  it('formats a CSS linear-gradient', () => {
    expect(gradientCss({ from: '#ff0000', to: '#0000ff', angle: 45 }))
      .toBe('linear-gradient(45deg, #ff0000, #0000ff)')
  })
})

describe('gradientEndpoints', () => {
  it('0deg runs bottom-to-top through the center (CSS convention)', () => {
    const { x0, y0, x1, y1 } = gradientEndpoints(100, 50, 0)
    expect(x0).toBeCloseTo(50)
    expect(x1).toBeCloseTo(50)
    expect(y0).toBeCloseTo(50)
    expect(y1).toBeCloseTo(0)
  })

  it('90deg runs left-to-right', () => {
    const { x0, y0, x1, y1 } = gradientEndpoints(100, 50, 90)
    expect(x0).toBeCloseTo(0)
    expect(x1).toBeCloseTo(100)
    expect(y0).toBeCloseTo(25)
    expect(y1).toBeCloseTo(25)
  })

  it('180deg runs top-to-bottom', () => {
    const { x0, y0, x1, y1 } = gradientEndpoints(100, 50, 180)
    expect(y0).toBeCloseTo(0)
    expect(y1).toBeCloseTo(50)
  })

  it('diagonal angles span the corners of the rect', () => {
    const { x0, y0, x1, y1 } = gradientEndpoints(100, 100, 45)
    const len = Math.hypot(x1 - x0, y1 - y0)
    expect(len).toBeCloseTo(Math.hypot(100, 100))
    expect((x0 + x1) / 2).toBeCloseTo(50)
    expect((y0 + y1) / 2).toBeCloseTo(50)
  })
})
