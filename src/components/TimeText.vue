<script setup lang="ts">
// A timestamp: absolute, with the relative time on hover (or the other way
// round), on the reader's own clock. A cut-off (a due date, an expiry: a
// time something stops being taken) is on the school's clock when me.get
// gives one, with the reader's beside it when different; without one, the
// reader's clock is named as before. The exact instant in UTC and the zoned
// time are in the accessible description as well as the tooltip, so keyboard
// and screen-reader users do not depend on hover.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { formatDateTime, formatUtc, fromNow } from '@/utils/format'
import { cutoffTimes, schoolTimeZone } from '@/utils/schoolTime'
import { zonedText } from '@/utils/parts'

const props = defineProps<{
  value: string | null | undefined
  relative?: boolean
  cutoff?: boolean
  /** A UTC-day boundary or another instant that must stay on the reader's clock even with a school zone. */
  readerOnly?: boolean
}>()
const { t } = useI18n()
const ui = useUiStore()
// Recomputed when the language changes, so that relative times and zone names follow it.
const abs = computed(() => (ui.locale, formatDateTime(props.value)))
const rel = computed(() => (ui.locale, fromNow(props.value)))
const clocks = computed(() =>
  props.value
    ? (ui.locale, cutoffTimes(props.value, props.readerOnly ? null : schoolTimeZone.value))
    : { primary: { time: '—', zone: '' }, reader: undefined },
)
const zoned = computed(() => (ui.locale, zonedText(props.value, props.readerOnly ? null : schoolTimeZone.value)))
const utc = computed(() => formatUtc(props.value))
const description = computed(() => (ui.locale, t('common.time.description', { zoned: zoned.value, utc: utc.value })))
</script>

<template>
  <span v-if="!value" class="time-text">—</span>
  <el-tooltip v-else-if="!cutoff" :content="relative ? abs : rel" placement="top">
    <time class="time-text" :datetime="value">{{ relative ? rel : abs }}</time>
  </el-tooltip>
  <el-tooltip v-else :trigger="['hover', 'focus']" placement="top">
    <template #content>
      <span class="time-text__tip">{{ relative ? zoned : rel }}</span>
      <span class="time-text__tip time-text__utc">{{ utc }}</span>
    </template>
    <time
      v-if="relative"
      class="time-text"
      :datetime="value"
      tabindex="0"
      :aria-description="description"
      >{{ rel }}</time
    >
    <!-- Each zone stays whole; it may move as one onto the next line. -->
    <i18n-t
      v-else-if="clocks.reader"
      keypath="common.time.schoolAndReader"
      tag="time"
      scope="global"
      class="time-text--zoned"
      :datetime="value"
      tabindex="0"
      :aria-description="description"
    >
      <template #school>
        <i18n-t keypath="common.time.zoned" tag="span" scope="global">
          <template #time><span class="time-text">{{ clocks.primary.time }}</span></template>
          <template #zone><span class="time-text__zone">{{ clocks.primary.zone }}</span></template>
        </i18n-t>
      </template>
      <template #reader>
        <i18n-t keypath="common.time.zoned" tag="span" scope="global">
          <template #time><span class="time-text">{{ clocks.reader.time }}</span></template>
          <template #zone><span class="time-text__zone">{{ clocks.reader.zone }}</span></template>
        </i18n-t>
      </template>
    </i18n-t>
    <i18n-t
      v-else
      keypath="common.time.zoned"
      tag="time"
      scope="global"
      class="time-text--zoned"
      :datetime="value"
      tabindex="0"
      :aria-description="description"
    >
      <template #time><span class="time-text">{{ clocks.primary.time }}</span></template>
      <template #zone><span class="time-text__zone">{{ clocks.primary.zone }}</span></template>
    </i18n-t>
  </el-tooltip>
</template>

<style scoped>
.time-text {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.time-text__zone {
  white-space: nowrap;
}
.time-text__tip {
  display: block;
}
</style>
