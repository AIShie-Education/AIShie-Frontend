<script setup lang="ts">
// A course member by name, where the caller may read the member list; else
// "you" for the caller's own seat. Anyone else is a short id to those who may
// read the list (the member removed since, say), and "someone in the course"
// to those who may not, with no id at all, not even in a tooltip (a touch
// screen or a keyboard cannot reach one, and a screen reader would read the
// whole id out): an id is nothing they could look up, and a hash where the
// activity says who approved would read as if it had. What they quote is the
// action, whose id its page shows, and which tells whoever reads the action
// log who it was (docs/CONVENTIONS.md, short ids). With show-kind, an agent
// is shown as one: its avatar before the name and "AI" after it. `agent`: the
// seat is known to be an agent, by the name it has elsewhere (the caller's
// own in agent.list or in its proposal, the one a conversation is with in
// conversation.get), where the member list cannot say so.
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
/** The caller's seat may not read the member list: an id is nothing they could look up. */
const unnamable = computed(() => course.level('member_read') === 'denied' || course.membersState === 'forbidden')
</script>

<template>
  <span v-if="!id">—</span>
  <span v-else-if="name" class="member-name" :class="{ 'is-agent': agent }" :title="id">
    <AgentAvatar v-if="agent" :name="name" size="small" />
    <!-- 「（你）」 is with the name, not a flex item after it: the gap would part them. -->
    <span
      >{{ name }}<span v-if="isMe" class="member-name__me app-you">{{ t('common.labels.youTag') }}</span></span
    >
    <AiBadge v-if="agent" />
  </span>
  <span v-else-if="unnamable" class="member-name is-unnamed">{{ t('common.labels.someMember') }}</span>
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
