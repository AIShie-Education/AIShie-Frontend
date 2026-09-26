<script setup lang="ts">
// member.add: seat a person or an agent. A preset gives the starting role,
// scope and levels; anything here overrides it. Core refuses a seat that
// holds more than the one adding it (levels, reach, lifetime), and this form
// warns before sending when the caller's own seat is known.
//
// Who is seated is given by their actor ID. A platform administrator, whom
// the directory (actor.list) answers, can also find them by name or email,
// which fills the ID in; anyone else pastes the ID an administrator gives them.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { FormInstance, FormRules } from 'element-plus'
import { read, type ApiError, type ToolIn } from '@/api/http'
import { ROLES, type Actor, type AutonomyLevel, type Perm, type PermLevels, type Preset } from '@/api/types'
import { useWrite, announce } from '@/composables/useWrite'
import { errorMessage } from '@/composables/useErrors'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { isUuid } from '@/utils/format'
import AssignmentSelect from '@/components/AssignmentSelect.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import PermEditor from '@/components/PermEditor.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { probeActorList, useActorSearch } from '@/views/admin/components/actorSearch'
import RefusalAlert from './RefusalAlert.vue'
import { fullPerms, grantProblems, permsAbove, presetDescription, presetLabel } from './seat'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  courseId: string
  presets: Preset[]
  presetsLoading?: boolean
  presetsError?: ApiError | null
}>()
const emit = defineEmits<{
  done: [outcome: { status: 'executed'; memberId: string } | { status: 'proposed'; actionId: string }]
  retryPresets: []
}>()

const { t } = useI18n()
const course = useCourseStore()
const session = useSessionStore()
const { run, pending, lastError } = useWrite('member.add')

const formRef = ref<FormInstance>()
const form = reactive({
  actorId: '',
  presetId: '',
  role: 'student',
  studentScope: 'listed',
  assignmentScope: 'all',
  students: [] as string[],
  assignments: [] as string[],
  expiresAt: null as Date | null,
  perms: {} as PermLevels,
})
const permsOpen = ref<string[]>([])

const builtIn = computed(() => props.presets.filter((p) => !p.dept_id))
const department = computed(() => props.presets.filter((p) => !!p.dept_id))
const preset = computed(() => props.presets.find((p) => p.id === form.presetId) ?? null)
const baseline = computed<PermLevels>(() => (preset.value ? fullPerms(preset.value.perms) : {}))

function reset() {
  foundId.value = ''
  picked = null
  form.actorId = ''
  form.presetId = builtIn.value.find((p) => p.name === 'student')?.id ?? props.presets[0]?.id ?? ''
  form.students = []
  form.assignments = []
  form.expiresAt = defaultExpiry()
  form.perms = {}
  permsOpen.value = []
  lastError.value = null
  applyPreset()
  formRef.value?.clearValidate()
}

// A new preset is a new starting point: its role and scope, and no overrides.
function applyPreset() {
  const p = preset.value
  if (!p) return
  form.role = p.role
  form.studentScope = p.student_scope
  form.assignmentScope = p.assignment_scope
  form.perms = {}
}
watch(() => form.presetId, applyPreset)
watch(open, (v) => {
  if (!v) return
  reset()
  if (session.isAdmin) void probeActorList()
})
watch(
  () => props.presets,
  () => {
    if (open.value && !form.presetId) reset()
  },
)

// The caller's own seat, where it is known: a new seat may not outlast it.
const myExpiry = computed(() => (course.permsSource === 'exact' ? (course.seat?.expires_at ?? null) : null))
function defaultExpiry(): Date | null {
  return myExpiry.value ? new Date(myExpiry.value) : null
}

// --- What will be sent -------------------------------------------------------
const overrides = computed<PermLevels>(() => {
  const out: PermLevels = {}
  for (const [p, l] of Object.entries(form.perms) as [Perm, AutonomyLevel][]) {
    if (l && l !== baseline.value[p]) out[p] = l
  }
  return out
})
const effective = computed<PermLevels>(() => ({ ...baseline.value, ...overrides.value }))
const listsItself = computed(
  () => form.role === 'student' && form.studentScope === 'listed' && form.students.length === 0,
)
const problems = computed(() =>
  preset.value
    ? grantProblems({
        perms: effective.value,
        studentScope: form.studentScope,
        students: form.students,
        assignmentScope: form.assignmentScope,
        assignments: form.assignments,
        expiresAt: form.expiresAt ? form.expiresAt.toISOString() : null,
        listsItself: listsItself.value,
      })
    : [],
)

// --- The actor, found or looked up where the caller may (platform administrators) --
const directory = useActorSearch()
/**
 * Searching by name is offered to administrators once Core has said it has the
 * directory (opening the dialog asks), so that the field never comes and goes
 * under someone typing in it.
 */
const canFind = computed(() => session.isAdmin && directory.hasActorList.value === true)
const actorHelp = computed(() => {
  if (canFind.value) return t('members.add.actorHelpFound')
  if (session.isAdmin && directory.hasActorList.value === false) return t('members.add.noSearch')
  return t('members.add.actorHelp')
})
/** The one picked in the search, whose ID is in the field. */
const foundId = ref('')
let picked: Actor | null = null

function onFound(id: string | undefined) {
  const a = (id && directory.options.value.find((x) => x.id === id)) || null
  if (!a) {
    // Cleared: so is the ID it put in the field.
    if (picked && form.actorId === picked.id) form.actorId = ''
    picked = null
    return
  }
  picked = a
  form.actorId = a.id
  formRef.value?.clearValidate('actorId')
}

type ActorInfo = { display_name: string; kind: string; status: string } | 'missing' | null
const actorInfo = ref<ActorInfo>(null)
const actorLooking = ref(false)
let lookupTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => form.actorId,
  (id) => {
    actorInfo.value = null
    clearTimeout(lookupTimer)
    actorLooking.value = false
    // An ID typed over the one picked leaves the search empty again.
    if (picked && id.trim().toLowerCase() !== picked.id) {
      picked = null
      foundId.value = ''
    }
    if (!session.isAdmin || !isUuid(id)) return
    if (picked) {
      actorInfo.value = picked
      return
    }
    lookupTimer = setTimeout(async () => {
      actorLooking.value = true
      try {
        const a = await read('actor.get', { actor_id: id.trim() })
        if (form.actorId === id) actorInfo.value = a
      } catch {
        if (form.actorId === id) actorInfo.value = 'missing'
      } finally {
        actorLooking.value = false
      }
    }, 350)
  },
)

// --- Validation and sending ---------------------------------------------------
const rules = computed<FormRules>(() => ({
  actorId: [
    { required: true, message: t('common.errors.required'), trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => (!v || isUuid(v) ? cb() : cb(new Error(t('members.add.actorInvalid')))),
      trigger: 'blur',
    },
  ],
  presetId: [{ required: true, message: t('common.errors.required'), trigger: 'change' }],
  expiresAt: [
    {
      validator: (_r, v: Date | null, cb) =>
        !v || v.getTime() > Date.now() ? cb() : cb(new Error(t('members.add.expiresPast'))),
      trigger: 'change',
    },
  ],
}))

function disabledDate(d: Date) {
  return dayjs(d).endOf('day').isBefore(dayjs())
}

async function submit() {
  if (!formRef.value || !preset.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok) return
  const p = preset.value
  const args: ToolIn<'member.add'> = { course_id: props.courseId, actor_id: form.actorId.trim(), preset_id: p.id }
  if (form.role !== p.role) args.role = form.role
  if (form.studentScope !== p.student_scope) args.student_scope = form.studentScope
  if (form.assignmentScope !== p.assignment_scope) args.assignment_scope = form.assignmentScope
  if (form.studentScope === 'listed' && form.students.length) args.listed_students = [...form.students]
  if (form.assignmentScope === 'listed' && form.assignments.length) args.listed_assignments = [...form.assignments]
  if (Object.keys(overrides.value).length) args.perms = { ...overrides.value }
  if (form.expiresAt) args.expires_at = dayjs(form.expiresAt).toISOString()

  const out = await run(args, { notify: false })
  if (!out) return // refused or failed: shown in the form, which stays open
  announce(out, { success: t('members.add.success') })
  open.value = false
  if (out.status === 'executed') emit('done', { status: 'executed', memberId: out.result.member_id })
  else emit('done', { status: 'proposed', actionId: out.actionId })
}

const changedPerms = computed(() => Object.keys(overrides.value) as Perm[])
const changedCount = computed(() => changedPerms.value.length)
// Adding a seat is always a grant: each level above the caller's own is marked on its row.
const rowWarnings = computed(() => permsAbove(effective.value))

// The permissions above the caller's own, and a way to bring them down to it.
const tooHigh = computed(() => Object.keys(rowWarnings.value) as Perm[])
function capToMine() {
  if (!course.seat) return
  const mine = fullPerms(course.seat.perms)
  const next: PermLevels = { ...form.perms }
  for (const p of tooHigh.value) next[p] = mine[p]
  form.perms = next
  permsOpen.value = ['perms']
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('members.add.title')"
    width="680px"
    destroy-on-close
    append-to-body
    class="add-member"
  >
    <p class="add-member__intro">{{ t('members.add.intro') }}</p>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <!-- Who -->
      <el-form-item v-if="canFind" :label="t('members.add.find')" for="add-member-find">
        <el-select
          id="add-member-find"
          v-model="foundId"
          filterable
          remote
          remote-show-suffix
          clearable
          fit-input-width
          :remote-method="directory.search"
          :loading="directory.searching.value"
          :placeholder="t('members.add.findPlaceholder')"
          class="add-member__find"
          @change="onFound"
          @visible-change="directory.onVisible"
        >
          <el-option v-for="a in directory.options.value" :key="a.id" :value="a.id" :label="a.display_name">
            <div class="add-member__found">
              <span class="add-member__found-name">{{ a.display_name }}</span>
              <span class="add-member__found-meta">
                <StatusTag v-if="a.status !== 'active'" vocab="actorStatus" :value="a.status" />
                <span>{{ a.email ?? t(`enums.actorKind.${a.kind}`) }}</span>
              </span>
            </div>
          </el-option>
          <!-- el-select shows this slot while it loads too: no "no one" before Core has answered. -->
          <template #empty>
            <div class="add-member__found-empty">
              {{
                directory.searching.value
                  ? t('common.labels.loading')
                  : (directory.error.value ?? t('members.add.findNoMatch'))
              }}
            </div>
          </template>
        </el-select>
      </el-form-item>
      <el-form-item :label="t('members.add.actor')" prop="actorId">
        <el-input
          v-model="form.actorId"
          :placeholder="t('members.add.actorPlaceholder')"
          class="app-mono"
          clearable
          name="actor_id"
          autocomplete="off"
        />
        <div class="app-form-hint">{{ actorHelp }}</div>
        <div v-if="session.isAdmin && (actorLooking || actorInfo)" class="add-member__actor">
          <span v-if="actorLooking" class="app-muted">{{ t('common.labels.loading') }}</span>
          <span v-else-if="actorInfo === 'missing'" class="add-member__actor-missing">
            <el-icon><WarningFilled /></el-icon>{{ t('members.add.actorMissing') }}
          </span>
          <template v-else-if="actorInfo">
            <el-icon><Cpu v-if="actorInfo.kind === 'agent'" /><User v-else /></el-icon>
            <strong>{{ actorInfo.display_name }}</strong>
            <StatusTag vocab="actorKind" :value="actorInfo.kind" />
            <StatusTag v-if="actorInfo.status !== 'active'" vocab="actorStatus" :value="actorInfo.status" />
          </template>
        </div>
      </el-form-item>

      <!-- Starting point -->
      <div class="add-member__row">
        <el-form-item :label="t('members.add.preset')" prop="presetId" class="add-member__grow">
          <el-select v-model="form.presetId" :loading="presetsLoading" filterable class="add-member__preset-select">
            <el-option-group :label="t('members.add.builtIn')">
              <el-option v-for="p in builtIn" :key="p.id" :value="p.id" :label="presetLabel(p)">
                <span>{{ presetLabel(p) }}</span>
                <span class="add-member__opt-meta">{{ t(`enums.role.${p.role}`) }}</span>
              </el-option>
            </el-option-group>
            <el-option-group v-if="department.length" :label="t('members.add.department')">
              <el-option v-for="p in department" :key="p.id" :value="p.id" :label="p.name">
                <span>{{ p.name }}</span>
                <span class="add-member__opt-meta">{{ t(`enums.role.${p.role}`) }}</span>
              </el-option>
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('members.add.role')" class="add-member__role">
          <el-select v-model="form.role">
            <el-option v-for="r in ROLES" :key="r" :value="r" :label="t(`enums.role.${r}`)" />
          </el-select>
        </el-form-item>
      </div>
      <el-alert
        v-if="presetsError && !presets.length"
        type="error"
        :closable="false"
        show-icon
        :title="t('members.add.presetsFailed')"
        :description="errorMessage(presetsError)"
        class="add-member__inline-alert add-member__gap"
      >
        <el-button size="small" @click="emit('retryPresets')">{{ t('common.actions.retry') }}</el-button>
      </el-alert>
      <div v-if="preset" class="add-member__preset">
        <span v-if="presetDescription(preset)">{{ presetDescription(preset) }}</span>
        <span class="app-muted">{{ t('members.add.presetCopied') }}</span>
      </div>
      <div class="app-form-hint add-member__gap">{{ t('members.add.roleHelp') }}</div>

      <!-- Reach -->
      <h4 class="add-member__section">{{ t('members.add.reach') }}</h4>
      <p class="app-form-hint add-member__section-hint">{{ t('members.add.reachHelp') }}</p>
      <el-form-item :label="t('members.add.studentScope')">
        <el-radio-group v-model="form.studentScope">
          <el-radio-button value="all">{{ t('members.scope.all.students') }}</el-radio-button>
          <el-radio-button value="listed">{{ t('members.scope.onlyThese') }}</el-radio-button>
        </el-radio-group>
        <div v-if="form.studentScope === 'listed'" class="add-member__list">
          <MemberSelect
            v-model="form.students"
            multiple
            role="student"
            :statuses="['active', 'paused']"
            clearable
            :placeholder="t('members.add.pickStudents')"
          />
          <el-alert
            v-if="listsItself"
            type="info"
            :closable="false"
            show-icon
            :title="t('members.add.listsItself')"
            class="add-member__inline-alert"
          />
          <el-alert
            v-else-if="!form.students.length"
            type="warning"
            :closable="false"
            show-icon
            :title="t('members.add.nobodyStudents')"
            class="add-member__inline-alert"
          />
        </div>
      </el-form-item>
      <el-form-item :label="t('members.add.assignmentScope')">
        <el-radio-group v-model="form.assignmentScope">
          <el-radio-button value="all">{{ t('members.scope.all.assignments') }}</el-radio-button>
          <el-radio-button value="listed">{{ t('members.scope.onlyThese') }}</el-radio-button>
        </el-radio-group>
        <div v-if="form.assignmentScope === 'listed'" class="add-member__list">
          <AssignmentSelect
            v-model="form.assignments"
            multiple
            clearable
            :placeholder="t('members.add.pickAssignments')"
          />
          <el-alert
            v-if="!form.assignments.length"
            type="warning"
            :closable="false"
            show-icon
            :title="t('members.add.nobodyAssignments')"
            class="add-member__inline-alert"
          />
        </div>
      </el-form-item>

      <!-- Lifetime -->
      <el-form-item :label="t('members.add.expires')" prop="expiresAt">
        <div class="add-member__stack">
          <el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            :placeholder="t('members.add.expiresNever')"
            :disabled-date="disabledDate"
            clearable
            class="add-member__date"
          />
          <div class="app-form-hint">
            {{ t('members.add.expiresHelp') }}
            <template v-if="myExpiry"> {{ t('members.add.myExpiry') }} <TimeText :value="myExpiry" /> </template>
          </div>
        </div>
      </el-form-item>

      <!-- Levels -->
      <el-collapse v-model="permsOpen" class="add-member__perms">
        <el-collapse-item name="perms">
          <template #title>
            <span class="add-member__perms-title">
              {{ t('members.add.perms') }}
              <el-tag v-if="changedCount" size="small" type="warning" round>
                {{ t('members.add.permsChanged', { n: changedCount }) }}
              </el-tag>
              <span v-else class="app-muted">{{ t('members.add.permsAsPreset') }}</span>
            </span>
          </template>
          <p class="app-form-hint add-member__perms-hint">{{ t('members.add.permsHelp') }}</p>
          <PermEditor
            v-model="form.perms"
            sparse
            :baseline="baseline"
            :changed="changedPerms"
            :warn="rowWarnings"
            size="small"
          />
        </el-collapse-item>
      </el-collapse>
    </el-form>

    <el-alert type="info" :closable="false" class="add-member__rules">
      <template #title>{{ t('members.grant.rulesTitle') }}</template>
      {{ t('members.grant.rules') }}
    </el-alert>
    <el-alert v-if="problems.length" type="warning" :closable="false" show-icon class="add-member__rules">
      <template #title>{{ t('members.grant.willRefuse') }}</template>
      <ul class="add-member__problems">
        <li v-for="(p, i) in problems" :key="i">{{ p }}</li>
      </ul>
      <el-button v-if="tooHigh.length" size="small" class="add-member__cap" @click="capToMine">
        {{ t('members.add.capToMine', { n: tooHigh.length }) }}
      </el-button>
    </el-alert>
    <RefusalAlert :error="lastError" @close="lastError = null" />

    <template #footer>
      <div class="add-member__footer">
        <el-tag v-if="course.needsApproval('member_manage')" type="warning" effect="plain">
          {{ t('enums.level.confirm_required') }}
        </el-tag>
        <span class="app-toolbar__spacer" />
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="pending" :disabled="!course.writable || !preset" @click="submit">
          {{ course.needsApproval('member_manage') ? t('members.add.submitProposal') : t('members.add.submit') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.add-member__intro {
  margin: 0 0 16px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
.add-member__find {
  width: 100%;
}
.add-member__found {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.add-member__found-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.add-member__found-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.add-member__found-meta > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.add-member__found-empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.add-member__actor {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 13px;
  flex-wrap: wrap;
}
.add-member__actor-missing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-warning);
}
.add-member__row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.add-member__grow {
  flex: 1 1 260px;
  margin-bottom: 8px;
}
.add-member__role {
  flex: 0 1 200px;
  min-width: 160px;
  margin-bottom: 8px;
}
.add-member__opt-meta {
  float: right;
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.add-member__preset {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  line-height: 1.5;
}
.add-member__gap {
  margin-bottom: 12px;
}
.add-member__section {
  margin: 8px 0 2px;
  font-size: 14px;
  font-weight: 600;
}
.add-member__section-hint {
  margin: 0 0 10px;
}
.add-member__list {
  width: 100%;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.add-member__list :deep(.el-select) {
  width: 100%;
}
.add-member__inline-alert :deep(.el-alert__title) {
  line-height: 1.5;
}
.add-member__stack {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.add-member__date {
  width: 100%;
  max-width: 280px;
}
.add-member__perms {
  margin-bottom: 16px;
}
.add-member__perms-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}
.add-member__perms-hint {
  margin: 0 0 8px;
}
.add-member__rules {
  margin-bottom: 12px;
}
.add-member__rules :deep(.el-alert__description),
.add-member__rules :deep(.el-alert__content) {
  line-height: 1.6;
}
.add-member__rules :deep(.el-alert__title) {
  font-size: 14px;
}
.add-member__cap {
  margin-top: 8px;
}
.add-member__problems {
  margin: 4px 0 0;
  padding-left: 18px;
}
.add-member__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
