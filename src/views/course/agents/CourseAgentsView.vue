<script setup lang="ts">
// A course's agents, for those who manage its members: every agent seated
// here (member.list), grouped into course agents, people's personal
// assistants and agents nobody owns; adding a course agent (one of the
// caller's own, member.add_delegate with course_tutor); how each course
// agent's replies go out; and whether students may bring their own agents or
// start conversations (member.update_perms_bulk, role student). Those who
// decide actions here, whether or not they manage the members, read each
// answering agent's conversation log.
import { computed, markRaw, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { ActionSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import AgentSeatIcon from '@/components/AgentSeatIcon.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import AppNote from '@/components/AppNote.vue'
import StatusTag from '@/components/StatusTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import { usePresets } from '@/views/course/members/components/seat'
import AddCourseAgentDialog from './components/AddCourseAgentDialog.vue'
import AgentConversationLog from './components/AgentConversationLog.vue'
import AgentList from './components/AgentList.vue'
import StudentPolicyCard from './components/StudentPolicyCard.vue'
import { AGENT_GROUPS, agentRows, isLive, loadAllMembers, type AgentGroup } from './components/courseAgents'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const session = useSessionStore()
const presets = usePresets()

const canManage = computed(() => course.can('member_manage'))
const canOversee = computed(() => course.can('action_decide'))

// The conversation log of one agent, made the first time one is opened.
const logAgent = ref<{ id: string; display_name: string } | null>(null)
const logOpen = ref(false)
function openLog(agent: { id: string; display_name: string }) {
  logAgent.value = agent
  logOpen.value = true
}

const members = useAsync(() => loadAllMembers(props.courseId), { watch: [() => props.courseId], keepData: true })
const all = computed(() => members.data.value?.members ?? [])
const rows = computed(() => agentRows(all.value, presets.byId.value))
const groups = computed(() =>
  AGENT_GROUPS.map((g) => ({ group: g, rows: rows.value.filter((r) => r.group === g) })).filter(
    (g) => g.group === 'course' || g.rows.length,
  ),
)
const seatedActorIds = computed(() => new Set(all.value.filter((m) => isLive(m)).map((m) => m.actor_id)))

// When agents were last connected, where the caller may know: their own
// (agent.list), and those they may ask (conversation.respondents). Neither is
// needed for the page, so a refusal or failure only leaves presence unknown.
const mine = useAsync(
  async () => {
    if (session.me?.kind !== 'human') return new Map<string, string | null>()
    const out = await read('agent.list', {}).catch(() => ({ agents: [] }))
    return new Map((out.agents ?? []).map((a) => [a.actor_id, a.last_seen_at ?? null]))
  },
  { keepData: true },
)
const askable = useAsync(
  async () => {
    if (!course.can('conversation_ask')) return new Map<string, string | null>()
    const out = await read('conversation.respondents', { course_id: props.courseId }).catch(() => ({
      respondents: [],
    }))
    return new Map((out.respondents ?? []).map((r) => [r.member_id, r.last_seen_at ?? null]))
  },
  { keepData: true },
)

// Requests to bring an agent in that wait for a decision, for those who decide
// them. The queue is oldest first and has no type filter: a few pages are read.
const QUEUE_PAGES = 3
const requests = useAsync(
  async () => {
    if (!course.can('action_decide')) return 0
    let n = 0
    let after: string | undefined
    for (let i = 0; i < QUEUE_PAGES; i++) {
      const out = await read('action.list_proposed', { course_id: props.courseId, limit: 200, after })
      n += (out.actions ?? []).filter((a: ActionSummary) => a.action_type === 'member.add_delegate').length
      if (!out.next) break
      after = out.next
    }
    return n
  },
  { keepData: true },
)

const addOpen = ref(false)
const proposedAction = ref<string | null>(null)
const canAdd = computed(() => course.can('agent_delegate') && session.me?.kind === 'human')

async function refresh() {
  await Promise.all([members.reload(), mine.reload(), askable.reload(), requests.reload()])
}
function onChanged(status: 'executed' | 'proposed', actionId: string) {
  if (status === 'proposed') proposedAction.value = actionId
  course.invalidate('members')
  void members.reload()
  void askable.reload()
}
function onAdded(out: { status: 'executed'; memberId: string } | { status: 'proposed'; actionId: string }) {
  if (out.status === 'proposed') proposedAction.value = out.actionId
  course.invalidate('members')
  void refresh()
}

const GROUP_ICONS: Record<AgentGroup, string | Component> = {
  course: 'School',
  personal: 'User',
  unowned: markRaw(AgentSeatIcon),
}
</script>

<template>
  <div class="course-agents">
    <PageHeader :title="t('courseAgents.title')" :subtitle="t('courseAgents.subtitle')">
      <el-button :loading="members.loading.value" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.refresh') }}</span>
      </el-button>
      <template v-if="canManage && canAdd">
        <el-tooltip :content="t('common.archivedCourse')" :disabled="course.writable" placement="bottom">
          <el-button type="primary" :disabled="!course.writable" @click="addOpen = true">
            <el-icon><Plus /></el-icon>
            <span>{{ t('courseAgents.add') }}</span>
          </el-button>
        </el-tooltip>
        <StatusTag
          v-if="course.needsApproval('agent_delegate')"
          vocab="level"
          value="confirm_required"
          size="default"
        />
      </template>
    </PageHeader>

    <el-result
      v-if="!canManage && !canOversee"
      icon="warning"
      :title="t('common.errors.forbidden')"
      :sub-title="t('courseAgents.noPermission')"
    />

    <template v-else>
      <AppNote class="course-agents__notice">
        <template #title>{{ t('courseAgents.intro.title') }}</template>
        {{ t('courseAgents.intro.body') }}
      </AppNote>

      <AppNote
        v-if="proposedAction"
        :title="t('courseAgents.proposed')"
        class="course-agents__notice"
        @close="proposedAction = null"
        closable
      >
        <router-link :to="{ name: 'course-action', params: { courseId, actionId: proposedAction } }">
          {{ t('members.proposed.view') }}
        </router-link>
        ·
        <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
          t('members.proposed.mine')
        }}</router-link>
      </AppNote>

      <el-alert
        v-if="requests.data.value"
        type="warning"
        show-icon
        :closable="false"
        class="course-agents__notice"
        :title="t('courseAgents.requests', { n: requests.data.value }, requests.data.value)"
      >
        <router-link :to="{ name: 'course-approvals', params: { courseId } }">
          {{ t('courseAgents.openApprovals') }}
        </router-link>
      </el-alert>

      <AsyncState
        :loading="members.loading.value && !members.data.value"
        :error="members.data.value ? null : members.error.value"
        @retry="members.reload"
      >
        <section v-for="g in groups" :key="g.group" class="app-card">
          <h2 class="app-card__title">
            <span class="course-agents__heading">
              <el-icon><component :is="GROUP_ICONS[g.group]" /></el-icon>
              {{ t(`courseAgents.groups.${g.group}.title`) }}
              <span class="app-muted course-agents__count">{{ g.rows.length }}</span>
            </span>
          </h2>
          <p class="app-form-hint course-agents__help">{{ t(`courseAgents.groups.${g.group}.help`) }}</p>
          <AgentList
            v-if="g.rows.length"
            :course-id="courseId"
            :group="g.group"
            :rows="g.rows"
            :presets-by-id="presets.byId.value"
            :my-agents="mine.data.value ?? new Map()"
            :askable="askable.data.value ?? new Map()"
            @changed="onChanged"
            @log="openLog"
          />
          <AppEmpty v-else :text="t(`courseAgents.groups.${g.group}.empty`)">
            <el-button v-if="canManage && canAdd && course.writable" type="primary" plain @click="addOpen = true">
              {{ t('courseAgents.add') }}
            </el-button>
          </AppEmpty>
          <p v-if="g.group === 'course' && g.rows.length" class="app-form-hint course-agents__foot">
            {{ t('courseAgents.replies.help') }}
          </p>
        </section>

        <StudentPolicyCard
          v-if="canManage"
          :course-id="courseId"
          :members="all"
          :complete="members.data.value?.complete ?? true"
          @changed="onChanged"
        />
      </AsyncState>

      <AgentConversationLog v-if="logAgent" v-model="logOpen" :course-id="courseId" :agent="logAgent" />

      <AddCourseAgentDialog
        v-if="canManage && canAdd"
        v-model="addOpen"
        :course-id="courseId"
        :seated-actor-ids="seatedActorIds"
        @done="onAdded"
      />
    </template>
  </div>
</template>

<style scoped>
.course-agents__notice {
  margin-bottom: 16px;
}
.course-agents__notice :deep(.el-alert__description),
.course-agents__notice :deep(.el-alert__content) {
  line-height: 1.6;
}
.course-agents__heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.course-agents__count {
  font-weight: normal;
  font-size: 13px;
}
.course-agents__help {
  margin: -4px 0 8px;
}
.course-agents__foot {
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
@media (max-width: 600px) {
  .app-card {
    padding: 14px;
  }
}
</style>
