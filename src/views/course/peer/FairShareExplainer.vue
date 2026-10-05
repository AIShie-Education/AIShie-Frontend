<script setup lang="ts">
// The fair-share factor in plain words, where a teacher reads results or
// counts them in grades: what a factor of 1, 1.2 or 0.8 means, how the
// form's weight turns it into a score (with figures: the group's score
// where there is one), that someone who wrote nothing hands nothing out,
// that a pair without self-evaluation is never moved, that a grader's own
// adjustment wins, and what each of Core's flags says.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatPct } from '@/utils/format'
import { MEMBER_FLAGS, formCounts, num, peerScore, type FormLike } from './peer'

const props = defineProps<{
  form: FormLike
  /** A group's score to work the example from; 80 of 100 where there is none. */
  groupScore?: number | string | null
  points?: number | string | null
}>()
const { t } = useI18n()
const ui = useUiStore()

const g = computed(() => {
  const n = num(props.groupScore)
  return Number.isFinite(n) ? n : 80
})
const p = computed(() => {
  const n = num(props.points)
  return Number.isFinite(n) ? n : 100
})
const counts = computed(() => formCounts(props.form))
const weightLine = computed(
  () => (
    ui.locale,
    t('peer.fair.weight', {
      weight: formatPct(props.form.weight / 100, 0),
      group: formatDecimal(g.value),
      high: formatDecimal(peerScore(g.value, props.form.weight, 1.2, p.value)),
      low: formatDecimal(peerScore(g.value, props.form.weight, 0.8, p.value)),
    })
  ),
)
/** The thresholds the flags low and high are raised at, as the page writes a percentage. */
const thresholds = computed(() => (ui.locale, { low: formatPct(0.8, 0), high: formatPct(1.2, 0) }))
</script>

<template>
  <div class="fair-share">
    <p>{{ t('peer.fair.factor', { diff: formatPct(0.2, 0) }) }}</p>
    <p v-if="counts">{{ weightLine }}</p>
    <p v-else>{{ t('peer.fair.reference') }}</p>
    <p>{{ t('peer.fair.missing') }}</p>
    <p>{{ t('peer.fair.own') }}</p>
    <h3 class="fair-share__subtitle">{{ t('peer.fair.flagsTitle') }}</h3>
    <dl class="fair-share__flags">
      <div v-for="f in MEMBER_FLAGS" :key="f" class="fair-share__flag">
        <dt>{{ t(`peer.flag.${f}`) }}</dt>
        <dd>{{ t(`peer.flagHelp.${f}`, thresholds) }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.fair-share {
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--app-ink-2);
}
.fair-share p {
  margin: 0 0 8px;
}
.fair-share__subtitle {
  margin: 12px 0 4px;
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
  color: var(--app-ink);
}
.fair-share__flags {
  margin: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 12px;
}
.fair-share__flag {
  display: contents;
}
.fair-share__flags dt {
  font-weight: var(--app-weight-strong);
  color: var(--app-ink);
}
.fair-share__flags dd {
  margin: 0;
}
</style>
