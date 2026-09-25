<script setup lang="ts">
// A timestamp: absolute, with the relative time on hover (or the other way round).
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { formatDateTime, fromNow } from '@/utils/format'

const props = defineProps<{ value: string | null | undefined; relative?: boolean }>()
const ui = useUiStore()
// Recomputed when the language changes, so that "3 hours ago" follows it.
const abs = computed(() => (ui.locale, formatDateTime(props.value)))
const rel = computed(() => (ui.locale, fromNow(props.value)))
</script>

<template>
  <span v-if="!value" class="time-text">—</span>
  <el-tooltip v-else :content="relative ? abs : rel" placement="top">
    <time class="time-text" :datetime="value">{{ relative ? rel : abs }}</time>
  </el-tooltip>
</template>

<style scoped>
.time-text {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
