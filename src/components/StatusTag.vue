<script setup lang="ts">
// A tag for one of Core's fixed vocabularies: the label comes from
// enums.<vocabulary>.<value>, the colour from what the value means.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

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
  // levels
  denied: 'danger',
  confirm_required: 'warning',
  pending_review: 'primary',
  autonomous: 'success',
  // statuses
  active: 'success',
  draft: 'info',
  archived: 'info',
  suspended: 'danger',
  paused: 'warning',
  removed: 'info',
  expired: 'info',
  proposed: 'warning',
  approved: 'primary',
  rejected: 'danger',
  // Sent back for changes: over, as a rejection is, but not refused; its proposer may propose again.
  changes_requested: 'warning',
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
  // agents
  course: 'primary',
  personal: 'primary',
  agent: 'primary',
  human: 'info',
  system: 'warning',
  root: 'danger',
  admin: 'warning',
}

const label = computed(() => {
  if (!props.value) return '—'
  const key = `enums.${props.vocab}.${props.value}`
  return te(key) ? t(key) : props.value
})
const type = computed<TagType>(() => (props.value && COLORS[props.value]) || 'info')
</script>

<template>
  <el-tag :type="type" :size="size ?? 'small'" disable-transitions>{{ label }}</el-tag>
</template>
