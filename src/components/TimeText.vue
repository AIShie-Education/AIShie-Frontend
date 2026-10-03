<script setup lang="ts">
// A timestamp: absolute, with the relative time on hover (or the other way
// round), on the reader's own clock. A cut-off (a due date, an expiry: a
// time something stops being taken) names that clock's time zone, in the
// page's language ("2026-10-08 23:59 (Hong Kong Standard Time)",
// 「香港標準時間 2026-10-08 23:59」), and gives the exact instant in UTC on
// hover, as the agent runtime's daily resets do (DailyReset). Shown relative
// ("in 5 days"), a cut-off's zone and UTC are both on hover.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { formatDateTime, formatUtc, fromNow, timeZoneName } from '@/utils/format'

const props = defineProps<{ value: string | null | undefined; relative?: boolean; cutoff?: boolean }>()
const { t } = useI18n()
const ui = useUiStore()
// Recomputed when the language changes, so that "3 hours ago" and the zone's name follow it.
const abs = computed(() => (ui.locale, formatDateTime(props.value)))
const rel = computed(() => (ui.locale, fromNow(props.value)))
const zone = computed(() => (ui.locale, props.value ? timeZoneName(props.value) : ''))
const zoned = computed(() => t('common.time.zoned', { time: abs.value, zone: zone.value }))
const utc = computed(() => formatUtc(props.value))
</script>

<template>
  <span v-if="!value" class="time-text">—</span>
  <el-tooltip v-else-if="!cutoff" :content="relative ? abs : rel" placement="top">
    <time class="time-text" :datetime="value">{{ relative ? rel : abs }}</time>
  </el-tooltip>
  <el-tooltip v-else placement="top">
    <template #content>
      <span class="time-text__tip">{{ relative ? zoned : rel }}</span>
      <span class="time-text__tip time-text__utc">{{ utc }}</span>
    </template>
    <time v-if="relative" class="time-text" :datetime="value">{{ rel }}</time>
    <!-- The time on one line; its zone may break onto the next, on a narrow page or in a narrow column. -->
    <i18n-t v-else keypath="common.time.zoned" tag="time" scope="global" class="time-text--zoned" :datetime="value">
      <template #time
        ><span class="time-text">{{ abs }}</span></template
      >
      <template #zone
        ><span class="time-text__zone">{{ zone }}</span></template
      >
    </i18n-t>
  </el-tooltip>
</template>

<style scoped>
.time-text {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.time-text__tip {
  display: block;
}
</style>
