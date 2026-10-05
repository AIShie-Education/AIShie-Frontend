<script setup lang="ts">
// What OutcomeAlert says under its title, whichever frame it is in: where the
// caller decided as the owner of the agent that proposed it, that it was
// their own doing (by_owner); why it failed or was cancelled, in the app's
// words for the kind of action decided, and Core's where it has none; the
// proposal a decision about a decision decided, and what became of it; what
// was made; and, of a decision that itself waits for approval, where to
// follow it.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import IdText from '@/components/IdText.vue'
import AgentSeatIcon from '@/components/AgentSeatIcon.vue'
import MaybeLink from './MaybeLink.vue'
import ResultIds from './ResultIds.vue'
import { reasonText, reasonWords, routeFor } from './actionText'
import type { DecideResult, Done } from './decide'

const props = defineProps<{
  courseId: string
  done: Done
  /** Of a decision about a decision: the one beneath, as the result says it (OutcomeAlert reads it). */
  inner: DecideResult | null
  /** The kind of action decided (its action_type). */
  actionType?: string | null
}>()
const { t } = useI18n()

const error = computed(() => (props.done.kind === 'decided' ? (props.done.out.error ?? null) : null))
const why = computed(() => reasonText(error.value, props.actionType))
/** Said in the app's words alone: Core's message, written for agents, is then not shown beside them. */
const worded = computed(() => !!reasonWords(error.value, props.actionType))
const innerWhy = computed(() => reasonText(props.inner?.error ?? null))
const innerWorded = computed(() => !!reasonWords(props.inner?.error ?? null))
/** Decided, reviewed or taken back as the owner of the agent that did it. */
const asOwner = computed(() => {
  const d = props.done
  if (d.kind === 'decided') return d.out.by_owner === true
  if (d.kind === 'reviewed' || d.kind === 'withdrawn') return d.byOwner === true
  return false
})
</script>

<template>
  <div class="outcome-alert__body">
    <p v-if="asOwner" class="outcome-alert__line outcome-alert__owner">
      <el-icon><AgentSeatIcon /></el-icon>
      {{
        done.kind === 'withdrawn'
          ? t('actions.outcome.withdrawnAsOwner')
          : done.kind === 'reviewed'
            ? t('actions.outcome.reviewedAsOwner')
            : t('actions.outcome.decidedAsOwner')
      }}
    </p>
    <template v-if="done.kind === 'decided'">
      <p v-if="why" class="outcome-alert__line">{{ why }}</p>
      <p v-if="error && !worded" class="outcome-alert__line outcome-alert__core">
        {{ t('common.pair', { label: t('actions.outcome.coreSays'), value: error.message }) }}
        <code>{{ error.code }}</code>
      </p>
      <template v-if="inner">
        <p class="outcome-alert__line outcome-alert__inner">
          {{ t('actions.outcome.inner', { what: t(`actions.outcome.${inner.outcome}`) }) }}
          <MaybeLink :to="routeFor(courseId, 'action', inner.action_id)"><IdText :id="inner.action_id" /></MaybeLink>
        </p>
        <p v-if="innerWhy" class="outcome-alert__line">{{ innerWhy }}</p>
        <p v-if="inner.error && !innerWorded" class="outcome-alert__line outcome-alert__core">
          {{ t('common.pair', { label: t('actions.outcome.coreSays'), value: inner.error.message }) }}
          <code>{{ inner.error.code }}</code>
        </p>
        <ResultIds v-if="inner.outcome === 'executed'" :course-id="courseId" :result="inner.result" />
      </template>
      <ResultIds v-else-if="done.out.outcome === 'executed'" :course-id="courseId" :result="done.out.result" />
    </template>
    <template v-else-if="done.kind === 'proposed'">
      <p class="outcome-alert__line">{{ t('actions.decision.willBeProposal') }}</p>
      <span class="outcome-alert__line">
        <router-link :to="{ name: 'course-action', params: { courseId, actionId: done.actionId } }">
          {{ t('actions.decision.viewDecision') }}
        </router-link>
        <IdText :id="done.actionId" />
      </span>
    </template>
  </div>
</template>

<style scoped>
.outcome-alert__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* Nothing more to say than the title: no room kept under it. */
.outcome-alert__body:empty {
  display: none;
}
.outcome-alert__line {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.outcome-alert__inner {
  font-weight: 500;
}
.outcome-alert__core {
  word-break: break-word;
}
.outcome-alert__core code {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-mark);
  opacity: 0.8;
}
</style>
