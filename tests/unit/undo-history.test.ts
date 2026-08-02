import { describe, it, expect } from 'vitest'

function snapshotSize(anns: any[]): number {
  let n = 0
  for (const a of anns) {
    if (a.type === 'pen') n += (a.path ?? []).length
    else n += 1
  }
  return n
}

function downsamplePenStrokesInPlace(anns: any[], perStrokeMax: number): void {
  for (const a of anns) {
    if (a.type === 'pen' && a.path && a.path.length > perStrokeMax) {
      const stride = Math.ceil(a.path.length / perStrokeMax)
      a.path = a.path.filter((_: unknown, i: number) => i % stride === 0)
    }
  }
}

function pushWithCap<T>(stack: T[], item: T, cap: number): void {
  stack.push(item)
  while (stack.length > cap) stack.shift()
}

describe('undoHistory helpers', () => {
  it('snapshotSize counts pen points as N, others as 1', () => {
    expect(snapshotSize([{ type: 'pen', path: new Array(10).fill({ x: 0, y: 0 }) }])).toBe(10)
    expect(snapshotSize([{ type: 'box' }, { type: 'arrow' }])).toBe(2)
  })

  it('downsamplePenStrokesInPlace leaves small strokes alone', () => {
    const a = { type: 'pen', path: new Array(50).fill({ x: 0, y: 0 }) }
    downsamplePenStrokesInPlace([a], 1000)
    expect(a.path.length).toBe(50)
  })

  it('downsamplePenStrokesInPlace decimates huge strokes', () => {
    const a = { type: 'pen', path: new Array(5000).fill(0).map((_, i) => ({ x: i, y: i })) }
    downsamplePenStrokesInPlace([a], 100)
    expect(a.path.length).toBeLessThanOrEqual(101)
    expect(a.path.length).toBeGreaterThan(0)
  })

  it('pushWithCap evicts oldest when over cap', () => {
    const stack: number[] = []
    pushWithCap(stack, 1, 3)
    pushWithCap(stack, 2, 3)
    pushWithCap(stack, 3, 3)
    pushWithCap(stack, 4, 3)
    pushWithCap(stack, 5, 3)
    expect(stack).toEqual([3, 4, 5])
  })

  it('pushWithCap with 100-deep cap holds up to 100 entries', () => {
    const stack: number[] = []
    for (let i = 0; i < 250; i++) pushWithCap(stack, i, 100)
    expect(stack.length).toBe(100)
    expect(stack[0]).toBe(150)
    expect(stack[99]).toBe(249)
  })
})
