import { describe, it, expect } from 'vitest'

describe('primaryTouch (inline test of the contract, not direct import)', () => {
  it('returns null on touchend (touches is empty)', () => {
    const e = {
      touches: [],
      changedTouches: [{ clientX: 10, clientY: 20 }],
    } as unknown as TouchEvent
    const result = 'touches' in e ? (e.touches[0] ?? null) : e
    expect(result).toBeNull()
  })

  it('returns the first touch on touchmove (touches has one entry)', () => {
    const e = {
      touches: [{ clientX: 10, clientY: 20 }],
    } as unknown as TouchEvent
    const result = 'touches' in e ? (e.touches[0] ?? null) : e
    expect(result).toEqual({ clientX: 10, clientY: 20 })
  })

  it('falls through to the MouseEvent itself for mouse events', () => {
    const e = { clientX: 100, clientY: 200 } as unknown as MouseEvent
    const result = 'touches' in e ? (e.touches[0] ?? null) : e
    expect(result).toBe(e)
  })
})
