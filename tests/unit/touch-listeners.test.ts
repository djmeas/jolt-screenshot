import { describe, it, expect, vi } from 'vitest'

describe('canvas touch listener passive flag', () => {
  it('attaches touchstart/touchmove/touchend with passive=false', () => {
    const target = document.createElement('canvas')
    document.body.appendChild(target)
    const addSpy = vi.spyOn(target, 'addEventListener')

    target.addEventListener('touchstart', () => {}, { passive: false })
    target.addEventListener('touchmove', () => {}, { passive: false })
    target.addEventListener('touchend', () => {}, { passive: false })

    expect(addSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), expect.objectContaining({ passive: false }))
    expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), expect.objectContaining({ passive: false }))
    expect(addSpy).toHaveBeenCalledWith('touchend', expect.any(Function), expect.objectContaining({ passive: false }))

    addSpy.mockRestore()
    document.body.removeChild(target)
  })
})
