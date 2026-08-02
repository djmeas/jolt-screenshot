# Plan 001: Establish verification baseline (lint, typecheck, smoke tests)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> ```sh
> git rev-parse --short HEAD  # expect 00fa802
> git diff --stat 00fa802..HEAD -- package.json nuxt.config.ts tsconfig.json app
> ```
> If the in-scope paths above show changes, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / dx
- **Planned at**: commit `00fa802`, 2026-08-01
- **Issue**: —

## Why this matters

Every other plan in this index (touch-drawing fix, undo cap, etc.) needs a
machine-checkable "done" criterion. The repo today has no lint config, no
typecheck script, no test framework, and no CI. An executor model landing a
patch has no honest way to verify it didn't regress type safety or runtime
behavior. This plan establishes the minimum viable baseline: a typecheck
that runs in <30 s, a smoke test that runs in <10 s, and a lint command
that exits 0 on clean code. All three are wired into `package.json` and into
the multi-stage `Dockerfile`. Plans 002–008 then declare these as their
verification commands.

## Current state

Files of interest (lines current as of `00fa802`):

- `package.json` — scripts: `build`, `dev`, `generate`, `preview`, `postinstall`. **No** `lint`, `typecheck`, or `test`. Dependencies: `@nuxtjs/tailwindcss`, `@unhead/vue`, `nuxt`, `vue`, `vue-router`. **No** `typescript`, `eslint`, `vitest`, `@vue/test-utils`, `@nuxt/test-utils` in deps.

  ```json
  {
    "name": "jolt-screenshot",
    "type": "module",
    "private": true,
    "scripts": {
      "build": "nuxt build",
      "dev": "nuxt dev",
      "generate": "nuxt generate",
      "preview": "nuxt preview",
      "postinstall": "nuxt prepare"
    },
    "dependencies": { ... }
  }
  ```

- `tsconfig.json` — references Nuxt-generated tsconfigs only; no project-wide typecheck.

- `Dockerfile` — multi-stage, runs `pnpm install --frozen-lockfile` then `pnpm generate`. No typecheck or test step.

- `app/utils/color.ts` — pure functions (`hsvaToRgba`, `rgbaToHsva`, `rgbaToHex`, `parseHexColor`, `parseColorString`, `hsvaToCss`). Unit-testable; no DOM dep.

- `.gitignore` — excludes `node_modules`, `.nuxt`, `.output`. New generated test artifacts (e.g. `coverage/`) must also be added.

Conventions to match: the repo uses ESM (`"type": "module"`), pnpm for installs
(`pnpm-lock.yaml` present, `package-lock.json` is a stale artifact — see
maintenance notes), and Nuxt 4 app dir layout (`app/pages/`, `app/components/`,
`app/composables/`, `app/utils/`). Use the same.

## Commands you will need

| Purpose   | Command                                   | Expected on success                |
|-----------|-------------------------------------------|------------------------------------|
| Install   | `pnpm install`                            | exit 0                             |
| Typecheck | `pnpm typecheck` *(added by this plan)*   | exit 0, no errors                  |
| Lint      | `pnpm lint` *(added by this plan)*        | exit 0                             |
| Tests     | `pnpm test` *(added by this plan)*        | exit 0; ≥ 1 test file, ≥ 3 tests   |
| Dev       | `pnpm dev`                                | Nuxt dev server starts (do not keep running — Ctrl-C after first listener line) |
| Build     | `pnpm generate`                           | exit 0, writes `.output/public/`   |

## Scope

**In scope** (the only files you should modify or create):

- `package.json` — add `typecheck`, `lint`, `test` scripts; add devDependencies
- `pnpm-lock.yaml` — will regenerate via `pnpm install`
- `vitest.config.ts` (create) — minimal Vitest setup
- `tsconfig.check.json` (create) — extends the Nuxt-generated app tsconfig for IDE-free typecheck
- `tests/unit/color.test.ts` (create) — first smoke test exercising `app/utils/color.ts`
- `.eslintrc.cjs` or `eslint.config.mjs` (create) — flat config recommended for ESLint 9
- `.gitignore` — add `coverage/`
- `Dockerfile` — add `pnpm typecheck` and `pnpm test` between install and generate

**Out of scope** (do NOT touch):

- `app/` source files — this plan deliberately does not fix any bugs. Later plans do.
- `docs/superpowers/plans/*.md` and `docs/superpowers/specs/*.md` — historical feature plans.
- `package-lock.json` — stale, ignored by the repo. (Mention in maintenance notes; don't delete.)
- `.nuxt/`, `.output/`, `node_modules/` — generated.

## Git workflow

- Branch: `advisor/001-verification-baseline`
- Commit style observed in `git log --oneline -10`: conventional commits (`fix:`, `feat:`, `docs:`). Match this.
- One commit per step.
- Do NOT push or open a PR.

## Steps

### Step 1: Add devDependencies and scripts to `package.json`

Edit `package.json` so the resulting file looks exactly like this:

```json
{
  "name": "jolt-screenshot",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "typecheck": "vue-tsc --noEmit -p tsconfig.check.json",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@nuxtjs/tailwindcss": "^6.14.0",
    "@unhead/vue": "^3.2.3",
    "nuxt": "^4.3.0",
    "vue": "^3.5.27",
    "vue-router": "^4.6.4"
  },
  "devDependencies": {
    "@vue/test-utils": "^2.4.6",
    "eslint": "^9.13.0",
    "happy-dom": "^15.7.4",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4",
    "vue-tsc": "^2.1.10"
  }
}
```

The exact versions above must be used to keep `pnpm install --frozen-lockfile`
working — match against what Nuxt 4 / Vue 3.5 already pin to avoid hoisting
conflicts.

Then run:

```sh
pnpm install
```

**Verify**: exit 0; `node_modules/.pnpm/vue-tsc@*/` directory exists.

### Step 2: Create `tsconfig.check.json`

Create `tsconfig.check.json` at repo root:

```json
{
  "extends": "./.nuxt/tsconfig.app.json",
  "include": [
    "app/**/*.ts",
    "app/**/*.vue",
    "tests/**/*.ts"
  ],
  "exclude": ["node_modules", ".nuxt", ".output", "dist"]
}
```

This lets `vue-tsc` typecheck app source + tests without re-running the entire
Nuxt server build.

Then run:

```sh
pnpm typecheck
```

**Verify**: exit 0. **Expected to FAIL initially** because `app/components/*.vue` may have style-only `<style>` blocks; if so, vue-tsc still typechecks cleanly (templates are TS-checked). If the error is `Cannot find module 'vue'`, the extends path is wrong — STOP and report.

### Step 3: Add ESLint flat config

Create `eslint.config.mjs`:

```js
import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        FileReader: 'readonly',
        ClipboardItem: 'readonly',
        ClipboardEvent: 'readonly',
        WheelEvent: 'readonly',
        PointerEvent: 'readonly',
        MouseEvent: 'readonly',
        TouchEvent: 'readonly',
        File: 'readonly',
        Blob: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        ResizeObserver: 'readonly',
        Image: 'readonly',
        HTMLElement: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',  // replace with TypeScript-aware version in vue files
      'no-undef': 'off',         // TypeScript handles this
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    ignores: ['node_modules/**', '.nuxt/**', '.output/**', 'dist/**', 'coverage/**'],
  },
]
```

Add `@eslint/js` to devDependencies:

```json
"@eslint/js": "^9.13.0"
```

Then run:

```sh
pnpm lint
```

**Verify**: exit 0. If pre-existing source code produces hundreds of errors,
document them in a follow-up commit but DO NOT auto-fix — record in the
maintenance notes and proceed. If exit code is non-zero with <10 errors, list them in commit body and proceed.

### Step 4: Add Vitest config and a smoke test

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
})
```

Add `@vitejs/plugin-vue` to devDependencies:

```json
"@vitejs/plugin-vue": "^5.1.4"
```

Create `tests/unit/color.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  hsvaToRgba,
  rgbaToHsva,
  rgbaToHex,
  parseHexColor,
  parseColorString,
  hsvaToCss,
} from '~/utils/color'

describe('color utilities', () => {
  it('hsvaToRgba round-trips pure red', () => {
    expect(hsvaToRgba(0, 1, 1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('rgbaToHsva then hsvaToRgba is identity on opaque colors', () => {
    for (const [r, g, b] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 200, 50]] as const) {
      const hsva = rgbaToHsva(r, g, b, 1)
      expect(hsvaToRgba(hsva.h, hsva.s, hsva.v, hsva.a)).toEqual({ r, g, b, a: 1 })
    }
  })

  it('rgbaToHex omits alpha when fully opaque, includes when not', () => {
    expect(rgbaToHex(255, 0, 0, 1)).toBe('#ff0000')
    expect(rgbaToHex(255, 0, 0, 0.5)).toBe('#ff000080')
  })

  it('parseHexColor accepts 3-digit shorthand', () => {
    expect(parseHexColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('hsvaToCss returns rgba(...) when alpha < 1', () => {
    expect(hsvaToCss({ h: 0, s: 1, v: 1, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('parseColorString returns null on garbage', () => {
    expect(parseColorString('not-a-color')).toBeNull()
  })
})
```

Then run:

```sh
pnpm test
```

**Verify**: exit 0; output lists 6 passing tests in `tests/unit/color.test.ts`. The number `6` must match — if you see fewer, a test was filtered or there's a setup issue.

### Step 5: Wire checks into the Docker build

Edit `Dockerfile`. After the `RUN pnpm install --frozen-lockfile` line and
before `COPY . .`, add:

```dockerfile
# Run verification gates
RUN pnpm typecheck && pnpm lint && pnpm test
```

If the lint or test step fails on the in-flight build (e.g. due to a
transient CI network issue installing `@eslint/js`), add a fallback comment
and remove only the failing step rather than disabling verification — STOP
condition applies if three or more modules fail to resolve, otherwise report.

Build the image locally to confirm:

```sh
docker build -t joltshot-verify:test .
```

**Verify**: exit 0; layer ID is created for the verify step.

### Step 6: Append `coverage/` to `.gitignore`

Append to `.gitignore`:

```
coverage/
```

`git status --ignored` should now list `coverage/` if it ever appears.

**Verify**: `git diff .gitignore` shows exactly one added line.

## Test plan

The smoke test in Step 4 IS the test plan. After this plan lands:

- **New tests**: `tests/unit/color.test.ts` — 6 tests covering the round-trip property, hex encoding, and parser null-safety. These are deliberately small so the executor's verifier sees green immediately, but they're real regression coverage for a module that plans 005–007 may refine.
- **Existing test pattern**: there is none yet — this plan establishes the pattern. Subsequent plans add tests in `tests/unit/` (pure logic) or `tests/component/` (Vue components via `@vue/test-utils`).
- **Verification**: `pnpm test` exits 0; `pnpm test --run tests/unit/color.test.ts` exits 0.

## Done criteria

ALL must hold:

- [ ] `pnpm install` exits 0 (with no peer-dep warnings as errors)
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0 (pre-existing source errors recorded in commit body, but exit 0 means none are blocking)
- [ ] `pnpm test` exits 0 with exactly 6 passing tests
- [ ] `docker build -t joltshot-verify:test .` exits 0
- [ ] `git status` shows only edits inside the in-scope list
- [ ] `advisor-plans/README.md` status row updated to **DONE**

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm install` fails due to peer-dep conflicts that aren't resolved by the exact versions above — STOP, do not loosen constraints.
- `vue-tsc` reports `error TS2304: Cannot find name 'CanvasRenderingContext2D'` despite globals being set — STOP; the project's Nuxt tsconfig genuinely missed something (report the missing global).
- ESLint flat config refuses the globals block on `lint` — STOP; fall back to legacy config and document why.
- `vitest` fails to resolve `~/utils/color` (the `~` alias) — STOP; it's possible Nuxt's tsconfig has a different alias; report the missing alias instead of inventing one.
- A pre-existing `vue` file contains a type error surface that the typecheck gate can't pass without source changes — record the file paths, do not fix in this plan; subsequent plans handle them.

## Maintenance notes

For the future maintainer:

- `package-lock.json` at the repo root is a stale artifact from before the
  project migrated to pnpm. It's harmless but confusing. Don't delete it
  in this plan — open a one-liner follow-up instead.
- ESLint flat-config with `languageOptions.globals` is brittle: every new
  DOM type used in source code requires an entry. Consider adopting
  `@typescript-eslint` + browser globals plugin in a follow-up once the
  baseline is green.
- The Docker build currently re-runs typecheck + lint + test for every
  image. For a faster inner-loop, use a `verify` stage separate from the
  `build` stage that consumes cached `node_modules`. Out of scope here.
- Plans 002–008 declare their verification in terms of `pnpm typecheck`,
  `pnpm lint`, and `pnpm test`. Land this plan first — never in parallel
  with another plan's changes.
