import { describe, it, expect } from 'vitest'

describe('autosave generation contract', () => {
  it('an invalidation cancels a pending save without writing', () => {
    let generation = 0
    let saved = false

    function scheduleSave() {
      const myGen = generation
      setTimeout(() => {
        if (myGen !== generation) return
        saved = true
      }, 0)
    }

    scheduleSave()
    generation++

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(saved).toBe(false)
        resolve()
      }, 10)
    })
  })

  it('a non-invalidated save still writes after the timer fires', () => {
    const generation = 0
    let saved = false

    function scheduleSave() {
      const myGen = generation
      setTimeout(() => {
        if (myGen !== generation) return
        saved = true
      }, 0)
    }

    scheduleSave()

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(saved).toBe(true)
        resolve()
      }, 10)
    })
  })
})
