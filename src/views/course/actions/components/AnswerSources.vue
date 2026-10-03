<script setup lang="ts">
// Under a proposed answer's text (conversation.answer), the course materials
// it says it relied on (its sources, AIShie-Core#69), as the proposal keeps
// them: by id alone, so they are counted, not named. Core checks each again
// when the answer is approved, and every reader is then shown them as they
// may open them. An empty list says it relied on none (a neutral pill, as the
// chat shows); without one the answer does not say, and nothing is shown.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ payload: Record<string, unknown> }>()
const { t } = useI18n()

/** How many it names (0: none); null where it does not say. */
const n = computed(() => (Array.isArray(props.payload.sources) ? props.payload.sources.length : null))
</script>

<template>
  <p v-if="n" class="answer-sources" :title="t('actions.answer.sourcesTip')">
    {{ t('actions.answer.sources', { n }, n) }}
  </p>
  <el-tag v-else-if="n === 0" type="info" size="small" disable-transitions class="answer-sources">
    {{ t('actions.answer.noSources') }}
  </el-tag>
</template>

<style scoped>
.answer-sources {
  align-self: flex-start;
}
p.answer-sources {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
