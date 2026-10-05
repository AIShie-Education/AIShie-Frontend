<script setup lang="ts">
// What a decision or review came to, said plainly: carried out (and what it
// made), failed (and Core's words why), rejected, sent back for changes,
// cancelled (and why it could no longer be carried out), or itself waiting
// for approval; a proposal taken back; and, where the caller decided as the
// owner of the agent that proposed it, that it was their own doing
// (by_owner). An outcome in a colour is an alert (docs/CONVENTIONS.md, "Notes
// and alerts"): carried out or reviewed in green, failed in red, cancelled,
// sent back or escalated in amber. One that is none of those (rejected, a
// decision waiting for approval, taken back) is a note, as the action's own
// page says a rejection, never Element Plus's grey box with its ⓘ.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppNote from '@/components/AppNote.vue'
import OutcomeLines from './OutcomeLines.vue'
import { isObject } from './actionText'
import type { DecideResult, Done } from './decide'

const props = defineProps<{
  courseId: string
  done: Done
  closable?: boolean
  /** The kind of action decided (its action_type): its refusals are said in the words of the page that makes it. */
  actionType?: string | null
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

/** What a decision may come to: the proposal's status after it. */
const OUTCOMES = ['executed', 'failed', 'rejected', 'changes_requested', 'cancelled']

/** How it is drawn: an alert of an outcome's colour, or a note. */
type Tone = 'success' | 'warning' | 'error' | 'note'
const view = computed<{ tone: Tone; title: string }>(() => {
  const d = props.done
  switch (d.kind) {
    case 'decided': {
      const o = d.out.outcome
      // What finally happened: a decision about a decision ends in the outcome of the one beneath.
      const last = inner.value?.outcome ?? o
      const tone =
        last === 'executed'
          ? 'success'
          : last === 'failed'
            ? 'error'
            : last === 'cancelled' || last === 'changes_requested'
              ? 'warning'
              : 'note'
      return { tone, title: t(`actions.outcome.${OUTCOMES.includes(o) ? o : 'executed'}`) }
    }
    case 'proposed':
      return { tone: 'note', title: t('actions.outcome.proposed') }
    case 'reviewed':
      return { tone: d.state === 'escalated' ? 'warning' : 'success', title: t(`actions.outcome.${d.state}`) }
    case 'withdrawn':
      return { tone: 'note', title: t('actions.outcome.withdrawn') }
  }
  return { tone: 'note', title: '' }
})

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
</script>

<template>
  <AppNote
    v-if="view.tone === 'note'"
    :title="view.title"
    :closable="!!closable"
    class="outcome-alert"
    @close="emit('close')"
  >
    <OutcomeLines :course-id="courseId" :done="done" :inner="inner" :action-type="actionType" />
  </AppNote>
  <el-alert
    v-else
    :type="view.tone === 'success' ? 'success' : view.tone === 'error' ? 'error' : 'warning'"
    :title="view.title"
    show-icon
    :closable="!!closable"
    class="outcome-alert"
    @close="emit('close')"
  >
    <OutcomeLines :course-id="courseId" :done="done" :inner="inner" :action-type="actionType" />
  </el-alert>
</template>
