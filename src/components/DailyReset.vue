<script setup lang="ts">
// When the agent runtime's daily counts start again, on the reader's own
// clock with their time zone named ("08:00 (Hong Kong Standard Time)"), and
// the exact instant in UTC on hover. since is the start of the day the
// runtime is counting, where its answer names one (nextDailyReset). It moves
// on to the next one by itself within half a minute of the reset passing,
// for a page left open with no fresh since (the settings, a new agent).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNow } from '@/composables/useNow'
import { useUiStore } from '@/stores/ui'
import { formatTime, formatUtc, timeZoneName } from '@/utils/format'
import { nextDailyReset } from '@/utils/dailyReset'

const props = defineProps<{ since?: string | null }>()
const { t } = useI18n()
const ui = useUiStore()
const now = useNow()
const at = computed(() => nextDailyReset(props.since, now.value))
// Recomputed when the language changes, so that the zone's name follows it.
const shown = computed(
  () => (ui.locale, t('common.time.dailyReset', { time: formatTime(at.value), zone: timeZoneName(at.value) })),
)
</script>

<template>
  <el-tooltip :content="formatUtc(at)" placement="top">
    <time class="daily-reset" :datetime="at">{{ shown }}</time>
  </el-tooltip>
</template>

<style scoped>
.daily-reset {
  font-variant-numeric: tabular-nums;
}
</style>
