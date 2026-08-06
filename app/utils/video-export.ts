export const VIDEO_LEAD_MS = 500
export const VIDEO_TAIL_MS = 1000
export const MIN_ANNOTATIONS_PER_SECOND = 0.25
export const MAX_ANNOTATIONS_PER_SECOND = 5
export const DEFAULT_ANNOTATIONS_PER_SECOND = 1

export function clampAnnotationsPerSecond(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_ANNOTATIONS_PER_SECOND
  return Math.min(MAX_ANNOTATIONS_PER_SECOND, Math.max(MIN_ANNOTATIONS_PER_SECOND, rate))
}

export function visibleAnnotationCount(elapsedMs: number, total: number, msPerAnnotation: number): number {
  const revealed = Math.floor((elapsedMs - VIDEO_LEAD_MS) / msPerAnnotation)
  return Math.min(total, Math.max(0, revealed))
}

export function exportDurationMs(total: number, msPerAnnotation: number): number {
  return VIDEO_LEAD_MS + total * msPerAnnotation + VIDEO_TAIL_MS
}

export function baseRevealWidth(
  segments: readonly { x: number, width: number }[],
  shownCount: number,
  canvasWidth: number,
): number {
  if (segments.length === 0 || shownCount >= segments.length) return canvasWidth
  const seg = segments[shownCount - 1]
  if (!seg) return canvasWidth
  return Math.min(canvasWidth, seg.x + seg.width)
}

const MIME_CANDIDATES: { mimeType: string, extension: string }[] = [
  { mimeType: 'video/mp4;codecs="avc1.42E01E"', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
]

export function supportedVideoMimeTypes(isSupported: (mimeType: string) => boolean): { mimeType: string, extension: string }[] {
  return MIME_CANDIDATES.filter(candidate => isSupported(candidate.mimeType))
}

export function pickVideoMimeType(isSupported: (mimeType: string) => boolean): { mimeType: string, extension: string } | null {
  return supportedVideoMimeTypes(isSupported)[0] ?? null
}
