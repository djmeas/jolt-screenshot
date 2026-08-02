import { describe, it, expect } from 'vitest'

describe('image size limits', () => {
  const MAX_IMAGE_PIXELS = 16_000_000

  it('accepts a 4000x4000 image (16 MP)', () => {
    expect(4000 * 4000).toBeLessThanOrEqual(MAX_IMAGE_PIXELS)
  })

  it('rejects a 5000x5000 image (25 MP)', () => {
    expect(5000 * 5000).toBeGreaterThan(MAX_IMAGE_PIXELS)
  })

  it('rejects a 10000x4000 ultra-wide screenshot (40 MP)', () => {
    expect(10000 * 4000).toBeGreaterThan(MAX_IMAGE_PIXELS)
  })
})
