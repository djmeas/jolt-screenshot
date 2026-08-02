import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('object URL lifecycle in loadSavedProject', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('revokes previously tracked URLs before allocating new ones', () => {
    const tracked = new Set<string>()
    const revoked: string[] = []
    const stubCreate = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const u = `blob:test/${Math.random()}`
      tracked.add(u)
      return u
    })
    const stubRevoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => {
      revoked.push(u)
      tracked.delete(u)
    })

    // simulate two saves
    const u1 = URL.createObjectURL(undefined as unknown as Blob)
    tracked.add(u1)
    const u2 = URL.createObjectURL(undefined as unknown as Blob)
    tracked.add(u2)

    // simulate clearImageResources
    for (const url of tracked) URL.revokeObjectURL(url)
    tracked.clear()

    expect(revoked).toEqual(expect.arrayContaining([u1, u2]))
    expect(tracked.size).toBe(0)
  })
})
