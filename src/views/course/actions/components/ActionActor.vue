<script setup lang="ts">
// Who made an action: the seat by name (an agent with its avatar and "AI"),
// or, for a row made from no seat (the system's sweeps, a platform
// administrator), the actor.
// The caller's own agent is named from their agents where the member list
// cannot be read (an owner who decides nothing else finds its proposals in
// the queues all the same), and marked as theirs.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AgentBadge from '@/components/AgentBadge.vue'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import { useMyAgents } from './myAgents'

const props = defineProps<{ memberId?: string | null; actorId?: string | null }>()
const course = useCourseStore()
const session = useSessionStore()
const myAgents = useMyAgents()
const { t } = useI18n()
onMounted(() => {
  void course.ensureMembers()
  if (props.actorId) void myAgents.ensure()
})

const member = computed(() => (props.memberId ? course.members.get(props.memberId) : undefined))
/** One of the caller's own agents. */
const mine = computed(
  () =>
    myAgents.has(props.actorId) || (!!member.value?.owner_actor_id && member.value.owner_actor_id === session.me?.id),
)
/** The caller's agent's name, where the seat's cannot be read. */
const agentName = computed(() => (!course.memberName(props.memberId) ? myAgents.nameOf(props.actorId) : null))
</script>

<template>
  <span class="action-actor">
    <template v-if="memberId && agentName">
      <span class="action-actor__agent" :title="memberId">
        <AgentAvatar :name="agentName" size="small" />{{ agentName }}
      </span>
      <AgentBadge mine />
    </template>
    <template v-else-if="memberId">
      <MemberName :id="memberId" show-kind />
      <AgentBadge v-if="mine" mine no-ai />
    </template>
    <template v-else>
      <el-tooltip :content="t('actions.summary.noActor')" placement="top">
        <el-icon class="action-actor__system"><Monitor /></el-icon>
      </el-tooltip>
      <IdText :id="actorId" />
    </template>
  </span>
</template>

<style scoped>
.action-actor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.action-actor__system {
  color: var(--el-text-color-secondary);
}
.action-actor__agent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
