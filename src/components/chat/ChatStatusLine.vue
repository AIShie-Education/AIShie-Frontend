<script setup lang="ts">
// What is under way, as an agent chat says it while it works: a small glyph
// turning (ChatSpinner), what it is doing ("Thinking…"), and how long it
// has been at it, in seconds from `since` (a time on Core's clock), then
// minutes and seconds. A note may follow (its answers wait for approval).
// The seconds are for the eye: a screen reader is told the words, once, not
// every tick.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { coreNow } from '@/api/clock'
import ChatSpinner from './ChatSpinner.vue'

const props = defineProps<{
  label: string
  /** When the work began (milliseconds, on Core's clock); the time is not shown without it. */
  since?: number | null
  sub?: string | null
}>()
const { t } = useI18n()

const now = ref(coreNow())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  tick = setInterval(() => (now.value = coreNow()), 1000)
})
onBeforeUnmount(() => clearInterval(tick))

const seconds = computed(() =>
  props.since == null || !Number.isFinite(props.since)
    ? null
    : Math.max(0, Math.floor((now.value - props.since) / 1000)),
)
const elapsed = computed(() => {
  const s = seconds.value
  if (s === null) return ''
  if (s < 60) return t('chat.status.seconds', { s })
  return t('chat.status.minutes', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') })
})
</script>

<template>
  <div class="chat-status" role="status">
    <ChatSpinner class="chat-status__glyph" />
    <span class="chat-status__label">{{ label }}</span>
    <span v-if="elapsed" class="chat-status__time" aria-hidden="true">{{ elapsed }}</span>
    <span v-if="sub" class="chat-status__sub">· {{ sub }}</span>
  </div>
</template>

<style scoped>
.chat-status {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 7px;
  min-height: 24px;
  padding: 2px 2px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--app-ink-3);
}
/* The words, with a light passing over them, as an agent chat's working line. */
.chat-status__label {
  background: linear-gradient(
    90deg,
    var(--app-ink-3) 0%,
    var(--app-ink-3) 35%,
    var(--app-ink) 50%,
    var(--app-ink-3) 65%,
    var(--app-ink-3) 100%
  );
  background-size: 250% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: chat-status-shine 2.4s linear infinite;
}
.chat-status__time {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}
.chat-status__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
@keyframes chat-status-shine {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -150% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-status__label {
    animation: none;
    background: none;
    color: var(--app-ink-3);
  }
}
</style>
