<script setup lang="ts">
// A seat's role, as a tag (enums.role), except for an agent seated as
// someone's delegate: Core gives such a seat the role `assistant`, whose
// label (助理, Assistant) is a person's word, the one each language no
// longer calls an agent. Its avatar and "AI" say what it is; the tag says
// which kind of agent it is instead, a course agent or a personal agent
// (seatPurpose). An agent in the role `assistant` that is nobody's delegate
// (one the administration registered) shows a dash; one seated in another
// role (a teaching assistant, say) keeps that role's tag. `hide-none`: no dash
// either, among a page header's tags, where a dash would read as a separator.
import { computed } from 'vue'
import { seatPurpose } from '@/utils/agents'
import StatusTag from './StatusTag.vue'

const props = defineProps<{
  member: {
    role: string
    kind?: string | null
    principal_member_id?: string | null
    answers_course?: boolean | null
    preset_id?: string | null
  }
  size?: 'small' | 'default' | 'large'
  hideNone?: boolean
}>()

const purpose = computed(() => {
  const m = props.member
  if (m.kind !== 'agent' || m.role !== 'assistant') return undefined
  return m.principal_member_id ? seatPurpose({ answers_course: m.answers_course }) : null
})
</script>

<template>
  <StatusTag v-if="purpose === undefined" vocab="role" :value="member.role" :size="size" />
  <StatusTag v-else-if="purpose" vocab="seatPurpose" :value="purpose" :size="size" />
  <span v-else-if="!hideNone" class="role-tag__none">—</span>
</template>

<style scoped>
.role-tag__none {
  color: var(--app-ink-3);
}
</style>
