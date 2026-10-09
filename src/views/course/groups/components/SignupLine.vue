<script setup lang="ts">
// A set's sign-up in a line (group_set.list and .get's `signup`): whether
// students may sign themselves up to its groups now and until when, or why
// not. With `countdown`, the time left is counted down on the server's
// clock (useCountdown), in days and hours while there are days, and as a
// clock in the last hour; once it runs out, `ended` is said, for the page to
// read the set again.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppTag from '@/components/AppTag.vue'
import TimeText from '@/components/TimeText.vue'
import { useCountdown } from '@/composables/useCountdown'
import { useUiStore } from '@/stores/ui'
import { formatCountdown } from '@/utils/countdown'
import { formatList } from '@/utils/format'
import type { GroupSet } from './groupModel'

const props = defineProps<{
  signup: GroupSet['signup']
  /** Count the time left down, live. */
  countdown?: boolean
  /** Words for staff, who place students themselves, rather than for a student. */
  staff?: boolean
}>()
const emit = defineEmits<{ ended: [] }>()
const { t } = useI18n()
const ui = useUiStore()

const counting = computed(() => (props.signup.joinable && props.signup.closes_at) || null)
const { remaining, ended } = useCountdown(() => counting.value)
watch(ended, (now, before) => {
  if (now && before === false && props.signup.closes_at) emit('ended')
})

const HOUR = 3600_000
const DAY = 24 * HOUR
/** What is left, in words: days and hours, hours and minutes, or a clock in the last hour. */
const left = computed(() => {
  void ui.locale
  const ms = remaining.value
  if (ms >= DAY) {
    const d = Math.floor(ms / DAY)
    const h = Math.floor((ms % DAY) / HOUR)
    const parts = [t('groups.signup.days', { n: d }, d)]
    if (h) parts.push(t('groups.signup.hours', { n: h }, h))
    return formatList(parts)
  }
  if (ms >= HOUR) {
    const h = Math.floor(ms / HOUR)
    const m = Math.floor((ms % HOUR) / 60_000)
    const parts = [t('groups.signup.hours', { n: h }, h)]
    if (m) parts.push(t('groups.signup.minutes', { n: m }, m))
    return formatList(parts)
  }
  return formatCountdown(ms)
})

/** Why students may not sign up now. */
const closedWords = computed(() => {
  const s = props.signup
  switch (s.reason) {
    case 'set_archived':
      return t('groups.signup.why.set_archived')
    case 'course_archived':
      return t('groups.signup.why.course_archived')
  }
  if (!s.open) return props.staff ? t('groups.signup.why.offStaff') : t('groups.signup.why.off')
  return null
})
</script>

<template>
  <span class="signup-line">
    <template v-if="signup.joinable">
      <AppTag tone="indigo">{{ t('groups.signup.open') }}</AppTag>
      <i18n-t v-if="signup.closes_at" keypath="groups.signup.until" tag="span" scope="global">
        <template #at><TimeText :value="signup.closes_at" cutoff /></template>
      </i18n-t>
      <span v-else>{{ t('groups.signup.noDeadline') }}</span>
      <span v-if="countdown && signup.closes_at" class="signup-line__left" role="timer" aria-live="off">
        {{ t('groups.signup.remaining', { time: left }) }}
      </span>
    </template>
    <template v-else>
      <AppTag>{{ t('groups.signup.closed') }}</AppTag>
      <span v-if="closedWords">{{ closedWords }}</span>
      <i18n-t v-else-if="signup.closes_at" keypath="groups.signup.closedAt" tag="span" scope="global">
        <template #at><TimeText :value="signup.closes_at" cutoff /></template>
      </i18n-t>
    </template>
  </span>
</template>

<style scoped>
.signup-line {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.signup-line__left {
  color: var(--app-ink-2);
  font-variant-numeric: tabular-nums;
}
</style>
