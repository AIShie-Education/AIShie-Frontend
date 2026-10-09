<script setup lang="ts">
// A peer form in words: what members do (split 100 points, or rate on
// criteria on a scale), whether they evaluate themselves, when it opens and
// closes, how much it counts in grades, and what students see. On the
// assignment's settings card, and for a change of it waiting for approval.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatPct } from '@/utils/format'
import AppTag from '@/components/AppTag.vue'
import TimeText from '@/components/TimeText.vue'
import { criteriaOf, isRating, num, type FormLike } from './peer'

const props = defineProps<{ form: FormLike }>()
const { t } = useI18n()
const ui = useUiStore()

const rating = computed(() => isRating(props.form))
const criteria = computed(() => criteriaOf(props.form))
const weightText = computed(
  () => (
    ui.locale,
    props.form.weight > 0
      ? t('peer.summary.weightCounts', { pct: formatPct(props.form.weight / 100, 0) })
      : t('peer.summary.weightReference')
  ),
)
/** A criterion's weight, where it is not 1. */
function weightOf(w: unknown): string | null {
  const n = num(w as number | string | null | undefined)
  return Number.isFinite(n) && n !== 1 ? formatDecimal(n) : null
}
</script>

<template>
  <dl class="peer-summary">
    <div v-if="form.enabled === false" class="peer-summary__row">
      <dt>{{ t('peer.summary.status') }}</dt>
      <dd>
        <AppTag tone="wait">{{ t('peer.summary.off') }}</AppTag>
      </dd>
    </div>
    <div class="peer-summary__row">
      <dt>{{ t('peer.summary.kind') }}</dt>
      <dd>{{ rating ? t('peer.kind.rating') : t('peer.kind.share') }}</dd>
    </div>
    <div v-if="rating" class="peer-summary__row">
      <dt>{{ t('peer.summary.criteria') }}</dt>
      <dd>
        <ol class="peer-summary__criteria">
          <li v-for="c in criteria" :key="c.key">
            <span>{{ c.label }}</span>
            <span v-if="weightOf(c.weight)" class="app-muted">{{
              t('common.bracketed', { text: t('peer.summary.criterionWeight', { w: weightOf(c.weight) }) })
            }}</span>
          </li>
        </ol>
      </dd>
    </div>
    <div v-if="rating" class="peer-summary__row">
      <dt>{{ t('peer.summary.scale') }}</dt>
      <dd>{{ t('peer.summary.scaleValue', { min: form.scale_min ?? 0, max: form.scale_max ?? 0 }) }}</dd>
    </div>
    <div class="peer-summary__row">
      <dt>{{ t('peer.summary.self') }}</dt>
      <dd>{{ form.self_evaluation ? t('peer.summary.selfOn') : t('peer.summary.selfOff') }}</dd>
    </div>
    <div class="peer-summary__row">
      <dt>{{ t('peer.summary.opens') }}</dt>
      <dd>
        <TimeText v-if="form.opens === 'at' && form.opens_at" :value="form.opens_at" />
        <span v-else>{{ t('peer.summary.opensOnHandIn') }}</span>
      </dd>
    </div>
    <div class="peer-summary__row">
      <dt>{{ t('peer.summary.closes') }}</dt>
      <dd><TimeText :value="form.closes_at" cutoff /></dd>
    </div>
    <div class="peer-summary__row">
      <dt>{{ t('peer.summary.weight') }}</dt>
      <dd>{{ weightText }}</dd>
    </div>
    <div class="peer-summary__row">
      <dt>{{ t('peer.summary.students') }}</dt>
      <dd>
        {{
          form.share_with_students === 'own_average' ? t('peer.summary.studentsAverage') : t('peer.summary.studentsOwn')
        }}
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.peer-summary {
  margin: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 16px;
  font-size: var(--app-text-sm);
}
.peer-summary__row {
  display: contents;
}
.peer-summary dt {
  color: var(--app-ink-3);
}
.peer-summary dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.peer-summary__criteria {
  margin: 0;
  padding-left: 1.25em;
}
.peer-summary__criteria li + li {
  margin-top: 2px;
}
</style>
