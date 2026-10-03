<script setup lang="ts">
// One seat in full (member.get), with the login ID a person signs in with,
// and managing it: its roster role (member.set_role), permissions
// (member.update_perms), reach and lifetime (member.rescope), pause and resume
// (member.pause / member.resume), removal (member.remove), and for a student a
// temporary password (member.reset_password). Nobody manages their own seat,
// and a removed or expired seat is only read.
import { computed, h, ref, useTemplateRef, watch, type VNode } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { User } from '@element-plus/icons-vue'
import { ApiError, read } from '@/api/http'
import { DELEGATE_NEVER_PERMS, PERMS, type AutonomyLevel, type Member, type Perm, type PermLevels } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import AppTag from '@/components/AppTag.vue'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AgentBadge from '@/components/AgentBadge.vue'
import AgentName from '@/components/AgentName.vue'
import AsyncState from '@/components/AsyncState.vue'
import HostingTag from '@/components/HostingTag.vue'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import PageHeader from '@/components/PageHeader.vue'
import PermEditor from '@/components/PermEditor.vue'
import RoleTag from '@/components/RoleTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { ceilingsOf } from '@/utils/ceilings'
import { shortId } from '@/utils/format'
import RefusalAlert from './components/RefusalAlert.vue'
import RescopeDialog from './components/RescopeDialog.vue'
import ResetPasswordDialog from './components/ResetPasswordDialog.vue'
import RoleDialog from './components/RoleDialog.vue'
import { resetPasswordOffer, roleChangeBlock } from './components/roles'
import {
  fullPerms,
  grantProblems,
  isExpired,
  permsAbove,
  presetDescription,
  presetLabel,
  rank,
  usePresets,
  type Shape,
} from './components/seat'

const props = defineProps<{ courseId: string; memberId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const session = useSessionStore()
// The seat's facts in one column, each label above its value, where the page is
// narrower than 720 px (the seat card's title 669 px or less), by its own
// width, not the window's: the side bar takes from it. Wider, two columns.
const seatTitle = useTemplateRef<HTMLElement>('seatTitle')
const narrow = useContainerNarrow(seatTitle, 669)
const presets = usePresets()

const state = useAsync<Member>(() => read('member.get', { course_id: props.courseId, member_id: props.memberId }), {
  watch: [() => props.memberId],
  keepData: true,
})
const m = computed(() => (state.data.value?.id === props.memberId ? state.data.value : undefined))

// Names for the listed students and assignments, once there is a seat to show.
watch(
  () => !!m.value,
  (loaded) => {
    if (!loaded) return
    void course.ensureMembers()
    void course.ensureAssignments()
  },
  { immediate: true },
)

// --- What this seat is, and what the caller may do to it -----------------------
const isSelf = computed(() => !!m.value && m.value.id === course.myMemberId)
const expired = computed(() => !!m.value && m.value.status !== 'removed' && isExpired(m.value.expires_at))
const live = computed(() => !!m.value && m.value.status !== 'removed' && !expired.value)
const canManage = computed(() => course.can('member_manage'))
/** Management controls are shown… */
const showManage = computed(() => canManage.value && live.value)
/** …and usable. */
const manageable = computed(() => showManage.value && !isSelf.value && course.writable)
const approval = computed(() => course.needsApproval('member_manage'))
const disabledReason = computed(() => {
  if (!course.writable) return t('common.archivedCourse')
  if (isSelf.value) return t('members.detail.selfShort')
  return ''
})

const preset = computed(() => (m.value?.preset_id ? presets.byId.value.get(m.value.preset_id) : undefined))
const perms = computed(() => fullPerms(m.value?.perms))
/** The most this seat may hold of each permission, whoever grants it, and why (Core's perm_ceilings). */
const ceilings = computed(() => ceilingsOf(m.value))
const differsFromPreset = computed(() => {
  if (!preset.value) return 0
  const base = fullPerms(preset.value.perms)
  return PERMS.filter((p) => base[p] !== perms.value[p]).length
})

const listedStudents = computed(() => m.value?.listed_students ?? [])
const listedAssignments = computed(() => m.value?.listed_assignments ?? [])
// Where to see a student's work: offered by the permission each page reads
// with (gradebook.get and grade.list need grade_read, submission.list
// submission_read) and, where the caller's own seat is known exactly, only
// for a student within its reach. A gradebook spans every assignment, so it
// also needs a reach over all of them.
const work = computed(() => {
  if (!m.value || m.value.role !== 'student') return { gradebook: false, submissions: false, grades: false }
  const mine = course.permsSource === 'exact' ? course.seat : null
  const reaches = !mine || mine.student_scope === 'all' || (mine.listed_students ?? []).includes(m.value.id)
  const allAssignments = !mine || mine.assignment_scope === 'all'
  return {
    gradebook: reaches && allAssignments && course.can('grade_read'),
    submissions: reaches && course.can('submission_read'),
    grades: reaches && course.can('grade_read'),
  }
})
const showWork = computed(() => work.value.gradebook || work.value.submissions || work.value.grades)

// --- An agent a person owns, and a person's own agents ------------------------
/** The seat is an agent's, seated as someone's delegate (its owner's seat is the principal). */
const principalId = computed(() => m.value?.principal_member_id ?? null)
/** The caller's own agent. */
const mineAgent = computed(() => !!m.value?.owner_actor_id && m.value.owner_actor_id === session.me?.id)
/** The agents seated here as this member's delegates, from the course's member list where it is readable. */
const delegates = computed(() => {
  if (!m.value || m.value.kind === 'agent') return []
  const id = m.value.id
  return [...course.members.values()].filter((x) => x.principal_member_id === id && x.status !== 'removed')
})
function presetName(id: string | null | undefined): string | null {
  const p = id ? presets.byId.value.get(id) : undefined
  return p ? presetLabel(p) : null
}

const ownWorkOnly = computed(
  () =>
    !!m.value &&
    m.value.student_scope === 'listed' &&
    listedStudents.value.length === 1 &&
    listedStudents.value[0] === m.value.id,
)

// --- Outcomes shown on the page -----------------------------------------------
const pageError = ref<ApiError | null>(null)
const proposedAction = ref<string | null>(null)
const removedResult = ref<number | null>(null)
watch(
  () => props.memberId,
  () => {
    pageError.value = null
    proposedAction.value = null
    removedResult.value = null
    editing.value = false
  },
)

async function afterWrite(status: 'executed' | 'proposed', actionId?: string) {
  if (status === 'proposed' && actionId) proposedAction.value = actionId
  course.invalidate('members')
  await state.reload()
}

// --- Permissions ----------------------------------------------------------------
const editing = ref(false)
const draft = ref<PermLevels>({})
const permWrite = useWrite('member.update_perms')

function startEdit() {
  draft.value = { ...perms.value }
  permWrite.lastError.value = null
  editing.value = true
}
function cancelEdit() {
  editing.value = false
  permWrite.lastError.value = null
}
const changes = computed<PermLevels>(() => {
  const out: PermLevels = {}
  for (const p of PERMS) {
    const v = draft.value[p]
    if (v && v !== perms.value[p]) out[p] = v
  }
  return out
})
const changeCount = computed(() => Object.keys(changes.value).length)
const raises = computed(() =>
  (Object.entries(changes.value) as [Perm, AutonomyLevel][]).some(([p, l]) => rank(l) > rank(perms.value[p])),
)
function shapeWith(p: PermLevels): Shape {
  const x = m.value!
  return {
    perms: p,
    studentScope: x.student_scope,
    students: x.listed_students ?? [],
    assignmentScope: x.assignment_scope,
    assignments: x.listed_assignments ?? [],
    expiresAt: x.expires_at ?? null,
  }
}
const permProblems = computed(() =>
  editing.value && raises.value && m.value ? grantProblems(shapeWith({ ...perms.value, ...changes.value })) : [],
)
// On the rows: what changed, and — when the change is a grant, which measures
// the whole seat — each level above the caller's own.
const changedPerms = computed(() => Object.keys(changes.value) as Perm[])
const rowWarnings = computed(() => {
  if (!editing.value) return {}
  const out: Partial<Record<Perm, string>> = raises.value ? permsAbove({ ...perms.value, ...changes.value }) : {}
  // A delegate never holds these, whatever is set: Core refuses to give them.
  // A Core that says the seat's ceilings says so itself, and the editor
  // offers nothing above them.
  if (principalId.value && !ceilings.value) {
    for (const p of DELEGATE_NEVER_PERMS) {
      if ((draft.value[p] ?? 'denied') !== 'denied') out[p] = t('members.detail.delegate.never')
    }
  }
  return out
})

async function savePerms() {
  if (!m.value || !changeCount.value) return
  const out = await permWrite.run(
    { course_id: props.courseId, member_id: m.value.id, perms: { ...changes.value } },
    { notify: false },
  )
  if (!out) return
  announce(out, { success: t('members.detail.perms.saved') })
  editing.value = false
  await afterWrite(out.status, out.actionId)
}

// --- Roster role ------------------------------------------------------------------
const roleOpen = ref(false)
/** Why the role is not offered for change here, or null when it is. */
const roleBlock = computed(() =>
  m.value
    ? roleChangeBlock(m.value, { memberId: course.myMemberId, principalMemberId: course.principalMemberId }, live.value)
    : 'gone',
)
const roleOffered = computed(() => canManage.value && !roleBlock.value)
/** Said under the role where a change of it is never offered, whoever asks. */
const roleNote = computed(() => {
  switch (roleBlock.value) {
    case 'delegateSeat':
      return t('members.role.blocked.delegateSeat')
    case 'agent':
      return t('members.role.blocked.agent')
    case 'notYourPrincipal':
      return canManage.value ? t('members.role.blocked.notYourPrincipal') : null
  }
  return null
})
const permsCard = ref<HTMLElement | null>(null)
function editPermsFromRole() {
  startEdit()
  permsCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// --- A student's password ----------------------------------------------------------
const resetOpen = ref(false)
/** Whether a temporary password is offered for this seat, and why not (member.reset_password). */
const resetOffer = computed(() =>
  m.value
    ? resetPasswordOffer(
        m.value,
        {
          memberId: course.myMemberId,
          // A password is handed to a person, never to an agent (people_only).
          isPerson: session.me?.kind === 'human' && !course.isDelegate,
          level: course.level('member_manage'),
        },
        live.value,
      )
    : 'hide',
)
const resetDisabledReason = computed(() => {
  if (!course.writable) return t('common.archivedCourse')
  if (resetOffer.value === 'notAutonomous') return t('members.refusal.reason.not_autonomous')
  if (resetOffer.value === 'seatNotActive') return t('members.refusal.reason.seat_not_active')
  return ''
})

// --- Reach and lifetime ------------------------------------------------------------
const rescopeOpen = ref(false)
function onRescoped(status: 'executed' | 'proposed', actionId: string) {
  void afterWrite(status, actionId)
}

// --- Pause, resume, remove -----------------------------------------------------------
const pauseWrite = useWrite('member.pause')
const resumeWrite = useWrite('member.resume')
const removeWrite = useWrite('member.remove')

// A confirmation in paragraphs, with an optional list of warnings under a heading.
function body(paragraphs: string[], warnTitle?: string, warnings: string[] = []): VNode {
  const kids: VNode[] = paragraphs.map((p) => h('p', { style: 'margin: 0 0 8px; line-height: 1.6' }, p))
  if (warnings.length) {
    kids.push(h('p', { style: 'margin: 8px 0 4px; font-weight: 600; color: var(--el-color-warning)' }, warnTitle))
    kids.push(
      h(
        'ul',
        { style: 'margin: 0; padding-left: 18px; line-height: 1.6' },
        warnings.map((w) => h('li', w)),
      ),
    )
  }
  return h('div', kids)
}

async function confirm(message: VNode, title: string, ok: string, danger = false): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: ok,
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: danger ? 'el-button--danger' : undefined,
    })
    return true
  } catch {
    return false
  }
}

function approvalNote(): string[] {
  return approval.value ? [t('members.detail.approvalNote')] : []
}

async function pause() {
  if (!m.value) return
  const name = m.value.display_name
  const msg = body([t('members.detail.pause.confirm', { name }), ...approvalNote()])
  if (!(await confirm(msg, t('members.detail.pause.title'), t('members.detail.pause.action')))) return
  pageError.value = null
  const out = await pauseWrite.run({ course_id: props.courseId, member_id: m.value.id }, { notify: false })
  if (!out) return void (pageError.value = pauseWrite.lastError.value)
  announce(out, { success: t('members.detail.pause.success', { name }) })
  await afterWrite(out.status, out.actionId)
}

async function resume() {
  if (!m.value) return
  const name = m.value.display_name
  const problems = grantProblems(shapeWith(perms.value))
  const msg = body(
    [t('members.detail.resume.confirm', { name }), ...approvalNote()],
    t('members.grant.willRefuse'),
    problems,
  )
  if (!(await confirm(msg, t('members.detail.resume.title'), t('members.detail.resume.action')))) return
  pageError.value = null
  const out = await resumeWrite.run({ course_id: props.courseId, member_id: m.value.id }, { notify: false })
  if (!out) return void (pageError.value = resumeWrite.lastError.value)
  announce(out, { success: t('members.detail.resume.success', { name }) })
  await afterWrite(out.status, out.actionId)
}

async function remove() {
  if (!m.value) return
  const name = m.value.display_name
  const msg = body([
    t('members.detail.remove.confirm', { name }),
    t('members.detail.remove.confirmFresh'),
    ...(delegates.value.length
      ? [t('members.detail.delegate.removeToo', { n: delegates.value.length }, delegates.value.length)]
      : []),
    ...approvalNote(),
  ])
  if (!(await confirm(msg, t('members.detail.remove.title'), t('members.detail.remove.action'), true))) return
  pageError.value = null
  const out = await removeWrite.run({ course_id: props.courseId, member_id: m.value.id }, { notify: false })
  if (!out) return void (pageError.value = removeWrite.lastError.value)
  announce(out, { success: t('members.detail.remove.success', { name }) })
  if (out.status === 'executed') removedResult.value = out.result.cancelled_proposals ?? 0
  await afterWrite(out.status, out.actionId)
}

const busy = computed(() => pauseWrite.pending.value || resumeWrite.pending.value || removeWrite.pending.value)
const back = computed(() => ({ name: 'course-members', params: { courseId: props.courseId } }))
</script>

<template>
  <div class="member">
    <PageHeader :title="m?.display_name ?? t('members.detail.title')" :back="back">
      <template #tags>
        <template v-if="m">
          <AgentBadge v-if="m.kind === 'agent'" :owner-name="m.owner_name" :mine="mineAgent" size="default" />
          <RoleTag :member="m" size="default" hide-none />
          <StatusTag vocab="memberStatus" :value="m.status" size="default" />
          <AppTag v-if="expired" size="default">{{ t('members.expired') }}</AppTag>
          <AppTag v-if="isSelf" variant="outline" :icon="User" size="default">{{ t('common.labels.you') }}</AppTag>
        </template>
      </template>
      <template v-if="m && showManage">
        <el-tooltip :content="disabledReason" :disabled="!disabledReason" placement="bottom">
          <div class="member__actions">
            <el-tooltip
              v-if="resetOffer !== 'hide'"
              :content="resetDisabledReason"
              :disabled="!resetDisabledReason"
              placement="bottom"
            >
              <span>
                <el-button :disabled="!!resetDisabledReason || busy" @click="resetOpen = true">
                  <el-icon><Key /></el-icon><span>{{ t('members.reset.action') }}</span>
                </el-button>
              </span>
            </el-tooltip>
            <el-button
              v-if="m.status === 'active'"
              :disabled="!manageable || busy"
              :loading="pauseWrite.pending.value"
              @click="pause"
            >
              <el-icon><VideoPause /></el-icon><span>{{ t('members.detail.pause.action') }}</span>
            </el-button>
            <el-button
              v-if="m.status === 'paused'"
              type="primary"
              :disabled="!manageable || busy"
              :loading="resumeWrite.pending.value"
              @click="resume"
            >
              <el-icon><VideoPlay /></el-icon><span>{{ t('members.detail.resume.action') }}</span>
            </el-button>
            <el-button
              type="danger"
              plain
              :disabled="!manageable || busy"
              :loading="removeWrite.pending.value"
              @click="remove"
            >
              <el-icon><Delete /></el-icon><span>{{ t('members.detail.remove.action') }}</span>
            </el-button>
            <StatusTag v-if="approval" vocab="level" value="confirm_required" size="default" />
          </div>
        </el-tooltip>
      </template>
    </PageHeader>

    <AsyncState :loading="state.loading.value && !m" :error="state.error.value" @retry="state.reload">
      <template v-if="m">
        <RefusalAlert :error="pageError" @close="pageError = null" />
        <el-alert
          v-if="proposedAction"
          type="info"
          show-icon
          class="member__alert"
          :title="t('members.proposed.change')"
          @close="proposedAction = null"
        >
          <router-link :to="{ name: 'course-action', params: { courseId, actionId: proposedAction } }">
            {{ t('members.proposed.view') }}
          </router-link>
          ·
          <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
            t('members.proposed.mine')
          }}</router-link>
        </el-alert>
        <el-alert
          v-if="removedResult !== null"
          type="success"
          show-icon
          class="member__alert"
          :title="
            removedResult > 0
              ? t('members.detail.remove.cancelled', { n: removedResult }, removedResult)
              : t('members.detail.remove.noneCancelled')
          "
          @close="removedResult = null"
        >
          {{ t('members.detail.remove.fresh') }}
        </el-alert>
        <el-alert
          v-if="isSelf && live"
          type="info"
          :closable="false"
          show-icon
          class="member__alert"
          :title="t('members.detail.self')"
        />
        <el-alert
          v-if="m.status === 'removed'"
          type="info"
          :closable="false"
          show-icon
          class="member__alert"
          :title="t('members.detail.removed')"
        />
        <el-alert
          v-else-if="expired"
          type="warning"
          :closable="false"
          show-icon
          class="member__alert"
          :title="t('members.detail.expired')"
        />
        <el-alert
          v-else-if="m.status === 'paused'"
          type="warning"
          :closable="false"
          show-icon
          class="member__alert"
          :title="t('members.detail.paused')"
        />

        <!-- The seat -->
        <section class="app-card">
          <h2 ref="seatTitle" class="app-card__title">{{ t('members.detail.seat') }}</h2>
          <el-descriptions
            :column="narrow ? 1 : 2"
            :direction="narrow ? 'vertical' : 'horizontal'"
            border
            class="member__desc"
            :class="{ 'is-narrow': narrow }"
          >
            <el-descriptions-item :label="t('members.detail.actor')">
              <span class="member__actor">
                <AgentAvatar v-if="m.kind === 'agent'" :name="m.display_name" size="small" />
                <el-icon v-else><User /></el-icon>
                <AgentName v-if="m.kind === 'agent'" :name="m.display_name" />
                <span v-else>{{ m.display_name }}</span>
                <AgentBadge v-if="m.kind === 'agent'" :owner-name="m.owner_name" :mine="mineAgent" no-ai />
                <StatusTag v-else vocab="actorKind" :value="m.kind" />
                <HostingTag v-if="m.kind === 'agent'" :hosting="m.hosting" :site-chat="m.site_chat" />
              </span>
            </el-descriptions-item>
            <el-descriptions-item v-if="m.kind === 'human'" :label="t('members.loginId')">
              <code v-if="m.login_id" class="member__login-id">{{ m.login_id }}</code>
              <span v-else class="app-muted">{{ t('members.noLoginId') }}</span>
              <div class="member__hint">{{ t('members.loginIdHelp') }}</div>
            </el-descriptions-item>
            <el-descriptions-item
              v-if="principalId"
              :label="t('members.detail.delegate.actsFor')"
              :span="narrow ? 1 : 2"
            >
              <router-link :to="{ name: 'course-member', params: { courseId, memberId: principalId } }">
                <MemberName :id="principalId" />
              </router-link>
              <div class="member__hint">{{ t('members.detail.delegate.help') }}</div>
            </el-descriptions-item>
            <el-descriptions-item :label="t('members.columns.status')">
              <StatusTag vocab="memberStatus" :value="m.status" />
              <AppTag v-if="expired" class="member__gap">{{ t('members.expired') }}</AppTag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('members.columns.role')">
              <span class="member__role">
                <RoleTag :member="m" />
                <el-tooltip v-if="roleOffered" :content="disabledReason" :disabled="!disabledReason" placement="top">
                  <span>
                    <el-button link type="primary" size="small" :disabled="!manageable" @click="roleOpen = true">
                      <el-icon><Switch /></el-icon><span>{{ t('members.role.change') }}</span>
                    </el-button>
                  </span>
                </el-tooltip>
              </span>
              <div class="member__hint">{{ roleNote ?? t('members.detail.roleHelp') }}</div>
            </el-descriptions-item>
            <el-descriptions-item :label="t('members.columns.preset')">
              <template v-if="preset">
                <span class="member__preset">{{ presetLabel(preset) }}</span>
                <span v-if="preset.dept_id" class="app-muted member__gap">{{ t('members.add.department') }}</span>
                <div v-if="presetDescription(preset)" class="member__hint">{{ presetDescription(preset) }}</div>
              </template>
              <IdText v-else-if="m.preset_id" :id="m.preset_id" />
              <span v-else class="app-muted">—</span>
            </el-descriptions-item>
            <el-descriptions-item :label="t('members.columns.added')">
              <TimeText :value="m.created_at" />
              <div v-if="m.join_link_id" class="member__hint">
                <el-icon class="member__via"><Link /></el-icon>{{ t('join.viaHint') }}
              </div>
            </el-descriptions-item>
            <el-descriptions-item :label="t('members.columns.expires')">
              <template v-if="m.expires_at">
                <TimeText :value="m.expires_at" />
                <span class="app-muted member__gap">(<TimeText :value="m.expires_at" relative />)</span>
              </template>
              <span v-else>{{ t('members.detail.noExpiry') }}</span>
              <div v-if="m.expires_at && live" class="member__hint">{{ t('members.detail.expiresHelp') }}</div>
            </el-descriptions-item>
            <el-descriptions-item :label="t('members.detail.memberId')" :span="narrow ? 1 : 2">
              <IdText :id="m.id" full />
              <div class="member__hint">
                {{ m.kind === 'agent' ? t('members.detail.memberIdAgent') : t('members.detail.memberIdHelp') }}
              </div>
            </el-descriptions-item>
            <el-descriptions-item :label="t('members.detail.actorId')" :span="narrow ? 1 : 2">
              <span class="member__id-line">
                <IdText :id="m.actor_id" />
                <router-link
                  v-if="session.isAdmin"
                  :to="{ name: 'admin-actor', params: { actorId: m.actor_id } }"
                  class="member__small-link"
                >
                  {{ t('members.detail.actorAdmin') }}
                </router-link>
              </span>
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="showWork" class="member__work">
            <span class="app-muted">{{ t('members.detail.work.title') }}</span>
            <router-link
              v-if="work.gradebook"
              :to="{ name: 'course-gradebook', params: { courseId, studentMemberId: m.id } }"
            >
              <el-button size="small"
                ><el-icon><Tickets /></el-icon><span>{{ t('members.detail.work.gradebook') }}</span></el-button
              >
            </router-link>
            <router-link
              v-if="work.submissions"
              :to="{ name: 'course-submissions', params: { courseId }, query: { student: m.id } }"
            >
              <el-button size="small"
                ><el-icon><Files /></el-icon><span>{{ t('members.detail.work.submissions') }}</span></el-button
              >
            </router-link>
            <router-link
              v-if="work.grades"
              :to="{ name: 'course-grades', params: { courseId }, query: { student: m.id } }"
            >
              <el-button size="small"
                ><el-icon><Medal /></el-icon><span>{{ t('members.detail.work.grades') }}</span></el-button
              >
            </router-link>
          </div>
        </section>

        <!-- A person's own agents here -->
        <section v-if="delegates.length" class="app-card">
          <h2 class="app-card__title">{{ t('members.detail.delegate.theirAgents') }}</h2>
          <p class="app-form-hint member__scope-help">{{ t('members.detail.delegate.theirAgentsHelp') }}</p>
          <ul class="member__delegates">
            <li v-for="d in delegates" :key="d.id">
              <AgentAvatar :name="d.display_name" size="small" />
              <router-link :to="{ name: 'course-member', params: { courseId, memberId: d.id } }">
                <AgentName :name="d.display_name" />
              </router-link>
              <span v-if="presetName(d.preset_id)" class="app-muted">{{ presetName(d.preset_id) }}</span>
              <StatusTag v-if="d.status !== 'active'" vocab="memberStatus" :value="d.status" />
            </li>
          </ul>
        </section>

        <!-- Reach -->
        <section class="app-card">
          <h2 class="app-card__title">
            <span>{{ t('members.detail.scope.title') }}</span>
            <el-tooltip v-if="showManage" :content="disabledReason" :disabled="!disabledReason" placement="top">
              <span>
                <el-button size="small" :disabled="!manageable" @click="rescopeOpen = true">
                  <el-icon><Aim /></el-icon><span>{{ t('members.detail.scope.change') }}</span>
                </el-button>
              </span>
            </el-tooltip>
          </h2>
          <p class="app-form-hint member__scope-help">
            {{ ownWorkOnly ? t('members.detail.scope.helpStudent') : t('members.detail.scope.help') }}
          </p>
          <div class="member__scope">
            <div class="member__scope-block">
              <h3 class="member__scope-head">
                {{ t('members.scope.students') }}
                <StatusTag vocab="scope" :value="m.student_scope" />
              </h3>
              <p v-if="m.student_scope === 'all'" class="member__scope-text">
                {{ t('members.detail.scope.allStudents') }}
              </p>
              <p v-else-if="!listedStudents.length" class="member__scope-text member__scope-none">
                <el-icon><WarningFilled /></el-icon>{{ t('members.detail.scope.noStudents') }}
              </p>
              <p v-else-if="ownWorkOnly" class="member__scope-text">{{ t('members.detail.scope.ownWork') }}</p>
              <ul v-else class="member__scope-list">
                <li v-for="id in listedStudents" :key="id">
                  <router-link :to="{ name: 'course-member', params: { courseId, memberId: id } }">
                    <MemberName :id="id" />
                  </router-link>
                </li>
              </ul>
            </div>
            <div class="member__scope-block">
              <h3 class="member__scope-head">
                {{ t('members.scope.assignments') }}
                <StatusTag vocab="scope" :value="m.assignment_scope" />
              </h3>
              <p v-if="m.assignment_scope === 'all'" class="member__scope-text">
                {{ t('members.detail.scope.allAssignments') }}
              </p>
              <p v-else-if="!listedAssignments.length" class="member__scope-text member__scope-none">
                <el-icon><WarningFilled /></el-icon>{{ t('members.detail.scope.noAssignments') }}
              </p>
              <ul v-else class="member__scope-list">
                <li v-for="id in listedAssignments" :key="id">
                  <router-link :to="{ name: 'course-assignment', params: { courseId, assignmentId: id } }">
                    {{ course.assignmentTitle(id) ?? shortId(id) }}
                  </router-link>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Levels -->
        <section ref="permsCard" class="app-card">
          <h2 class="app-card__title">
            <span>{{ t('members.detail.perms.title') }}</span>
            <el-tooltip
              v-if="showManage && !editing"
              :content="disabledReason"
              :disabled="!disabledReason"
              placement="top"
            >
              <span>
                <el-button size="small" :disabled="!manageable" @click="startEdit">
                  <el-icon><Edit /></el-icon><span>{{ t('members.detail.perms.edit') }}</span>
                </el-button>
              </span>
            </el-tooltip>
          </h2>
          <p v-if="principalId" class="app-form-hint member__scope-help">
            {{ t('members.detail.delegate.permsHelp') }}
            <router-link v-if="canManage" :to="{ name: 'course-agents', params: { courseId } }">
              {{ t('members.agentsPage') }}
            </router-link>
          </p>
          <p class="app-form-hint member__scope-help">
            {{ t('members.detail.perms.help') }}
            <template v-if="preset">
              {{
                differsFromPreset
                  ? t(
                      'members.detail.perms.differs',
                      { n: differsFromPreset, preset: presetLabel(preset) },
                      differsFromPreset,
                    )
                  : t('members.detail.perms.asPreset', { preset: presetLabel(preset) })
              }}
            </template>
          </p>

          <template v-if="editing">
            <el-alert type="info" :closable="false" class="member__alert">
              <template #title>{{ t('members.grant.rulesTitle') }}</template>
              {{ t('members.detail.perms.editHelp') }}
            </el-alert>
            <PermEditor v-model="draft" size="small" :changed="changedPerms" :warn="rowWarnings" :ceilings="ceilings" />
            <el-alert
              v-if="permProblems.length"
              type="warning"
              :closable="false"
              show-icon
              class="member__alert member__after"
            >
              <template #title>{{ t('members.grant.willRefuse') }}</template>
              <ul class="member__problems">
                <li v-for="(p, i) in permProblems" :key="i">{{ p }}</li>
              </ul>
            </el-alert>
            <RefusalAlert
              :error="permWrite.lastError.value"
              class="member__after"
              @close="permWrite.lastError.value = null"
            />
            <div class="member__edit-bar">
              <span class="app-muted">
                {{
                  changeCount
                    ? t('members.detail.perms.changes', { n: changeCount })
                    : t('members.detail.perms.unchanged')
                }}
              </span>
              <StatusTag v-if="approval" vocab="level" value="confirm_required" size="default" />
              <span class="app-toolbar__spacer" />
              <el-button @click="cancelEdit">{{ t('common.actions.cancel') }}</el-button>
              <el-button
                type="primary"
                :disabled="!changeCount || !course.writable"
                :loading="permWrite.pending.value"
                @click="savePerms"
              >
                {{ t('common.actions.save') }}
              </el-button>
            </div>
          </template>
          <PermEditor v-else :model-value="perms" readonly :ceilings="ceilings" />
        </section>

        <RescopeDialog v-if="showManage" v-model="rescopeOpen" :course-id="courseId" :member="m" @done="onRescoped" />
        <ResetPasswordDialog v-if="resetOffer === 'offer'" v-model="resetOpen" :course-id="courseId" :member="m" />
        <RoleDialog
          v-if="roleOffered"
          v-model="roleOpen"
          :course-id="courseId"
          :member="m"
          @done="afterWrite"
          @edit-perms="editPermsFromRole"
          @change-reach="rescopeOpen = true"
        />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.member__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.member__actions .el-button + .el-button {
  margin-left: 0;
}
.member__alert {
  margin-bottom: 16px;
}
.member__alert :deep(.el-alert__title) {
  line-height: 1.5;
  font-size: 14px;
}
.member__desc:not(.is-narrow) :deep(.el-descriptions__label) {
  width: 140px;
  min-width: 110px;
}
.member__desc :deep(.el-descriptions__table) {
  table-layout: fixed;
}
.member__desc :deep(.el-descriptions__content) {
  word-break: break-word;
}
.member__actor,
.member__role,
.member__id-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.member__login-id {
  font-family: var(--app-font-mono);
  font-size: 13px;
}
.member__small-link {
  font-size: 12px;
}
.member__hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.member__via {
  margin-right: 4px;
  vertical-align: -2px;
}
.member__gap {
  margin-left: 6px;
}
.member__preset {
  font-weight: 500;
}
.member__work {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
  font-size: 13px;
}
.member__scope-help {
  margin: -4px 0 12px;
}
.member__scope {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
.member__scope-block {
  padding: 12px 14px;
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  min-width: 0;
}
.member__scope-head {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.member__scope-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}
.member__scope-none {
  color: var(--el-color-danger);
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.member__scope-none .el-icon {
  margin-top: 3px;
  flex-shrink: 0;
}
.member__scope-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.8;
}
.member__scope-list a {
  text-decoration: none;
}
.member__after {
  margin-top: 12px;
}
.member__problems {
  margin: 4px 0 0;
  padding-left: 18px;
}
.member__delegates {
  list-style: none;
  margin: 0;
  padding: 0;
}
.member__delegates li {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 0;
  font-size: 14px;
}
.member__delegates a {
  text-decoration: none;
  font-weight: 500;
}
.member__edit-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
@media (max-width: 600px) {
  .app-card {
    padding: 14px;
  }
}
</style>
