<script setup lang="ts">
// What a decision or review came to, said plainly: carried out (and what it
// made), failed (and Core's words why), rejected, cancelled (and why it could
// no longer be carried out), or itself waiting for approval; a proposal taken
// back; and, where the caller decided as the owner of the agent that proposed
// it, that it was their own doing (by_owner).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import IdText from '@/components/IdText.vue'
import AgentSeatIcon from '@/components/AgentSeatIcon.vue'
import MaybeLink from './MaybeLink.vue'
import ResultIds from './ResultIds.vue'
import { isObject, reasonText, routeFor } from './actionText'
import type { DecideResult, Done } from './decide'

const props = defineProps<{ courseId: string; done: Done; closable?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const view = computed(() => {
  const d = props.done
  switch (d.kind) {
    case 'decided': {
      const o = d.out.outcome
      // What finally happened: a decision about a decision ends in the outcome of the one beneath.
      const last = inner.value?.outcome ?? o
      const type = last === 'executed' ? 'success' : last === 'failed' ? 'error' : last === 'cancelled' ? 'warning' : 'info'
      return { type, title: t(`actions.outcome.${o === 'executed' || o === 'failed' || o === 'rejected' || o === 'cancelled' ? o : 'executed'}`) }
    }
    case 'proposed':
      return { type: 'info', title: t('actions.outcome.proposed') }
    case 'reviewed':
      return { type: d.state === 'escalated' ? 'warning' : 'success', title: t(`actions.outcome.${d.state}`) }
    case 'withdrawn':
      return { type: 'info', title: t('actions.outcome.withdrawn') }
  }
  return { type: 'info', title: '' }
})
const error = computed(() => (props.done.kind === 'decided' ? (props.done.out.error ?? null) : null))
const why = computed(() => reasonText(error.value))

const OUTCOMES = ['executed', 'failed', 'rejected', 'cancelled']
/**
 * A decision about a decision carries out that decision, whose own outcome
 * is in the result: approving a colleague's approval can still cancel the
 * proposal underneath, and that must not read as "carried out".
 */
const inner = computed<DecideResult | null>(() => {
  if (props.done.kind !== 'decided' || props.done.out.outcome !== 'executed') return null
  const r = props.done.out.result
  if (isObject(r) && typeof r.outcome === 'string' && typeof r.action_id === 'string' && OUTCOMES.includes(r.outcome)) {
    return r as unknown as DecideResult
  }
  return null
})
const innerWhy = computed(() => reasonText(inner.value?.error ?? null))
/** Decided, reviewed or taken back as the owner of the agent that did it. */
const asOwner = computed(() => {
  const d = props.done
  if (d.kind === 'decided') return d.out.by_owner === true
  if (d.kind === 'reviewed' || d.kind === 'withdrawn') return d.byOwner === true
  return false
})
</script>

<template>
  <el-alert
    :type="view.type as 'success' | 'warning' | 'info' | 'error'"
    :title="view.title"
    show-icon
    :closable="!!closable"
    class="outcome-alert"
    @close="emit('close')"
  >
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
        <p v-if="error" class="outcome-alert__line outcome-alert__core">
          {{ t('actions.outcome.coreSays') }}: {{ error.message }} <code>{{ error.code }}</code>
        </p>
        <template v-if="inner">
          <p class="outcome-alert__line outcome-alert__inner">
            {{ t('actions.outcome.inner', { what: t(`actions.outcome.${inner.outcome}`) }) }}
            <MaybeLink :to="routeFor(courseId, 'action', inner.action_id)"><IdText :id="inner.action_id" /></MaybeLink>
          </p>
          <p v-if="innerWhy" class="outcome-alert__line">{{ innerWhy }}</p>
          <p v-if="inner.error" class="outcome-alert__line outcome-alert__core">
            {{ t('actions.outcome.coreSays') }}: {{ inner.error.message }} <code>{{ inner.error.code }}</code>
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
  </el-alert>
</template>

<style scoped>
.outcome-alert__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  font-size: 11px;
  opacity: 0.8;
}
</style>
