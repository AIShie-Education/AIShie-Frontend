<script setup lang="ts">
// A tag for one of Core's fixed vocabularies: the label comes from
// enums.<vocabulary>.<value>, the colour from what the value means. Colour
// says an outcome alone (docs/CONVENTIONS.md, "Colour"): done in green
// (executed, posted, approved), refused or failed in red, waiting on someone
// in amber. A category (a role, a platform role, a kind of actor or seat) is
// neutral. A level of autonomy is told by its mark and its weight, never by
// red and green: denied a lock, neutral; confirm_required a raised hand, on
// the indigo's tint; pending_review an eye, outlined in ink; autonomous a
// bolt, solid ink, the heaviest for the level that leaves an agent most to
// itself.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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

type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'
const COLORS: Record<string, TagType> = {
  // statuses
  active: 'success',
  draft: 'info',
  archived: 'info',
  suspended: 'danger',
  paused: 'warning',
  removed: 'info',
  expired: 'info',
  proposed: 'warning',
  approved: 'success',
  rejected: 'danger',
  // Sent back for changes: not refused, it waits on its proposer, who may propose again; amber.
  changes_requested: 'warning',
  // an action Core refused (actionStatus); the level of the same name never comes here
  denied: 'danger',
  cancelled: 'info',
  executed: 'success',
  failed: 'danger',
  none: 'info',
  pending: 'warning',
  reviewed: 'success',
  escalated: 'danger',
  submitted: 'success',
  late: 'warning',
  missing: 'danger',
  posted: 'success',
  superseded: 'info',
  // conversations
  open: 'success',
  closed: 'info',
  awaiting_answer: 'warning',
  reply_pending_approval: 'warning',
  answered: 'success',
  // categories (kinds of actor and seat, platform roles) are neutral: no entry
}

/** Vocabularies whose values are autonomy levels. */
const LEVELS: readonly Vocabulary[] = ['level', 'answerLevel']

const label = computed(() => {
  if (!props.value) return '—'
  const key = `enums.${props.vocab}.${props.value}`
  return te(key) ? t(key) : props.value
})
const type = computed<TagType>(() => (props.value && COLORS[props.value]) || 'info')
const level = computed(() => (props.value && LEVELS.includes(props.vocab) ? props.value : null))
</script>

<template>
  <el-tag v-if="level" :class="['app-level-tag', `is-${level}`]" :size="size ?? 'small'" disable-transitions>
    <LevelIcon :level="level" />{{ label }}
  </el-tag>
  <el-tag v-else :type="type" :size="size ?? 'small'" disable-transitions>{{ label }}</el-tag>
</template>
