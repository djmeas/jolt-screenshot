import { describe, expect, it } from 'vitest'
import {
  MAX_ANNOTATIONS_PER_SECOND,
  MIN_ANNOTATIONS_PER_SECOND,
  VIDEO_LEAD_MS,
  VIDEO_TAIL_MS,
  clampAnnotationsPerSecond,
  exportDurationMs,
  pickVideoMimeType,
  supportedVideoMimeTypes,
  visibleAnnotationCount,
} from '~/utils/video-export'

describe('clampAnnotationsPerSecond', () => {
  it('passes through an in-range rate', () => {
    expect(clampAnnotationsPerSecond(1)).toBe(1)
  })

  it('clamps below-range rates to the minimum', () => {
    expect(clampAnnotationsPerSecond(0.01)).toBe(MIN_ANNOTATIONS_PER_SECOND)
  })

  it('clamps above-range rates to the maximum', () => {
    expect(clampAnnotationsPerSecond(100)).toBe(MAX_ANNOTATIONS_PER_SECOND)
  })

  it('treats non-finite input as the default of 1', () => {
    expect(clampAnnotationsPerSecond(Number.NaN)).toBe(1)
  })
})

describe('visibleAnnotationCount', () => {
  it('shows nothing during the lead-in', () => {
    expect(visibleAnnotationCount(0, 5, 1000)).toBe(0)
    expect(visibleAnnotationCount(VIDEO_LEAD_MS - 1, 5, 1000)).toBe(0)
  })

  it('reveals one annotation per interval after the lead-in', () => {
    expect(visibleAnnotationCount(VIDEO_LEAD_MS + 1000, 5, 1000)).toBe(1)
    expect(visibleAnnotationCount(VIDEO_LEAD_MS + 2500, 5, 1000)).toBe(2)
  })

  it('caps at the total number of annotations', () => {
    expect(visibleAnnotationCount(VIDEO_LEAD_MS + 60_000, 5, 1000)).toBe(5)
  })

  it('handles zero annotations', () => {
    expect(visibleAnnotationCount(VIDEO_LEAD_MS + 5000, 0, 1000)).toBe(0)
  })
})

describe('exportDurationMs', () => {
  it('is lead-in + one interval per annotation + tail', () => {
    expect(exportDurationMs(3, 1000)).toBe(VIDEO_LEAD_MS + 3000 + VIDEO_TAIL_MS)
  })

  it('works with zero annotations', () => {
    expect(exportDurationMs(0, 1000)).toBe(VIDEO_LEAD_MS + VIDEO_TAIL_MS)
  })
})

describe('supportedVideoMimeTypes', () => {
  it('returns all supported candidates in preference order', () => {
    const all = supportedVideoMimeTypes(() => true)
    expect(all.length).toBeGreaterThan(1)
    expect(all[0]!.extension).toBe('mp4')
    expect(all[all.length - 1]!.extension).toBe('webm')
  })

  it('filters out unsupported types', () => {
    const picks = supportedVideoMimeTypes(m => m === 'video/webm')
    expect(picks).toEqual([{ mimeType: 'video/webm', extension: 'webm' }])
  })

  it('returns empty when nothing is supported', () => {
    expect(supportedVideoMimeTypes(() => false)).toEqual([])
  })
})

describe('pickVideoMimeType', () => {
  it('prefers mp4 when supported', () => {
    const pick = pickVideoMimeType(m => m.startsWith('video/mp4'))
    expect(pick).not.toBeNull()
    expect(pick!.extension).toBe('mp4')
    expect(pick!.mimeType).toContain('video/mp4')
  })

  it('falls back to webm when mp4 is unsupported', () => {
    const pick = pickVideoMimeType(m => m.startsWith('video/webm'))
    expect(pick!.extension).toBe('webm')
  })

  it('returns null when nothing is supported', () => {
    expect(pickVideoMimeType(() => false)).toBeNull()
  })
})
