import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIcons from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/tokens.css'
import './styles/element.css'
import './styles/main.css'

import App from './App.vue'
import { router } from './router'
import { installChunkReload } from './router/chunkReload'
import { i18n } from './i18n'
import { onPasswordChangeRequired, onUnauthenticated } from './api/http'
import { useSessionStore } from './stores/session'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(ElementPlus)
for (const [name, component] of Object.entries(ElementPlusIcons)) {
  app.component(name, component)
}
// A deploy removes the previous build's chunks: a tab still on it reloads at
// the route it was going to, once, instead of failing to open that view.
// Installed before the router starts, so the first navigation is covered too.
// Noting here when it has set off a reload lets a first page that failed for
// that reason keep the loading screen until the new build arrives.
let reloading = false
installChunkReload(router, {
  assign: (href) => {
    reloading = true
    window.location.assign(href)
  },
  reload: () => {
    reloading = true
    window.location.reload()
  },
})
app.use(router)

// Core says the caller is not signed in (the session lapsed, or was revoked):
// forget them and go to the sign-in page, coming back here afterwards.
onUnauthenticated(() => {
  const session = useSessionStore()
  const wasSignedIn = session.status === 'signedIn'
  session.clear()
  const current = router.currentRoute.value
  if (wasSignedIn && !current.meta.public) {
    router.push({ name: 'login', query: { next: current.fullPath, expired: '1' } })
  }
})

// Someone else set the caller's password since this page loaded (an
// instructor's reset): Core refuses everything until they set their own, and
// the page that sets it comes next, keeping where they were.
onPasswordChangeRequired(() => {
  const session = useSessionStore()
  if (session.status === 'mustChangePassword') return
  session.requirePasswordChange()
  const current = router.currentRoute.value
  // Before the first page is open, the router's guard takes them there itself.
  if (current.name === 'change-password' || !current.matched.length) return
  router.push({ name: 'change-password', query: current.fullPath !== '/' ? { next: current.fullPath } : {} })
})

/**
 * The first page could not be opened: the loading screen says so, in the
 * reader's language, and offers to load the page again. Mounting would only
 * replace it with an empty page, since there is no route to show.
 */
function showBootFailure() {
  const boot = document.querySelector<HTMLElement>('#app .boot')
  if (!boot) return
  const say = (selector: string, key: string) => {
    const el = boot.querySelector(selector)
    if (el) el.textContent = i18n.global.t(key)
  }
  say('.boot__failed-title', 'common.errors.title')
  say('.boot__failed-text', 'common.errors.network')
  say('.boot__retry', 'common.actions.retry')
  boot.setAttribute('aria-busy', 'false')
  boot.classList.add('boot--failed')
}

// index.html shows a loading screen in #app until the first page can be
// shown: mounting replaces it once the first navigation has settled (the
// sign-in check answered and the page's code loaded), rather than leaving an
// empty frame meanwhile. If that navigation failed, the screen stays: it says
// so, unless a reload to a newer build is already under way.
router.isReady().then(
  () => app.mount('#app'),
  () => {
    if (!reloading) showBootFailure()
  },
)
