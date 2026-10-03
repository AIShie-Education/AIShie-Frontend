<script setup lang="ts">
// A tag for one of Core's fixed vocabularies (an AppTag): the label comes
// from enums.<vocabulary>.<value>, its look from what the value is.
// - A state is a pill whose colour says an outcome alone (docs/CONVENTIONS.md,
//   "Colour"): done in green (executed, approved), refused, failed or missing
//   in red, waiting on someone in amber (proposed, late, a grade not yet
//   posted), anything else neutral.
// - The usual state of a thing (an active seat or course, work submitted, a
//   grade posted, a conversation open or answered) is quiet: the third ink's
//   plain text, no pill, so that what departs from it stands out.
// - A category (a role, a kind of actor, seat or document, a scope, a
//   preset, a platform role) is an identity, not a state: outlined, with its
//   icon, in no colour.
// - A level of autonomy is told by its mark and its weight, never by red and
//   green: denied a lock, neutral; confirm_required a raised hand, on the
//   indigo's tint; pending_review an eye, outlined in ink; autonomous a
//   bolt, solid ink, the heaviest for the level that leaves an agent most to
//   itself.
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { Collection, Document, Filter, Key, Operation, Setting, User } from '@element-plus/icons-vue'
import AgentSeatIcon from './AgentSeatIcon.vue'
import AppTag, { type TagTone } from './AppTag.vue'
import LevelIcon from './LevelIcon.vue'

export type Vocabulary =
  | 'level'
  | 'role'
  | 'scope'
  | 'actorKind'
  | 'platformRole'
  | 'actorStatus'
  | 'courseStatus'
  | 'memberStatus'
  | 'actionStatus'
  | 'reviewState'
  | 'documentKind'
  | 'documentStatus'
  | 'submissionState'
  | 'gradeState'
  | 'gradeOrigin'
  | 'credentialKind'
  | 'preset'
  | 'seatPurpose'
  | 'conversationState'
  | 'conversationStatus'
  | 'answerLevel'

const props = defineProps<{ vocab: Vocabulary; value: string | null | undefined; size?: 'small' | 'default' | 'large' }>()
const { t, te } = useI18n()

/** What each value of a state says, wherever it is a state. */
const TONES: Record<string, TagTone> = {
  // done
  approved: 'done',
  executed: 'done',
  reviewed: 'done',
  // refused, failed, missing
  suspended: 'danger',
  rejected: 'danger',
  // an action Core refused (actionStatus); the level of the same name never comes here
  denied: 'danger',
  failed: 'danger',
  escalated: 'danger',
  missing: 'danger',
  // waiting on someone
  paused: 'wait',
  proposed: 'wait',
  // Sent back for changes: not refused, it waits on its proposer, who may propose again.
  changes_requested: 'wait',
  pending: 'wait',
  late: 'wait',
  awaiting_answer: 'wait',
  reply_pending_approval: 'wait',
}
/** Where a vocabulary says a value differently: a grade not yet posted waits on its grader. */
const TONES_IN: Partial<Record<Vocabulary, Record<string, TagTone>>> = {
  gradeState: { draft: 'wait' },
}
/** The usual state of a thing, in plain text: only what departs from it is a pill. */
const QUIET: Partial<Record<Vocabulary, readonly string[]>> = {
  actorStatus: ['active'],
  courseStatus: ['active'],
  memberStatus: ['active'],
  documentStatus: ['active'],
  submissionState: ['submitted'],
  gradeState: ['posted'],
  gradeOrigin: ['entered'],
  conversationState: ['answered'],
  conversationStatus: ['open'],
}
/** Vocabularies of kinds, not states, each with its icon (by value, for the kinds of actor). */
const CATEGORIES: Partial<Record<Vocabulary, { icon: Component } | { iconOf: (value: string) => Component }>> = {
  role: { icon: User },
  scope: { icon: Filter },
  actorKind: { iconOf: (v) => (v === 'agent' ? AgentSeatIcon : v === 'system' ? Setting : User) },
  platformRole: { icon: Key },
  seatPurpose: { icon: AgentSeatIcon },
  documentKind: { icon: Document },
  preset: { icon: Collection },
  credentialKind: { icon: Key },
  gradeOrigin: { icon: Operation },
}

/** Vocabularies whose values are autonomy levels. */
const LEVELS: readonly Vocabulary[] = ['level', 'answerLevel']

const label = computed(() => {
  if (!props.value) return '—'
  const key = `enums.${props.vocab}.${props.value}`
  return te(key) ? t(key) : props.value
})
const level = computed(() => (props.value && LEVELS.includes(props.vocab) ? props.value : null))
const quiet = computed(() => !!props.value && !!QUIET[props.vocab]?.includes(props.value))
const icon = computed<Component | null>(() => {
  const c = CATEGORIES[props.vocab]
  if (!c || !props.value) return null
  return 'icon' in c ? c.icon : c.iconOf(props.value)
})
const tone = computed<TagTone>(() => {
  const v = props.value
  if (!v) return 'neutral'
  return TONES_IN[props.vocab]?.[v] ?? TONES[v] ?? 'neutral'
})
</script>

<template>
  <AppTag v-if="level" :class="['app-level-tag', `is-${level}`]" :size="size ?? 'small'">
    <LevelIcon :level="level" />{{ label }}
  </AppTag>
  <AppTag v-else-if="quiet" variant="quiet" :class="`is-${value}`">{{ label }}</AppTag>
  <AppTag v-else-if="icon" variant="outline" :icon="icon" :size="size ?? 'small'">{{ label }}</AppTag>
  <AppTag v-else :tone="tone" :size="size ?? 'small'">{{ label }}</AppTag>
</template>
