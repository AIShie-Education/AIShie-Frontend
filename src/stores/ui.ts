import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { i18n, setLocale, type Locale } from '@/i18n'

export type Theme = 'auto' | 'light' | 'dark'
const THEME_KEY = 'aishiteru.theme'

function savedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    /* no storage */
  }
  return 'auto'
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>(savedTheme())
  const locale = ref<Locale>(i18n.global.locale.value as Locale)

  const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  const dark = ref(false)

  function apply() {
    dark.value = theme.value === 'dark' || (theme.value === 'auto' && !!media?.matches)
    document.documentElement.classList.toggle('dark', dark.value)
  }
  media?.addEventListener('change', apply)
  watch(
    theme,
    (t) => {
      try {
        localStorage.setItem(THEME_KEY, t)
      } catch {
        /* the choice lasts for this page only */
      }
      apply()
    },
    { immediate: true },
  )

  watch(locale, (l) => setLocale(l))

  return { theme, dark, locale }
})
