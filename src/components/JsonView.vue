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
.json-view {
  margin: 0;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: var(--app-radius-control);
  font-family: var(--app-font-mono);
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
