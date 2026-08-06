import { describe, expect, it } from 'vitest'
import { exportFileName } from '~/utils/download'

describe('exportFileName', () => {
  it('slugifies the project name and appends the extension', () => {
    expect(exportFileName('My Bug Report', 'png')).toBe('my-bug-report.png')
  })

  it('strips unsafe characters', () => {
    expect(exportFileName('a/b\\c:d*e?f"g<h>i|j', 'mp4')).toBe('a-b-c-d-e-f-g-h-i-j.mp4')
  })

  it('collapses whitespace and separators', () => {
    expect(exportFileName('  weird   --  name  ', 'png')).toBe('weird-name.png')
  })

  it('falls back to a default when the name is blank', () => {
    expect(exportFileName('', 'webm')).toBe('joltshot.webm')
    expect(exportFileName('   ', 'webm')).toBe('joltshot.webm')
  })

  it('falls back when nothing slug-safe remains', () => {
    expect(exportFileName('💥💥💥', 'png')).toBe('joltshot.png')
  })
})
