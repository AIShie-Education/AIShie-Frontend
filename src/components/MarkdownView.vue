<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { renderMarkdown } from '@/utils/markdown'
import { copyText } from '@/utils/clipboard'
import AppEmpty from './AppEmpty.vue'
// Typeset TeX and highlighted code (utils/markdownMath.ts, markdownCode.ts).
import 'katex/dist/katex.min.css'
import '@/styles/markdown-rich.css'
const props = defineProps<{
  source: string | null | undefined
  empty?: string
  /** Fenced code in a box with its language and a button that copies it (the chat's). */
  codeTools?: boolean
  /**
   * A text version's pages and slides get ids, this prefix and their number
   * (text-page-3), to be gone to (pageHeadings in utils/markdown lists them).
   */
  anchors?: string
}>()
const { t } = useI18n()
const html = computed(() =>
  renderMarkdown(props.source, {
    ...(props.codeTools ? { code: { copy: t('common.actions.copy') } } : {}),
    ...(props.anchors ? { anchors: props.anchors } : {}),
  }),
)

/** How long a copy button says it copied. */
const COPIED_MS = 1600

/** A copy button over a block of code: the code under it, copied; the button says so for a moment. */
async function onClick(e: MouseEvent) {
  const button = (e.target as Element | null)?.closest?.<HTMLButtonElement>('button[data-md-copy]')
  if (!button) return
  const code = button.closest('.md-code')?.querySelector('pre code, pre')
  if (!code) return
  const ok = await copyText(code.textContent ?? '')
  if (!ok) return
  button.textContent = t('common.actions.copied')
  button.classList.add('is-copied')
  window.setTimeout(() => {
    if (!button.isConnected) return
    button.textContent = t('common.actions.copy')
    button.classList.remove('is-copied')
  }, COPIED_MS)
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitised in renderMarkdown -->
  <div v-if="html" class="markdown-body" :class="{ 'has-code-tools': codeTools }" @click="onClick" v-html="html" />
  <!-- Nothing written: said as every empty place says it (AppEmpty), in its size and ink. -->
  <AppEmpty v-else-if="empty" :text="empty" class="markdown-empty" />
</template>
