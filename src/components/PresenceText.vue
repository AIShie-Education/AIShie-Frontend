<script setup lang="ts">
// Whether an agent is connected, from when it last used a token
// (last_seen_at): "Never connected", "Online" (within a couple of minutes), or
// "Last seen 3 hours ago" with the exact time on hover. Only agents have it:
// Core records it for them alone.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNow } from '@/composables/useNow'
import { formatDateTime, fromNow } from '@/utils/format'
import { ONLINE_WITHIN_MS, presenceOf } from '@/utils/presence'

const props = withDefaults(
  defineProps<{
    /** last_seen_at as Core sends it; absent means never. */
    value: string | null | undefined
    /** How recent counts as online. */
    withinMs?: number
    /** A coloured dot before the text. */
    dot?: boolean
  }>(),
  { withinMs: ONLINE_WITHIN_MS, dot: true },
)
const { t, locale } = useI18n()
const now = useNow()

const state = computed(() => presenceOf(props.value, now.value, props.withinMs))
const text = computed(() => {
  switch (state.value) {
    case 'never':
      return t('common.presence.never')
    case 'online':
      return t('common.presence.online')
    default:
      // Recomputed as time passes and when the language changes.
      return (now.value, locale.value, t('common.presence.lastSeen', { time: fromNow(props.value) }))
  }
})
const hint = computed(() => {
  if (state.value === 'never') return t('common.presence.neverHelp')
  if (state.value === 'online') return `${t('common.presence.onlineHelp')} ${formatDateTime(props.value)}`
  return formatDateTime(props.value)
})
</script>

<template>
  <el-tooltip :content="hint" placement="top">
    <span class="presence" :class="`is-${state}`">
      <span v-if="dot" class="presence__dot" aria-hidden="true" />
      <span>{{ text }}</span>
    </span>
  </el-tooltip>
</template>

<style scoped>
.presence {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.presence.is-online {
  color: var(--el-color-success);
}
.presence__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--el-text-color-placeholder);
}
.presence.is-online .presence__dot {
  background: var(--el-color-success);
}
.presence.is-never .presence__dot {
  background: transparent;
  border: 1.5px solid var(--el-color-warning);
  box-sizing: border-box;
}
</style>
