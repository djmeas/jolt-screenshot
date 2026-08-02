// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  // Disable the auto-injected `<script type="importmap">`. The importmap
  // is only needed by browsers that don't support a feature Vite already
  // assumes (chunk hashing), and it is an inline `<script>` tag that the
  // production CSP would have to allow. Disabling it shrinks the
  // attack surface and keeps the strict `script-src 'self'` policy
  // viable for everything except the one Nuxt hydration inline script
  // (`window.__NUXT__`), which `nginx.conf` allows via `'unsafe-inline'`
  // because `nuxt generate` produces static HTML with no per-request
  // nonce mechanism.
  experimental: {
    entryImportMap: false
  },
  app: {
    head: {
      title: 'JoltShot',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ]
    }
  }
})
