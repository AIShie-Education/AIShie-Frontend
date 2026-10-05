<script setup lang="ts">
// How a member's score was given from their group's, in words: the group's
// score, a score of their own, the group's plus or minus some points, or
// moved by peer evaluation. With `reason`, the grader's reason after it,
// which the member reads with their grade; with `by`, who set it, which
// Core gives those who grade alone.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MemberName from '@/components/MemberName.vue'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatPct } from '@/utils/format'
import { formatScore } from '@/views/course/grades/components/grading'
import { isNegative, magnitude, type Adjustment } from './groupGrading'

const props = defineProps<{
  adjustment: Adjustment | null | undefined
  /** Say the reason after it. */
  reason?: boolean
  /** Say who set it, where Core says. */
  by?: boolean
  /** Say what peer evaluation's was worked out from. */
  detail?: boolean
}>()
const { t } = useI18n()
const ui = useUiStore()

const a = computed(() => props.adjustment ?? null)
const how = computed(() => {
  const x = a.value
  if (!x) return t('groupGrading.adjustment.none')
  const points = formatScore(magnitude(x.points))
  if (x.kind === 'replace') return t('groupGrading.adjustment.replace', { points })
  if (x.kind === 'delta')
    return isNegative(x.points)
      ? t('groupGrading.adjustment.minus', { points })
      : t('groupGrading.adjustment.plus', { points })
  if (x.kind === 'peer') {
    if (Number(x.points) === 0) return t('groupGrading.adjustment.peerEven')
    return isNegative(x.points)
      ? t('groupGrading.adjustment.peerMinus', { points })
      : t('groupGrading.adjustment.peerPlus', { points })
  }
  return t('groupGrading.adjustment.other', { points: formatScore(x.points) })
})
const peerDetail = computed(() => {
  const d = a.value?.kind === 'peer' ? a.value.detail : null
  if (!props.detail || !d) return null
  return (
    ui.locale,
    t('groupGrading.adjustment.peerDetail', {
      factor: formatDecimal(d.factor, 2),
      weight: formatPct(Number(d.weight) / 100),
    })
  )
})
const reasonText = computed(() => (props.reason ? (a.value?.reason ?? '').trim() : ''))
</script>

<template>
  <span class="adjustment-text">
    <span class="adjustment-text__how">{{ how }}</span>
    <span v-if="peerDetail" class="adjustment-text__detail">{{ peerDetail }}</span>
    <span v-if="reasonText" class="adjustment-text__reason">{{
      t('common.pair', { label: t('groupGrading.adjustment.reason'), value: reasonText })
    }}</span>
    <i18n-t
      v-if="by && a?.by_member_id"
      keypath="groupGrading.adjustment.by"
      tag="span"
      scope="global"
      class="adjustment-text__by"
    >
      <template #name><MemberName :id="a.by_member_id" show-kind /></template>
    </i18n-t>
  </span>
</template>

<style scoped>
.adjustment-text {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.adjustment-text__detail,
.adjustment-text__by {
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
}
.adjustment-text__reason {
  color: var(--app-ink-2);
}
</style>
