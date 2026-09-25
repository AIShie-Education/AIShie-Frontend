import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIcons from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/main.css'

import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { onUnauthenticated } from './api/http'
import { useSessionStore } from './stores/session'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(ElementPlus)
for (const [name, component] of Object.entries(ElementPlusIcons)) {
  app.component(name, component)
}
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

app.mount('#app')
