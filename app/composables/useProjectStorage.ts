const VERSION_KEY = 'joltshot:version'
const STORAGE_VERSION = 1
const INDEX_KEY = 'joltshot:index'
const PROJECT_PREFIX = 'joltshot:save:'

export type SavedProjectMeta = {
  id: string
  name: string
  updatedAt: number
  createdAt: number
  width: number
  height: number
  thumb: string | null
  hasBase: boolean
  layerCount: number
  annotationCount: number
}

export type SavedLayer = {
  id: string
  dataUrl: string
  naturalWidth: number
  naturalHeight: number
}

export type SavedBaseImage = {
  dataUrl: string
  naturalWidth: number
  naturalHeight: number
}

export type SavedStripSegment = {
  x: number
  width: number
  labelText?: string
}

export type SavedStrip = {
  segments: SavedStripSegment[]
  labelsEnabled: boolean
}

export type SavedSettings = {
  strokeColor: string
  strokeWidth: number
  textFontSize: number
  emojiSize: number
}

export type SavedProject = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
  baseImage: SavedBaseImage | null
  layers: SavedLayer[]
  annotations: unknown[]
  strip?: SavedStrip
  settings: SavedSettings
}

export type SaveResult =
  | { ok: true, meta: SavedProjectMeta }
  | { ok: false, reason: 'quota' | 'missing-image' | 'error' }

function isClient() {
  return import.meta.client
}

function ensureVersion() {
  if (!isClient()) return
  const v = localStorage.getItem(VERSION_KEY)
  if (v !== String(STORAGE_VERSION)) {
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(PROJECT_PREFIX)) keysToRemove.push(key)
      }
      for (const k of keysToRemove) localStorage.removeItem(k)
      localStorage.removeItem(INDEX_KEY)
    } catch {}
    localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION))
  }
}

function readIndex(): SavedProjectMeta[] {
  if (!isClient()) return []
  ensureVersion()
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeIndex(items: SavedProjectMeta[]) {
  if (!isClient()) return
  localStorage.setItem(INDEX_KEY, JSON.stringify(items))
}

function readProject(id: string): SavedProject | null {
  if (!isClient()) return null
  try {
    const raw = localStorage.getItem(PROJECT_PREFIX + id)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeProject(project: SavedProject) {
  if (!isClient()) throw new Error('not-client')
  localStorage.setItem(PROJECT_PREFIX + project.id, JSON.stringify(project))
}

function removeProject(id: string) {
  if (!isClient()) return
  localStorage.removeItem(PROJECT_PREFIX + id)
}

function deleteFromIndex(id: string): SavedProjectMeta[] {
  const items = readIndex().filter(m => m.id !== id)
  writeIndex(items)
  return items
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function listSavedProjects(): SavedProjectMeta[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSavedProject(id: string): SavedProject | null {
  return readProject(id)
}

export function deleteSavedProject(id: string) {
  removeProject(id)
  deleteFromIndex(id)
}

export function renameSavedProject(id: string, name: string) {
  const items = readIndex()
  const idx = items.findIndex(m => m.id === id)
  if (idx === -1) return
  items[idx] = { ...items[idx]!, name, updatedAt: Date.now() }
  writeIndex(items)
  const project = readProject(id)
  if (project) {
    project.name = name
    project.updatedAt = items[idx]!.updatedAt
    writeProject(project)
  }
}

export type BuildSaveInput = {
  id: string
  name: string
  createdAt: number
  width: number
  height: number
  baseImage: SavedBaseImage | null
  layers: SavedLayer[]
  annotations: unknown[]
  strip?: SavedStrip
  settings: SavedSettings
  thumbDataUrl?: string | null
}

export function saveProject(input: BuildSaveInput): SaveResult {
  if (!isClient()) return { ok: false, reason: 'error' }
  ensureVersion()
  const now = Date.now()
  const existing = readProject(input.id)
  const project: SavedProject = {
    id: input.id,
    name: input.name,
    createdAt: existing?.createdAt ?? input.createdAt,
    updatedAt: now,
    width: input.width,
    height: input.height,
    baseImage: input.baseImage,
    layers: input.layers,
    annotations: input.annotations,
    strip: input.strip,
    settings: input.settings,
  }

  let thumb: string | null = null
  if (input.thumbDataUrl !== undefined) {
    thumb = input.thumbDataUrl
  } else {
    try {
      thumb = computeBlankThumbnail(input.width, input.height)
    } catch {}
  }

  const meta: SavedProjectMeta = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: now,
    width: input.width,
    height: input.height,
    thumb,
    hasBase: !!input.baseImage,
    layerCount: input.layers.length,
    annotationCount: input.annotations.length,
  }

  try {
    writeProject(project)
  } catch (err) {
    if (isQuotaError(err)) return { ok: false, reason: 'quota' }
    return { ok: false, reason: 'error' }
  }

  try {
    const items = readIndex().filter(m => m.id !== project.id)
    items.push(meta)
    writeIndex(items)
  } catch (err) {
    removeProject(project.id)
    if (isQuotaError(err)) return { ok: false, reason: 'quota' }
    return { ok: false, reason: 'error' }
  }

  return { ok: true, meta }
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

function computeBlankThumbnail(width: number, height: number): string | null {
  if (typeof document === 'undefined' || width <= 0 || height <= 0) return null
  const targetW = 240
  const scale = Math.min(targetW / width, 1)
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = Math.max(1, Math.floor(width * scale))
  thumbCanvas.height = Math.max(1, Math.floor(height * scale))
  const tctx = thumbCanvas.getContext('2d')
  if (!tctx) return null
  tctx.fillStyle = '#ffffff'
  tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height)
  return thumbCanvas.toDataURL('image/jpeg', 0.7)
}

export function makeThumbnailFromCanvas(source: HTMLCanvasElement | null): string | null {
  if (typeof document === 'undefined' || !source) return null
  if (source.width === 0 || source.height === 0) return null
  const targetW = 240
  const scale = Math.min(targetW / source.width, 1)
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = Math.max(1, Math.floor(source.width * scale))
  thumbCanvas.height = Math.max(1, Math.floor(source.height * scale))
  const tctx = thumbCanvas.getContext('2d')
  if (!tctx) return null
  tctx.drawImage(source, 0, 0, thumbCanvas.width, thumbCanvas.height)
  return thumbCanvas.toDataURL('image/jpeg', 0.7)
}

export function estimateStorageUsage(): number {
  if (!isClient()) return 0
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (!key.startsWith(PROJECT_PREFIX) && key !== INDEX_KEY) continue
    const value = localStorage.getItem(key)
    if (value) total += key.length + value.length
  }
  return total * 2
}

export function newProjectId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const PROJECT_STORAGE_VERSION = STORAGE_VERSION