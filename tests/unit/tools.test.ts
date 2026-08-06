import { describe, expect, it } from 'vitest'
import { buildToolShortcuts, TOOLS } from '~/utils/tools'

describe('TOOLS', () => {
  it('is ordered so the first entry is the default hotkey (1)', () => {
    expect(TOOLS[0]!.mode).toBe('pen')
  })

  it('keeps unique tool modes', () => {
    const modes = TOOLS.map(t => t.mode)
    expect(new Set(modes).size).toBe(modes.length)
  })
})

describe('buildToolShortcuts', () => {
  it('assigns 1..N in order to the given tools', () => {
    expect(buildToolShortcuts(['pen', 'arrow', 'box'])).toEqual({
      '1': 'pen',
      '2': 'arrow',
      '3': 'box',
    })
  })

  it('returns an empty map when given no tools', () => {
    expect(buildToolShortcuts([])).toEqual({})
  })

  it('reflects the current TOOLS list (1..len) without gaps', () => {
    const map = buildToolShortcuts(TOOLS.map(t => t.mode))
    for (let i = 0; i < TOOLS.length; i++) {
      expect(map[String(i + 1)]).toBe(TOOLS[i]!.mode)
    }
    expect(Object.keys(map)).toHaveLength(TOOLS.length)
  })
})
