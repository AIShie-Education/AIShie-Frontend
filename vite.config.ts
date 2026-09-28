import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// The typefaces come from @fontsource (src/styles/fonts.ts), whose style
// sheets give each piece of a face as woff2 and, for browsers too old to run
// this app, as woff. Only woff2 is kept, so the build carries no woff files
// that nothing would fetch; and no piece is inlined into a style sheet, where
// every reader would download it whether their page uses it or not.
const fontsourceWoff2Only = {
  name: 'fontsource-woff2-only',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!/[\\/]@fontsource[\\/].+\.css$/.test(id)) return
    return { code: code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, ''), map: null }
  },
}

// In development the front end is served from this machine and every API call
// goes through the dev server's proxy to Core, so that the browser sees one
// origin: the session cookie is first-party, and Core's cross-origin guard
// sees a same-origin request. AISHITERU_API_TARGET picks the Core instance.
//
// The agent runtime's API, /runtime/api, is proxied the same way, to
// AISHITERU_RUNTIME_TARGET: by default where Core is, since on a server one
// proxy sends that path to the runtime beside Core's; http://localhost:9091
// for a runtime on this machine (its API_ADDR). As that proxy does, this one
// strips the Cookie header: the runtime takes a bearer assertion, and never
// Core's session.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.AISHITERU_API_TARGET || 'https://test.aishie.app'
  const runtimeTarget = env.AISHITERU_RUNTIME_TARGET || target
  // The dev server does not forward /mcp (Core refuses what a proxy forwards
  // there unless it is a trusted one), so pages that tell people where an
  // agent connects point at the proxied Core itself.
  if (mode === 'development' && !env.VITE_CORE_PUBLIC_URL) process.env.VITE_CORE_PUBLIC_URL = target
  const proxyTo = (to: string, opts: { stripCookie?: boolean } = {}) => ({
    target: to,
    changeOrigin: true,
    secure: true,
    // Core's session cookie is Secure. Browsers accept a Secure cookie from
    // http://localhost, which is all the dev server ever is.
    cookieDomainRewrite: '',
    configure(proxy: any) {
      proxy.on('proxyReq', (req: any) => {
        // The request now goes to the target's host; say it came from there too.
        if (req.getHeader('origin')) req.setHeader('origin', to)
        if (opts.stripCookie) req.removeHeader('cookie')
      })
    },
  })
  const core = proxyTo(target)
  const runtime = proxyTo(runtimeTarget, { stripCookie: true })
  const proxy = { '/v1': core, '/healthz': core, '/runtime/api': runtime }
  return {
    plugins: [vue(), fontsourceWoff2Only],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      port: 4173,
      proxy,
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
      assetsInlineLimit: (file: string) => (/[\\/]@fontsource[\\/]/.test(file) ? false : undefined),
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/element-plus') || id.includes('node_modules/@element-plus')) return 'element-plus'
            if (/node_modules\/(markdown-it|dompurify|katex|highlight\.js)\//.test(id)) return 'markdown'
            // A typeface goes where it is imported: Chinese's into the chunk
            // loaded only for a page in Chinese (src/styles/fonts.ts).
            if (id.includes('node_modules/@fontsource/')) return undefined
            if (id.includes('node_modules')) return 'vendor'
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
    },
  }
})
