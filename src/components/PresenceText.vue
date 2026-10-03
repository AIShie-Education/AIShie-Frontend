<script setup lang="ts">
// Whether something runs an agent, from when it last used a token
// (last_seen_at): "Never connected", "Connected" (within a couple of
// minutes), or "Last connected 3 hours ago" with the exact time on hover.
// Only agents have it: Core records it for them alone. It is said of a
// program, in plain ink with no dot of colour, never as a person's
// "online": for its owner and those who manage it. Those who ask it are told
// whether it can be asked now (AskableText, in the chat).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNow } from '@/composables/useNow'
import { formatDateTime, fromNow } from '@/utils/format'
import { ONLINE_WITHIN_MS, presenceOf } from '@/utils/presence'

const props = withDefaults(
  defineProps<{
    /** last_seen_at as Core sends it; absent means never. */
    value: string | null | undefined
    /** How recent counts as connected. */
    withinMs?: number
  }>(),
  { withinMs: ONLINE_WITHIN_MS },
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
    <span class="presence" :class="`is-${state}`">{{ text }}</span>
  </el-tooltip>
</template>

<style scoped>
.presence {
  font-size: var(--app-text-sm);
  color: var(--app-ink-3);
  white-space: nowrap;
}
.presence.is-online {
  color: var(--app-ink-2);
}
</style>
