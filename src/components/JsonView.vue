<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ value: unknown; maxHeight?: string }>()
const text = computed(() => {
  if (props.value === undefined) return ''
  try {
    return JSON.stringify(props.value, null, 2)
  } catch {
    return String(props.value)
  }
})
</script>

<template>
  <pre class="json-view" :style="{ maxHeight: maxHeight ?? '420px' }">{{ text }}</pre>
</template>

<style scoped>
/* A listing, as aishie.app sets one: a rule above it and below, no ground and no corners. */
.json-view {
  margin: 0;
  padding: var(--app-space-md) 0;
  border-top: var(--app-rule);
  border-bottom: var(--app-rule);
  font-family: var(--app-font-mono);
  font-size: var(--app-text-xs);
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
