<script setup lang="ts">
// One group of the course's agents (course agents, personal assistants, or
// agents nobody owns): who each is and whose, what it was seated as, how it
// runs (hosted on AIshie, and whether it can be asked now, or MCP access, so
// that students never ask it there), when it was last connected (where the
// caller may know), how its replies go out, and pausing, resuming and
// removing it. A course agent's replies can be switched
// here (member.update_perms, conversation_answer); what its owner's seat
// allows caps it, as Core does, and a way of replying above the seat's
// ceiling (perm_ceilings) is offered greyed out, saying why. Those who decide
// actions here open each answering agent's conversation log from its row.
import { computed, h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { AutonomyLevel, Preset } from '@/api/types'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AgentBadge from '@/components/AgentBadge.vue'
import AgentName from '@/components/AgentName.vue'
import HostingTag from '@/components/HostingTag.vue'
import MemberName from '@/components/MemberName.vue'
import PresenceText from '@/components/PresenceText.vue'
import StatusTag from '@/components/StatusTag.vue'
import { aboveCeiling, ceilingNote, ceilingsOf } from '@/utils/ceilings'
import RefusalAlert from '@/views/course/members/components/RefusalAlert.vue'
import { presetLabel } from '@/views/course/members/components/seat'
import { levelRank, notAskable, presenceFor, REPLY_LEVELS, type AgentGroup, type CourseAgentRow } from './courseAgents'

const props = defineProps<{
  courseId: string
  group: AgentGroup
  rows: CourseAgentRow[]
  presetsById: Map<string, Preset>
  /** When the caller's own agents were last seen, by actor id (agent.list). */
  myAgents: Map<string, string | null>
  /** When the agents the caller may ask were last seen, by member id (conversation.respondents). */
  askable: Map<string, string | null>
}>()
const emit = defineEmits<{
  changed: [status: 'executed' | 'proposed', actionId: string]
  /** Open the agent's conversation log. */
  log: [agent: { id: string; display_name: string }]
}>()
const { t } = useI18n()
const course = useCourseStore()
const session = useSessionStore()

const canManage = computed(() => course.can('member_manage') && course.writable)
/** Those who decide actions read what the members they oversee asked the agents. */
const canOversee = computed(() => course.can('action_decide'))
/** An agent that answers questions, or a course agent (whose log stays when its replies are off). */
const answers = (r: CourseAgentRow) => r.group === 'course' || r.ownAnswer !== 'denied'
const approval = computed(() => course.needsApproval('member_manage'))

function presetText(r: CourseAgentRow): string | null {
  const p = r.member.preset_id ? props.presetsById.get(r.member.preset_id) : undefined
  return p ? presetLabel(p) : null
}
function isMine(r: CourseAgentRow): boolean {
  return !!r.member.owner_actor_id && r.member.owner_actor_id === session.me?.id
}
function presence(r: CourseAgentRow) {
  return presenceFor(r.member, props.myAgents, props.askable)
}
/** Raising a level is a grant: offered only up to the caller's own level, where that is known. */
function aboveMine(l: AutonomyLevel): boolean {
  return course.permsSource === 'exact' && levelRank(l) > levelRank(course.level('conversation_answer'))
}
/** Above what the agent's seat may hold at all, whoever grants it; and why, in words. */
function aboveCap(r: CourseAgentRow, l: AutonomyLevel): boolean {
  return aboveCeiling(ceilingsOf(r.member), 'conversation_answer', l)
}
function capNote(r: CourseAgentRow): string {
  return ceilingNote(ceilingsOf(r.member), 'conversation_answer') ?? ''
}

// --- Replies -----------------------------------------------------------------
const replyWrite = useWrite('member.update_perms')
const replyBusy = ref<string | null>(null)
const replyError = ref<{ id: string; error: NonNullable<typeof replyWrite.lastError.value> } | null>(null)

async function setReplies(r: CourseAgentRow, v: AutonomyLevel) {
  if (v === r.ownAnswer) return
  replyBusy.value = r.member.id
  replyError.value = null
  const out = await replyWrite.run(
    { course_id: props.courseId, member_id: r.member.id, perms: { conversation_answer: v } },
    { notify: false },
  )
  replyBusy.value = null
  if (!out) {
    if (replyWrite.lastError.value) replyError.value = { id: r.member.id, error: replyWrite.lastError.value }
    return
  }
  announce(out, { success: t('courseAgents.replies.saved', { name: r.member.display_name }) })
  emit('changed', out.status, out.actionId)
}

// --- Pause, resume, remove -------------------------------------------------
const pauseWrite = useWrite('member.pause')
const resumeWrite = useWrite('member.resume')
const removeWrite = useWrite('member.remove')
const rowError = ref<{ id: string; error: NonNullable<typeof pauseWrite.lastError.value> } | null>(null)
const busy = ref<string | null>(null)

async function confirm(title: string, paragraphs: string[], ok: string, danger = false): Promise<boolean> {
  const all = approval.value ? [...paragraphs, t('members.detail.approvalNote')] : paragraphs
  try {
    await ElMessageBox.confirm(
      h(
        'div',
        all.map((p) => h('p', { style: 'margin: 0 0 8px; line-height: 1.6' }, p)),
      ),
      title,
      {
        type: 'warning',
        confirmButtonText: ok,
        cancelButtonText: t('common.actions.cancel'),
        confirmButtonClass: danger ? 'el-button--danger' : undefined,
      },
    )
    return true
  } catch {
    return false
  }
}

async function onCommand(r: CourseAgentRow, cmd: 'pause' | 'resume' | 'remove') {
  const name = r.member.display_name
  const w = cmd === 'pause' ? pauseWrite : cmd === 'resume' ? resumeWrite : removeWrite
  const texts =
    cmd === 'remove'
      ? [t('members.detail.remove.confirm', { name }), t('courseAgents.row.removeAgent')]
      : cmd === 'pause'
        ? [t('members.detail.pause.confirm', { name })]
        : [t('members.detail.resume.confirm', { name })]
  const ok = await confirm(t(`members.detail.${cmd}.title`), texts, t(`members.detail.${cmd}.action`), cmd === 'remove')
  if (!ok) return
  busy.value = r.member.id
  rowError.value = null
  const out = await w.run({ course_id: props.courseId, member_id: r.member.id }, { notify: false })
  busy.value = null
  if (!out) {
    if (w.lastError.value) rowError.value = { id: r.member.id, error: w.lastError.value }
    return
  }
  announce(out, { success: t(`members.detail.${cmd}.success`, { name }) })
  emit('changed', out.status, out.actionId)
}
</script>

<template>
  <ul class="agent-list">
    <!-- The avatar, then one column: every line of the row starts at the name's left edge. -->
    <li v-for="r in rows" :key="r.member.id" class="agent-row" :class="{ 'is-gone': !r.live }">
      <AgentAvatar :name="r.member.display_name" class="agent-row__avatar" />
      <div class="agent-row__body">
        <div class="agent-row__main">
          <div class="agent-row__name">
            <router-link :to="{ name: 'course-member', params: { courseId, memberId: r.member.id } }">
              <AgentName :name="r.member.display_name" />
            </router-link>
            <AgentBadge :owner-name="r.member.owner_name" :mine="isMine(r)" no-ai />
            <StatusTag v-if="r.member.status !== 'active'" vocab="memberStatus" :value="r.member.status" />
            <el-tag v-else-if="!r.live" size="small" type="info">{{ t('members.expired') }}</el-tag>
            <HostingTag :hosting="r.member.hosting" :site-chat="r.member.site_chat" />
          </div>
          <div class="agent-row__meta">
            <span v-if="presetText(r)">{{ presetText(r) }}</span>
            <template v-if="r.principal || r.member.principal_member_id">
              <span class="agent-row__dot" aria-hidden="true">·</span>
              <span>
                {{ t('courseAgents.row.actsFor') }}
                <router-link
                  :to="{ name: 'course-member', params: { courseId, memberId: r.member.principal_member_id } }"
                >
                  <MemberName :id="r.member.principal_member_id" />
                </router-link>
              </span>
            </template>
            <span class="agent-row__dot" aria-hidden="true">·</span>
            <PresenceText v-if="presence(r).known" :value="presence(r).value" />
            <el-tooltip v-else :content="t('courseAgents.row.presenceUnknownHelp')" placement="top">
              <span class="app-muted">{{ t('courseAgents.row.presenceUnknown') }}</span>
            </el-tooltip>
          </div>
          <p v-if="group === 'course' && r.live && notAskable(r.member)" class="agent-row__not-askable">
            {{ t(`courseAgents.row.notAskable.${notAskable(r.member)}`) }}
          </p>
        </div>

        <div
          v-if="r.live && r.member.status !== 'removed' && (group === 'course' || r.answer !== 'denied')"
          class="agent-row__replies"
        >
          <span class="agent-row__label">{{ t('courseAgents.replies.label') }}</span>
          <el-select
            v-if="group === 'course' && canManage"
            :model-value="r.ownAnswer"
            size="small"
            class="agent-row__select"
            :loading="replyBusy === r.member.id"
            :disabled="!!replyBusy"
            :aria-label="t('courseAgents.replies.label')"
            popper-class="agent-reply-popper"
            @update:model-value="(v: AutonomyLevel) => setReplies(r, v)"
          >
            <el-option
              v-for="l in REPLY_LEVELS"
              :key="l"
              :value="l"
              :label="t(`courseAgents.replies.options.${l}`)"
              :disabled="aboveMine(l) || aboveCap(r, l)"
            >
              <el-tooltip
                :disabled="!aboveCap(r, l)"
                :content="capNote(r)"
                placement="left"
                popper-class="app-tip-wrap"
                :show-after="150"
              >
                <div class="agent-row__option">
                  <span>
                    <el-icon v-if="aboveCap(r, l)" class="agent-row__lock"><Lock /></el-icon>
                    {{ t(`courseAgents.replies.options.${l}`) }}
                  </span>
                  <span class="agent-row__option-help">{{ t(`courseAgents.replies.optionHelp.${l}`) }}</span>
                </div>
              </el-tooltip>
            </el-option>
          </el-select>
          <StatusTag v-else vocab="answerLevel" :value="r.answer" />
          <el-tooltip v-if="r.answerCapped" :content="t('courseAgents.replies.cappedHelp')" placement="top">
            <el-tag size="small" type="warning" effect="plain">
              {{ t('courseAgents.replies.capped', { level: t(`courseAgents.replies.options.${r.answer}`) }) }}
            </el-tag>
          </el-tooltip>
        </div>

        <div
          v-if="(canOversee && answers(r)) || (canManage && r.live && r.member.status !== 'removed')"
          class="agent-row__actions"
        >
          <el-button
            v-if="canOversee && answers(r)"
            size="small"
            class="agent-row__log"
            @click="emit('log', { id: r.member.id, display_name: r.member.display_name })"
          >
            <el-icon aria-hidden="true"><ChatLineSquare /></el-icon>
            <span>{{ t('courseAgents.log.open') }}</span>
          </el-button>
          <el-dropdown
            v-if="canManage && r.live && r.member.status !== 'removed'"
            trigger="click"
            @command="(c: 'pause' | 'resume' | 'remove') => onCommand(r, c)"
          >
            <el-button size="small" :loading="busy === r.member.id" :aria-label="t('courseAgents.row.more')">
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="r.member.status === 'active'" command="pause">
                  <el-icon><VideoPause /></el-icon>{{ t('members.detail.pause.action') }}
                </el-dropdown-item>
                <el-dropdown-item v-if="r.member.status === 'paused'" command="resume">
                  <el-icon><VideoPlay /></el-icon>{{ t('members.detail.resume.action') }}
                </el-dropdown-item>
                <el-dropdown-item command="remove" divided>
                  <el-icon><Delete /></el-icon>{{ t('members.detail.remove.action') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <RefusalAlert
          v-if="replyError?.id === r.member.id"
          :error="replyError.error"
          class="agent-row__error"
          @close="replyError = null"
        />
        <RefusalAlert
          v-if="rowError?.id === r.member.id"
          :error="rowError.error"
          class="agent-row__error"
          @close="rowError = null"
        />
      </div>
    </li>
  </ul>
</template>

<style scoped>
.agent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.agent-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.agent-row__avatar {
  margin-top: -2px;
}
.agent-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.agent-row:last-child {
  border-bottom: none;
}
.agent-row.is-gone {
  opacity: 0.6;
}
.agent-row__main {
  flex: 1 1 260px;
  min-width: 0;
}
.agent-row__name {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-weight: 500;
  min-width: 0;
}
.agent-row__name a {
  text-decoration: none;
  overflow-wrap: anywhere;
}
.agent-row__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.agent-row__meta a {
  text-decoration: none;
}
.agent-row__dot {
  color: var(--el-text-color-placeholder);
}
.agent-row__not-askable {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-warning-dark-2);
}
.agent-row__replies {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.agent-row__label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.agent-row__select {
  width: 220px;
  max-width: 100%;
}
.agent-row__lock {
  vertical-align: -2px;
  margin-right: 2px;
}
.agent-row__option {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
  padding: 4px 0;
  white-space: normal;
}
.agent-row__option-help {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.agent-row__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.agent-row__actions .el-button + .el-dropdown {
  margin-left: 0;
}
.agent-row__error {
  flex: 1 1 100%;
}
</style>

<style>
/* The reply options carry a line of help, taller than an option's usual height (the list is teleported). */
.agent-reply-popper .el-select-dropdown__item {
  height: auto;
  max-width: 320px;
}
</style>
