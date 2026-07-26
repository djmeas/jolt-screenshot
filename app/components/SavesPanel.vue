<script setup lang="ts">
import type { SavedProjectMeta } from '~/composables/useProjectStorage'
import { formatBytes } from '~/composables/useProjectStorage'

const props = defineProps<{
  projects: SavedProjectMeta[]
  storageBytes: number
  isDark: boolean
  activeId: string | null
}>()

const emit = defineEmits<{
  (e: 'load', id: string): void
  (e: 'rename', payload: { id: string, name: string }): void
  (e: 'delete', id: string): void
  (e: 'close'): void
  (e: 'refresh'): void
}>()

const renamingId = ref<string | null>(null)
const renameValue = ref('')
const pendingDeleteId = ref<string | null>(null)

function startRename(meta: SavedProjectMeta) {
  renamingId.value = meta.id
  renameValue.value = meta.name
}

function commitRename() {
  const id = renamingId.value
  if (!id) return
  const next = renameValue.value.trim()
  if (next) emit('rename', { id, name: next })
  renamingId.value = null
}

function cancelRename() {
  renamingId.value = null
}

function confirmDelete(id: string) {
  pendingDeleteId.value = id
}

function performDelete() {
  if (pendingDeleteId.value) emit('delete', pendingDeleteId.value)
  pendingDeleteId.value = null
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(ts).toLocaleDateString()
}

const panelClass = computed(() => props.isDark
  ? 'bg-zinc-900 border-zinc-700'
  : 'bg-white border-slate-200',
)

const emptyClass = computed(() => props.isDark ? 'text-zinc-500' : 'text-slate-500')
const headingClass = computed(() => props.isDark ? 'text-zinc-100' : 'text-slate-900')
const mutedClass = computed(() => props.isDark ? 'text-zinc-400' : 'text-slate-500')
const itemHoverClass = computed(() => props.isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-slate-100')
const itemActiveClass = computed(() => props.isDark ? 'bg-zinc-800' : 'bg-slate-100')
const inputClass = computed(() => props.isDark
  ? 'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-indigo-500'
  : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500',
)
</script>

<template>
  <div
    class="absolute top-full left-2 sm:left-3 right-2 sm:right-3 mt-2 z-30 w-auto max-w-[420px] mx-auto rounded-xl shadow-2xl border p-3 space-y-2"
    :class="panelClass"
    role="dialog"
    aria-label="Saved projects"
    @click.stop
  >
    <div class="flex items-center justify-between gap-2 px-1">
      <h2 class="text-sm font-semibold" :class="headingClass">Saved projects</h2>
      <button
        type="button"
        class="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
        :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100']"
        title="Refresh"
        @click="emit('refresh')"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
      </button>
    </div>

    <p v-if="projects.length === 0" class="text-xs px-1 py-6 text-center" :class="emptyClass">
      No saved projects yet. Your work will be saved here automatically.
    </p>

    <ul v-else class="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
      <li
        v-for="meta in projects"
        :key="meta.id"
        class="group flex items-center gap-2 rounded-lg p-1.5 transition-colors"
        :class="[
          activeId === meta.id ? itemActiveClass : '',
          !activeId || activeId !== meta.id ? itemHoverClass : '',
        ]"
      >
        <div
          class="shrink-0 w-14 h-14 rounded-md overflow-hidden border flex items-center justify-center"
          :class="[isDark ? 'border-zinc-700 bg-zinc-800' : 'border-slate-200 bg-slate-100']"
        >
          <img
            v-if="meta.thumb"
            :src="meta.thumb"
            :alt="meta.name"
            class="w-full h-full object-cover"
          />
          <svg v-else class="w-5 h-5" :class="mutedClass" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>

        <div class="flex-1 min-w-0">
          <input
            v-if="renamingId === meta.id"
            v-model="renameValue"
            type="text"
            class="w-full text-xs px-2 py-1 rounded-md border outline-none"
            :class="inputClass"
            autofocus
            @blur="commitRename"
            @keydown.enter.prevent="commitRename"
            @keydown.escape="cancelRename"
          />
          <p v-else class="text-xs font-medium truncate" :class="headingClass">{{ meta.name }}</p>
          <p class="text-[11px] mt-0.5" :class="mutedClass">
            {{ meta.width }}×{{ meta.height }} · {{ meta.annotationCount }} ann · {{ formatRelativeTime(meta.updatedAt) }}
          </p>
        </div>

        <div class="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
          <button
            v-if="renamingId !== meta.id"
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
            :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200']"
            title="Rename"
            @click="startRename(meta)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
          </button>
          <button
            v-if="renamingId !== meta.id"
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
            :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200']"
            title="Load"
            @click="emit('load', meta.id)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          </button>
          <button
            v-if="renamingId !== meta.id"
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
            :class="[isDark ? 'text-zinc-400 hover:text-red-400 hover:bg-zinc-700' : 'text-slate-500 hover:text-red-600 hover:bg-slate-200']"
            title="Delete"
            @click="confirmDelete(meta.id)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
          </button>
        </div>
      </li>
    </ul>

    <div class="flex items-center justify-between pt-1 border-t text-[11px]" :class="[isDark ? 'border-zinc-800 text-zinc-500' : 'border-slate-200 text-slate-500']">
      <span>{{ projects.length }} saved · {{ formatBytes(storageBytes) }}</span>
      <span class="opacity-80">Stored locally in your browser</span>
    </div>

    <Teleport to="body">
      <div
        v-if="pendingDeleteId"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-save-title"
      >
        <div class="absolute inset-0 bg-black/50" @click="pendingDeleteId = null" />
        <div
          class="relative w-full max-w-sm rounded-xl border p-5 shadow-2xl"
          :class="[isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200']"
        >
          <h2 id="delete-save-title" class="text-base font-semibold" :class="headingClass">Delete saved project?</h2>
          <p class="mt-2 text-sm" :class="mutedClass">This permanently removes the saved project from this browser. Your current canvas isn't affected.</p>
          <div class="mt-5 flex gap-2">
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              @click="pendingDeleteId = null"
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
              @click="performDelete"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>