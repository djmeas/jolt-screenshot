import { describe, expect, it } from 'vitest'
import { assignSequenceNumbers } from '~/utils/sequence'

type AnyAnn = { type: string }

const seq = (): AnyAnn => ({ type: 'sequence', x: 0, y: 0, radius: 28 })

describe('assignSequenceNumbers', () => {
  it('assigns contiguous 1..N in array order, treating other types as gaps', () => {
    const anns: AnyAnn[] = [{ type: 'box' }, seq(), { type: 'text' }, seq(), seq()]
    expect([...assignSequenceNumbers(anns).entries()]).toEqual([[1, 1], [3, 2], [4, 3]])
  })

  it('returns an empty map when there are no sequence annotations', () => {
    expect(assignSequenceNumbers([{ type: 'box' }, { type: 'pen', path: [] }]).size).toBe(0)
  })

  it('renumbers contiguously after deleting the middle of 1..5 → 1..4', () => {
    const anns: AnyAnn[] = [seq(), seq(), seq(), seq(), seq()]
    const withoutThird = anns.filter((_, i) => i !== 2)
    expect([...assignSequenceNumbers(withoutThird).values()]).toEqual([1, 2, 3, 4])
  })

  it('renumbers after deleting the first: former 2nd becomes 1st', () => {
    const anns: AnyAnn[] = [seq(), seq()]
    const withoutFirst = anns.filter((_, i) => i !== 0)
    expect([...assignSequenceNumbers(withoutFirst).values()]).toEqual([1])
  })

  it('gives an appended sequence annotation the next number (placement memory)', () => {
    const anns: AnyAnn[] = [seq(), seq(), seq()]
    const withNew = [...anns, seq()]
    expect(assignSequenceNumbers(withNew).get(withNew.length - 1)).toBe(4)
  })

  it('ignores a leading non-sequence annotation before numbering', () => {
    const anns: AnyAnn[] = [{ type: 'pen', path: [] }, { type: 'box' }, seq()]
    expect(assignSequenceNumbers(anns).get(2)).toBe(1)
  })
})
