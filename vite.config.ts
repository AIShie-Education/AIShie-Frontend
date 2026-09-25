import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// In development the front end is served from this machine and every API call
// goes through the dev server's proxy to Core, so that the browser sees one
// origin: the session cookie is first-party, and Core's cross-origin guard
// sees a same-origin request. AISHITERU_API_TARGET picks the Core instance.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.AISHITERU_API_TARGET || 'https://test.aishie.app'
  // The dev server does not forward /mcp (Core refuses what a proxy forwards
  // there unless it is a trusted one), so pages that tell people where an
  // agent connects point at the proxied Core itself.
  if (mode === 'development' && !env.VITE_CORE_PUBLIC_URL) process.env.VITE_CORE_PUBLIC_URL = target
  const proxied = {
    target,
    changeOrigin: true,
    secure: true,
    // Core's session cookie is Secure. Browsers accept a Secure cookie from
    // http://localhost, which is all the dev server ever is.
    cookieDomainRewrite: '',
    configure(proxy: any) {
      // The request now goes to Core's host; say it came from there too.
      proxy.on('proxyReq', (req: any) => {
        if (req.getHeader('origin')) req.setHeader('origin', target)
      })
    },
  }
  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/v1': proxied, '/healthz': proxied },
    },
    preview: {
      port: 4173,
      proxy: { '/v1': proxied, '/healthz': proxied },
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/element-plus') || id.includes('node_modules/@element-plus')) return 'element-plus'
            if (id.includes('node_modules/markdown-it') || id.includes('node_modules/dompurify')) return 'markdown'
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
