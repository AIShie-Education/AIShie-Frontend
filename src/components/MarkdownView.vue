<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
// Typeset TeX and highlighted code (utils/markdownMath.ts, markdownCode.ts).
import 'katex/dist/katex.min.css'
import '@/styles/markdown-rich.css'
const props = defineProps<{ source: string | null | undefined; empty?: string }>()
const html = computed(() => renderMarkdown(props.source))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitised in renderMarkdown -->
  <div v-if="html" class="markdown-body" v-html="html" />
  <p v-else class="markdown-empty">{{ empty ?? '' }}</p>
</template>

<style scoped>
.markdown-empty {
  color: var(--el-text-color-secondary);
  margin: 0;
}
</style>
