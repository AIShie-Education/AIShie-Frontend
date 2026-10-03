<script setup lang="ts">
// Adding a course agent: one of the caller's own agents (agent.list), or one
// made here (agent.create, asking how it runs, for good: students ask it on
// the site only when it is hosted on AIshie), brought in as the caller's
// delegate with the course_tutor preset, answering the course
// (member.add_delegate with answers_course, said outright). One with MCP
// access may be brought in too, and the dialog says that nobody can ask it
// on the site. What it would hold is shown first, as Core works it out
// (member.delegate_defaults): the preset clipped to the caller's own seat.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { PERMS, type AgentHosting, type AgentSummary, type DelegateDefaults, type Perm } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { announce, useWrite } from '@/composables/useWrite'
import { errorMessage } from '@/composables/useErrors'
import { useCourseStore } from '@/stores/course'
import { delegateArgsFor, hostingOf } from '@/utils/agents'
import HostingChoice from '@/components/HostingChoice.vue'
import AgentName from '@/components/AgentName.vue'
import PresenceText from '@/components/PresenceText.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import RefusalAlert from '@/views/course/members/components/RefusalAlert.vue'
import { countedAgents, createBlock, knownAgentLimit, noteAgentList } from '@/views/account/components/agents/agents'
import { levelOf } from './courseAgents'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  courseId: string
  /** Actors with a seat here already: not offered. */
  seatedActorIds: Set<string>
}>()
const emit = defineEmits<{
  done: [outcome: { status: 'executed'; memberId: string } | { status: 'proposed'; actionId: string }]
}>()
const { t } = useI18n()
const course = useCourseStore()

/** What a course agent is seated with: the course_tutor preset, answering the course. */
const SEAT = delegateArgsFor('course')

const mode = ref<'existing' | 'create'>('existing')
const agentId = ref('')
const newName = ref('')
/** How the agent made here runs: chosen by the caller, never for them. */
const newHosting = ref<AgentHosting | ''>('')
/** An agent made here whose seating has not gone through yet: tried again, it is not made twice. */
const created = ref<{ id: string; name: string } | null>(null)

const agents = useAsync<AgentSummary[]>(
  () =>
    read('agent.list', {}).then((o) => {
      noteAgentList(o)
      return o.agents ?? []
    }),
  { immediate: false },
)
/** Why a new agent cannot be made here now: only an administrator registers them, or the caller is at the limit. */
const createBlocked = computed(() => (agents.data.value ? createBlock(countedAgents(agents.data.value)) : null))
const createBlockedText = computed(() =>
  createBlocked.value === 'atLimit'
    ? t('agents.limit.reached', { limit: knownAgentLimit.value ?? 0 })
    : createBlocked.value === 'noSelfService'
      ? t('agents.limit.noSelfService')
      : '',
)
const defaults = useAsync<DelegateDefaults>(
  () => read('member.delegate_defaults', { course_id: props.courseId, preset: SEAT.preset }),
  { immediate: false },
)

watch(open, (v) => {
  if (!v) return
  mode.value = 'existing'
  agentId.value = ''
  newName.value = ''
  newHosting.value = ''
  created.value = null
  createWrite.lastError.value = null
  addWrite.lastError.value = null
  void agents.reload()
  void defaults.reload()
})

function unavailable(a: AgentSummary): string | null {
  if (props.seatedActorIds.has(a.actor_id)) return t('courseAgents.addDialog.alreadyHere')
  if (a.status !== 'active') return t('courseAgents.addDialog.suspended')
  return null
}
const choices = computed(() => agents.data.value ?? [])
const available = computed(() => choices.value.filter((a) => !unavailable(a)))
// With nothing to choose from, making one is the way.
watch(
  () => agents.data.value,
  (list) => {
    if (list && !available.value.length && !created.value && !createBlocked.value) mode.value = 'create'
  },
)
watch(createBlocked, (b) => {
  if (b && mode.value === 'create' && !created.value) mode.value = 'existing'
})

/** What it would hold that is not denied, in the ladder's order of permissions. */
const granted = computed(() => {
  const d = defaults.data.value
  if (!d) return []
  return PERMS.filter((p) => levelOf(d.perms, p) !== 'denied').map((p) => ({
    perm: p as Perm,
    level: levelOf(d.perms, p),
  }))
})
const readsNobody = computed(
  () => defaults.data.value?.student_scope === 'listed' && !(defaults.data.value.listed_students ?? []).length,
)
const level = computed(() => defaults.data.value?.level ?? course.level('agent_delegate'))
const needsApproval = computed(() => level.value === 'confirm_required')

const createWrite = useWrite('agent.create')
const addWrite = useWrite('member.add_delegate')
const pending = computed(() => createWrite.pending.value || addWrite.pending.value)
const chosenName = computed(() =>
  mode.value === 'create'
    ? newName.value.trim()
    : (choices.value.find((a) => a.actor_id === agentId.value)?.display_name ?? ''),
)
const ready = computed(() =>
  mode.value === 'create'
    ? !createBlocked.value &&
      !!newName.value.trim() &&
      newName.value.trim().length <= 200 &&
      !!newHosting.value
    : !!agentId.value,
)
/** The agent chosen, or being made, has MCP access: nobody can ask it on the site. */
const chosenMcp = computed(() =>
  mode.value === 'create'
    ? newHosting.value === 'mcp'
    : hostingOf(choices.value.find((a) => a.actor_id === agentId.value)?.hosting) === 'mcp',
)

async function submit() {
  if (!ready.value || pending.value) return
  let actorId = agentId.value
  if (mode.value === 'create') {
    const name = newName.value.trim()
    const hosting = newHosting.value
    if (created.value && created.value.name === name) actorId = created.value.id
    else {
      if (!hosting) return
      const out = await createWrite.run({ display_name: name, hosting }, { notify: false })
      if (!out || out.status !== 'executed') return
      created.value = { id: out.result.actor_id, name }
      actorId = out.result.actor_id
      void agents.reload()
    }
  }
  const out = await addWrite.run({ course_id: props.courseId, actor_id: actorId, ...SEAT }, { notify: false })
  if (!out) {
    // The new agent exists now: a second try seats it rather than making another.
    if (created.value) {
      mode.value = 'existing'
      agentId.value = created.value.id
    }
    return
  }
  announce(out, { success: t('courseAgents.addDialog.success', { name: chosenName.value }) })
  open.value = false
  if (out.status === 'executed') emit('done', { status: 'executed', memberId: out.result.member_id })
  else emit('done', { status: 'proposed', actionId: out.actionId })
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('courseAgents.addDialog.title')"
    width="600px"
    destroy-on-close
    append-to-body
    class="add-agent"
  >
    <el-alert type="info" :closable="false" class="add-agent__explain">
      <template #title>{{ t('courseAgents.addDialog.explainTitle') }}</template>
      <p class="add-agent__p">{{ t('courseAgents.addDialog.explain') }}</p>
      <p class="add-agent__p">{{ t('courseAgents.addDialog.explainBound') }}</p>
    </el-alert>

    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('courseAgents.addDialog.source')">
        <el-radio-group v-model="mode">
          <el-radio-button value="existing">{{ t('courseAgents.addDialog.existing') }}</el-radio-button>
          <el-radio-button value="create" :disabled="!!createBlocked && !created">
            {{ t('courseAgents.addDialog.create') }}
          </el-radio-button>
        </el-radio-group>
        <div v-if="createBlocked && !created" class="app-form-hint add-agent__stack">{{ createBlockedText }}</div>
      </el-form-item>

      <el-form-item v-if="mode === 'existing'" :label="t('courseAgents.addDialog.pick')" for="add-agent-pick">
        <div v-loading="agents.loading.value && !agents.data.value" class="add-agent__stack">
          <el-alert
            v-if="agents.error.value"
            type="error"
            :closable="false"
            show-icon
            :title="t('courseAgents.addDialog.loadFailed')"
            :description="errorMessage(agents.error.value)"
          >
            <el-button size="small" @click="agents.reload">{{ t('common.actions.retry') }}</el-button>
          </el-alert>
          <el-select
            v-else
            id="add-agent-pick"
            v-model="agentId"
            class="add-agent__select"
            :placeholder="t('courseAgents.addDialog.pickPlaceholder')"
            :no-data-text="createBlocked ? t('courseAgents.addDialog.noneAvailable') : t('courseAgents.addDialog.none')"
            popper-class="add-agent-popper"
          >
            <el-option
              v-for="a in choices"
              :key="a.actor_id"
              :value="a.actor_id"
              :label="a.display_name"
              :disabled="!!unavailable(a)"
            >
              <div class="add-agent__option">
                <AgentName :name="a.display_name" ellipsis class="add-agent__option-name" />
                <span v-if="unavailable(a)" class="add-agent__option-meta">{{ unavailable(a) }}</span>
                <PresenceText v-else :value="a.last_seen_at" />
              </div>
            </el-option>
          </el-select>
          <div v-if="agents.data.value && !available.length" class="app-form-hint">
            {{ createBlocked ? t('courseAgents.addDialog.noneAvailable') : t('courseAgents.addDialog.none') }}
          </div>
        </div>
      </el-form-item>

      <el-form-item v-else :label="t('courseAgents.addDialog.name')" for="add-agent-name">
        <el-input
          id="add-agent-name"
          v-model="newName"
          maxlength="200"
          :placeholder="t('courseAgents.addDialog.namePlaceholder')"
          autocomplete="off"
        />
        <div class="app-form-hint">{{ t('courseAgents.addDialog.nameHelp') }}</div>
      </el-form-item>
      <el-form-item v-if="mode === 'create'" :label="t('common.agent.hosting.label')">
        <HostingChoice v-model="newHosting" />
        <div class="app-form-hint add-agent__stack">{{ t('courseAgents.addDialog.hostingHelp') }}</div>
      </el-form-item>
    </el-form>
    <el-alert
      v-if="chosenMcp && chosenName"
      type="warning"
      :closable="false"
      show-icon
      class="add-agent__alert add-agent__mcp"
      :title="t('courseAgents.addDialog.mcpPicked', { name: chosenName })"
    />

    <h4 class="add-agent__section">{{ t('courseAgents.addDialog.preview') }}</h4>
    <p class="app-form-hint add-agent__section-hint">{{ t('courseAgents.addDialog.previewHelp') }}</p>
    <div v-loading="defaults.loading.value && !defaults.data.value" class="add-agent__preview">
      <el-alert
        v-if="defaults.error.value"
        :type="defaults.error.value.isForbidden ? 'warning' : 'error'"
        :closable="false"
        show-icon
        class="add-agent__alert"
        :title="
          defaults.error.value.isForbidden
            ? t('courseAgents.addDialog.noAgentDelegate')
            : errorMessage(defaults.error.value)
        "
      >
        <el-button v-if="!defaults.error.value.isForbidden" size="small" @click="defaults.reload">
          {{ t('common.actions.retry') }}
        </el-button>
      </el-alert>
      <dl v-if="defaults.data.value" class="add-agent__facts">
        <div>
          <dt>{{ t('courseAgents.addDialog.can') }}</dt>
          <dd class="add-agent__perms">
            <span v-for="g in granted" :key="g.perm" class="add-agent__perm">
              {{ t(`enums.perm.${g.perm}`) }} <StatusTag vocab="level" :value="g.level" />
            </span>
            <span v-if="!granted.length" class="app-muted">{{ t('common.labels.none') }}</span>
          </dd>
        </div>
        <div>
          <dt>{{ t('courseAgents.addDialog.work') }}</dt>
          <dd>
            <template v-if="readsNobody">{{ t('courseAgents.addDialog.readsNobody') }}</template>
            <template v-else-if="defaults.data.value.student_scope === 'all'">{{
              t('members.scope.all.students')
            }}</template>
            <template v-else>{{
              t('members.scope.listedN', { n: (defaults.data.value.listed_students ?? []).length })
            }}</template>
          </dd>
        </div>
        <div>
          <dt>{{ t('members.columns.expires') }}</dt>
          <dd>
            <TimeText v-if="defaults.data.value.expires_at" :value="defaults.data.value.expires_at" cutoff />
            <span v-else>{{ t('courseAgents.addDialog.noEnd') }}</span>
          </dd>
        </div>
      </dl>
    </div>

    <el-alert
      v-if="needsApproval"
      type="warning"
      :closable="false"
      show-icon
      class="add-agent__alert"
      :title="t('courseAgents.addDialog.needsApproval')"
    />
    <el-alert
      v-else-if="level === 'pending_review'"
      type="info"
      :closable="false"
      show-icon
      class="add-agent__alert"
      :title="t('courseAgents.addDialog.reviewedAfter')"
    />
    <el-alert
      v-if="created"
      type="success"
      :closable="false"
      show-icon
      class="add-agent__alert"
      :title="t('courseAgents.addDialog.createdNote', { name: created.name })"
    >
      <router-link :to="{ name: 'account-agent', params: { actorId: created.id } }">
        {{ t('courseAgents.addDialog.connectLink') }}
      </router-link>
    </el-alert>
    <RefusalAlert :error="createWrite.lastError.value" @close="createWrite.lastError.value = null" />
    <RefusalAlert :error="addWrite.lastError.value" @close="addWrite.lastError.value = null" />

    <template #footer>
      <div class="add-agent__footer">
        <span class="app-form-hint add-agent__connect">{{ t('courseAgents.addDialog.connect') }}</span>
        <span class="app-toolbar__spacer" />
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="pending" :disabled="!ready || !course.writable" @click="submit">
          {{ needsApproval ? t('courseAgents.addDialog.submitProposal') : t('courseAgents.addDialog.submit') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.add-agent__explain {
  margin-bottom: 16px;
}
.add-agent__explain :deep(.el-alert__title) {
  font-size: 14px;
}
.add-agent__p {
  margin: 4px 0 0;
  line-height: 1.6;
}
.add-agent__select {
  width: 100%;
}
.add-agent__stack {
  width: 100%;
}
.add-agent__preview {
  min-height: 48px;
}
.add-agent__option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.add-agent__option-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.add-agent__option-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.add-agent__section {
  margin: 8px 0 2px;
  font-size: 14px;
  font-weight: 600;
}
.add-agent__section-hint {
  margin: 0 0 8px;
}
.add-agent__facts {
  margin: 0 0 12px;
}
.add-agent__facts > div {
  display: grid;
  grid-template-columns: minmax(96px, 30%) minmax(0, 1fr);
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  align-items: baseline;
}
.add-agent__facts dt {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.add-agent__facts dd {
  margin: 0;
  font-size: 14px;
  min-width: 0;
}
.add-agent__perms {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.add-agent__perm {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.add-agent__alert {
  margin-bottom: 12px;
}
.add-agent__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.add-agent__connect {
  text-align: left;
  flex: 1 1 200px;
}
@media (max-width: 600px) {
  .add-agent__facts > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
}
</style>

<style>
/* A chosen agent's presence sits beside its name in the (teleported) list. */
.add-agent-popper .el-select-dropdown__item {
  max-width: 560px;
}
</style>
