# Plan 008: Add baseline security headers to nginx config

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> ```sh
> git rev-parse --short HEAD  # expect 00fa802
> git diff --stat 00fa802..HEAD -- nginx.conf docker-compose.yml
> ```
> If either file has changed, compare the "Current state" excerpt against
> the live code before proceeding; on a mismatch treat it as a STOP
> condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security (defense-in-depth)
- **Planned at**: commit `00fa802`, 2026-08-01
- **Issue**: —

## Why this matters

JoltShot is a static SPA with no network calls, no auth, no user data leaving
the browser. The strict threat model means most security headers are
defense-in-depth rather than fixing a known exploit. They still matter:

- A future feature that adds a third-party CDN (e.g. an emoji font fallback)
  opens the door to inline-script injection if `Content-Security-Policy`
  isn't set first.
- A regression that introduces an `eval`-equivalent (a regex-driven `new
  Function`, a misconfigured analytics shim) is blocked by `script-src 'self'`
  before it ships.
- `X-Content-Type-Options: nosniff` blocks some content-type confusion
  attacks from MIME sniffing even on a static asset.
- `Referrer-Policy: strict-origin-when-cross-origin` matches what every
  modern docs site uses and is a polite default.

The risk is LOW because the app currently doesn't make external requests.
The reward is setting the floor so any future contributor inherits the
baseline.

## Current state

`nginx.conf` (entire file, 21 lines):

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # SPA fallback: serve index.html for client-side routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

`docker-compose.yml` (entire file, 6 lines):

```yaml
services:
  web:
    build: .
    ports:
      - "4199:80"
    restart: unless-stopped
```

Conventions:

- The repo uses nginx:alpine (`Dockerfile:22`).
- The repo serves on port 4199 internally (`docker-compose.yml:5`) and 80 inside the container.
- No HTTPS termination is configured; HTTPS would be handled by an upstream reverse proxy (this app is a static SPA that is typically behind Cloudflare, etc.). Header values reflect the no-TLS context.

## Commands you will need

(Plan 001 does not need to land for this plan; this is config-only.)

| Purpose           | Command                                          | Expected on success |
|-------------------|--------------------------------------------------|---------------------|
| Build image       | `docker build -t joltshot-headers:test .`        | exit 0              |
| Run container     | `docker run --rm -p 4199:80 joltshot-headers:test` | container starts; listening on 80 |
| Inspect headers   | `curl -sI http://localhost:4199/ \| head -20`    | shows expected headers; **stop the container after** |

Note: keep the docker run in the background (`-d` not used because we need
to see startup errors; instead use `--rm` + an interrupt after the curl).

## Scope

**In scope**:

- `nginx.conf` — add a baseline `add_header` block.
- `tests/integration/headers.test.ts` (create) — boots nginx via Docker,
  curls `/`, and asserts the headers are present. Optional: in CI environment
  with no Docker, this test should `it.skip` with a clear TODO.

**Out of scope**:

- Setting up HTTPS / Let's Encrypt / TLS redirects. The repo's `docker-compose.yml`
  exposes port 80 directly; HTTPS is assumed to terminate upstream. Out of
  band for this plan — open a follow-up if needed.
- Permissions-Policy headers — these are useful but require auditing
  feature usage first; this app uses no `camera`, `microphone`,
  `payment`, etc.
- Cross-Origin-* headers — only relevant if cross-origin embedding is
  introduced.

## Git workflow

- Branch: `advisor/008-nginx-security-headers`
- Commit style: `chore(nginx): add baseline security headers (CSP, X-Content-Type-Options, Referrer-Policy)`
- Do NOT push or open a PR.

## Steps

### Step 1: Edit nginx.conf

Replace the file (keep the original blank-line structure) with:

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Baseline security headers (defense-in-depth). The app is fully
    # self-hosted: no third-party fonts, no analytics, no inline scripts.
    # Future contributors who add an external script MUST update the CSP
    # here to allow it.
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "DENY" always;
    # Permissions-Policy: explicitly disable the high-value features we don't use.
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" always;

    # SPA fallback: serve index.html for client-side routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Important caveats:

- `style-src 'unsafe-inline'` is required because Vue's scoped styles
  inline `<style>` blocks. Tailwind utility classes are in the compiled
  CSS file, not runtime-generated, so this single source of `unsafe-inline`
  is the minimum loosening required. Keep it.
- `img-src ... data: blob:` is required because all images in the app are
  data URLs (data:image/png;base64,...) or `blob:` URLs from
  `URL.createObjectURL`. Self-fetched images are not used.
- The static-asset `location` block's `add_header Cache-Control` will
  *override* the `Content-Security-Policy` header from the parent block
  unless we re-state it. nginx's `add_header` in a nested block *replaces*
  parent-block headers. To avoid losing CSP on static assets, we re-state
  the relevant directives inside the nested block. Two options:
  1. Add a redundant CSP directive in the static-asset block.
  2. Use `more_set_headers` from `nginx-headers-more` (requires an extra
     dependency — out of scope for a static SPA).

We pick option 1. Modify the static-asset block to:

```nginx
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
    }
```

**Verify**: `cat nginx.conf` looks correct; `nginx -t -c $(pwd)/nginx.conf -p $(pwd)` (if nginx is installed locally) returns syntax OK. If nginx isn't installed locally, skip this and rely on the Docker build in Step 2.

### Step 2: Build and run via Docker

```sh
docker build -t joltshot-headers:test .
docker run --rm -d --name joltshot-headers -p 4199:80 joltshot-headers:test
sleep 2
curl -sI http://localhost:4199/ | head -20
docker stop joltshot-headers
```

**Verify**: The response headers include:

```
content-security-policy: default-src 'self'; img-src 'self' data: blob:; ...
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
x-frame-options: DENY
```

If any header is missing, the most likely culprit is that the
static-asset block overrode it for the response type `curl` saw (which
would be `text/html` from the SPA fallback, so it should be fine).

### Step 3: Add an integration test (optional)

If Docker is available in CI, create `tests/integration/headers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

const HAS_DOCKER = (() => {
  try {
    execSync('docker --version', { stdio: 'ignore' })
    return true
  } catch { return false }
})()

describe.skipIf(!HAS_DOCKER)('nginx serves expected security headers', () => {
  it('curl sees CSP, X-Content-Type-Options, and Referrer-Policy', () => {
    execSync('docker build -t joltshot-headers:test .', { stdio: 'pipe' })
    try {
      execSync('docker run --rm -d --name joltshot-headers -p 4199:80 joltshot-headers:test', { stdio: 'pipe' })
      const out = execSync('sleep 2 && curl -sI http://localhost:4199/').toString()
      expect(out.toLowerCase()).toContain('content-security-policy:')
      expect(out.toLowerCase()).toContain('x-content-type-options: nosniff')
      expect(out.toLowerCase()).toContain('referrer-policy:')
      expect(out.toLowerCase()).toContain('x-frame-options: deny')
    } finally {
      try { execSync('docker stop joltshot-headers', { stdio: 'ignore' }) } catch {}
    }
  }, 30000)
})
```

**Verify**: `pnpm test --run tests/integration/headers.test.ts` exits 0 in a Docker environment; skip with explicit message in non-Docker environments.

### Step 4: Document the CSP constraint in the README

Append to `README.md` (under a new "Security" section before "License"):

```markdown
## Security

The app is a static SPA served by nginx with a baseline
`Content-Security-Policy` that allows only resources from the same origin
plus `data:` and `blob:` URLs (the latter are required for clipboard image
pastes). If you add a third-party asset (font CDN, analytics script, emoji
library) you must update the CSP in `nginx.conf` to allow its source — see
the comment block at the top of the policy for the affected directives.
```

**Verify**: `grep -n '## Security' README.md` returns exactly 1 match.

## Test plan

- **New test**: `tests/integration/headers.test.ts` — auto-skipped without Docker.
- **Manual smoke**: `docker run` + `curl -sI` confirms each header.
- **Verification**: Headers all present and have the expected values.

## Done criteria

ALL must hold:

- [ ] `docker build -t joltshot-headers:test .` exits 0
- [ ] `curl -sI http://localhost:4199/` (against a running container) shows `content-security-policy`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `x-frame-options: DENY`
- [ ] `grep -c 'add_header Content-Security-Policy' nginx.conf` returns ≥ 2 (parent block + static-asset block)
- [ ] `grep -n '## Security' README.md` returns 1 match
- [ ] No files outside `nginx.conf`, `README.md`, and (optionally) the new integration test are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated to **DONE**

## STOP conditions

Stop and report back (do not improvise) if:

- Adding the CSP header breaks the dev server (`pnpm dev`) — that means a
  HMR-specific origin needs to be allowed; STOP, do not relax the production
  CSP for HMR's sake. Instead, the dev server should run its own config or
  bind to a separate `location` that omits the CSP for development only.
- `docker build` fails on the nginx config copy step — confirm the new
  `nginx.conf` has no syntax errors (`docker run --rm -v $(pwd):/etc/nginx/conf.d/ nginx:alpine nginx -t 2>&1`). Stop and report any unknown directive.
- A teammate requests adding `unsafe-eval` to `script-src` for compatibility
  with some tooling — STOP. `eval` is fundamentally incompatible with CSP's
  purpose. Use a build-time transformation if needed.

## Maintenance notes

- The CSP allows only self-origin + data/blob URLs. Any new feature that
  needs an external resource must update the policy. The README now points
  at this expectation; future PRs that touch `nginx.conf` should bump the
  year in the README's "Security" section.
- `Permissions-Policy` blocks camera, microphone, geolocation, payment, USB,
  and sensors. If a future feature uses one (e.g. "paste from webcam"), the
  feature request must include a corresponding Permissions-Policy relaxation
  in `nginx.conf`.
- HTTPS support is out of scope. When the deployment includes a TLS proxy,
  the `add_header` directives will need to be replicated at that layer (or
  the directives moved into a single shared config) — `Strict-Transport-Security`
  belongs at the TLS-terminating layer, not at this nginx instance.
- The test in Step 3 auto-skips in non-Docker environments to keep the
  plan runnable in any CI. Once the project adopts Docker-CI, drop the
  `describe.skipIf` and the test will run unconditionally.
