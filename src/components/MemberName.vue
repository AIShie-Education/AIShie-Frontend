<script setup lang="ts">
// A course member by name, where the caller may read the member list; else
// "you" for the caller's own seat and a short id for anyone else. With
// show-kind, an agent is shown as one: its avatar before the name and "AI"
// after it. `agent`: the seat is known to be the caller's own agent, by the
// name it has (agent.list), where the member list cannot say so.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import AgentAvatar from './AgentAvatar.vue'
import AiBadge from './AiBadge.vue'
import IdText from './IdText.vue'

const props = defineProps<{ id: string | null | undefined; showKind?: boolean; agent?: { name: string | null } }>()
const course = useCourseStore()
const { t } = useI18n()
onMounted(() => void course.ensureMembers())

const isMe = computed(() => !!props.id && props.id === course.myMemberId)
const member = computed(() => (props.id ? course.members.get(props.id) : undefined))
const name = computed(() => course.memberName(props.id) ?? props.agent?.name ?? null)
const agent = computed(() => props.showKind && (member.value?.kind === 'agent' || !!props.agent))
</script>

<template>
  <span v-if="!id">—</span>
  <span v-else-if="name" class="member-name" :class="{ 'is-agent': agent }" :title="id">
    <AgentAvatar v-if="agent" :name="name" size="small" />
    {{ name }}
    <AiBadge v-if="agent" />
    <span v-if="isMe" class="member-name__me">({{ t('common.labels.you') }})</span>
  </span>
  <IdText v-else :id="id" />
</template>

<style scoped>
.member-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.member-name__me {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
/* The avatar and the "AI" stand a little apart from the name. */
.member-name.is-agent {
  gap: 6px;
}
</style>
