<script setup lang="ts">
// Under a proposed answer's text (conversation.answer), the course materials
// it says it relied on (its sources, AIShie-Core#69), as the proposal keeps
// them: by id alone, so they are counted, not named. A material is counted
// once however many of its pages, files or versions are named: two pages of
// one lecture are one material. Core checks each again when the answer is
// approved, and every reader is then shown them as they may open them, which
// the line says on hover, focus or a tap. An empty list says it relied on
// none (a neutral pill, as the chat shows); without one the answer does not
// say, and nothing is shown.
import AppTag from '@/components/AppTag.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ payload: Record<string, unknown> }>()
const { t } = useI18n()

/** How many materials it names, each document once (0: none); null where it does not say. */
const n = computed(() => {
  const sources = props.payload.sources
  if (!Array.isArray(sources)) return null
  const ids = new Set<unknown>()
  sources.forEach((s, i) => {
    const id = s && typeof s === 'object' ? (s as { document_id?: unknown }).document_id : undefined
    // One with no document is counted as one of its own.
    ids.add(typeof id === 'string' && id ? id : i)
  })
  return ids.size
})
</script>

<template>
  <el-tooltip
    v-if="n"
    :content="t('actions.answer.sourcesTip')"
    :trigger="['hover', 'focus']"
    placement="top"
    popper-class="app-tip-wrap"
  >
    <p class="answer-sources" tabindex="0">
      {{ t('actions.answer.sources', { n }, n) }}
    </p>
  </el-tooltip>
  <AppTag v-else-if="n === 0" class="answer-sources">
    {{ t('actions.answer.noSources') }}
  </AppTag>
</template>

<style scoped>
.answer-sources {
  align-self: flex-start;
}
p.answer-sources {
  margin: 0;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
</style>
