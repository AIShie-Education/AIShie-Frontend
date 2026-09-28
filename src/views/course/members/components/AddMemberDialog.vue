<script setup lang="ts">
// member.add: seat a person or an agent. A preset gives the starting role,
// scope and levels; anything here overrides it. Core refuses a seat that
// holds more than the one adding it (levels, reach, lifetime), and this form
// warns before sending when the caller's own seat is known.
//
// Who is seated is given by their actor ID, which one of two ways to find
// them fills in, never both at once: a platform administrator, whom the
// directory (actor.list) answers, searches it by name or email; anyone else,
// or an administrator whose Core has no directory, gives a person's whole
// email (member.lookup_actor, which lists nobody). An ID can be pasted too:
// an agent has no email, and an administrator gives its ID. Whatever ID is in
// the field is looked up to show whom it names, to start from the preset for
// their kind, and to stop a second seat for someone who already has one here.
// A Core without member.lookup_actor has the ID field only, as before, and an
// administrator's pasted ID is then looked up in the directory (actor.get).
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { FormInstance, FormRules } from 'element-plus'
import { isApiError, read, type ApiError, type ToolIn } from '@/api/http'
import { ROLES, type Actor, type AutonomyLevel, type Perm, type PermLevels, type Preset } from '@/api/types'
import { useWrite, announce } from '@/composables/useWrite'
import { errorMessage } from '@/composables/useErrors'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { isUuid, shortId } from '@/utils/format'
import AssignmentSelect from '@/components/AssignmentSelect.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import PermEditor from '@/components/PermEditor.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { probeActorList, useActorSearch } from '@/views/admin/components/actorSearch'
import RefusalAlert from './RefusalAlert.vue'
import {
  candidateFrom,
  foundNobody,
  fullPerms,
  grantProblems,
  hasLookup,
  lacksLookup,
  lookupActor,
  ownedBy,
  permsAbove,
  presetDescription,
  presetLabel,
  probeLookup,
  wholeEmail,
  type SeatCandidate,
} from './seat'

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
  email.value = ''
  emailState.value = null
  emailFound = null
  form.actorId = ''
  presetChosen.value = false
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
  void probeLookup(props.courseId, session.me?.id)
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

// --- Whom to seat ----------------------------------------------------------------
const directory = useActorSearch()
/**
 * Searching by name is offered to administrators once Core has said it has the
 * directory (opening the dialog asks), so that the field never comes and goes
 * under someone typing in it.
 */
const canFind = computed(() => session.isAdmin && directory.hasActorList.value === true)
/**
 * Finding by whole email is offered, on the same terms, to everyone the
 * directory does not answer: once Core has said it has member.lookup_actor,
 * and for an administrator once it has said it has no directory.
 */
const canFindByEmail = computed(
  () => hasLookup.value === true && !canFind.value && (!session.isAdmin || directory.hasActorList.value === false),
)
const actorHelp = computed(() => {
  if (canFind.value) return t('members.add.actorHelpFound')
  if (canFindByEmail.value) return session.isAdmin ? t('members.add.noSearchEmail') : t('members.add.actorHelpEmail')
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

// By whole email: what was typed, what became of the last try, and the one it found.
const email = ref('')
type EmailState = 'finding' | 'partial' | 'nobody' | { error: string } | null
const emailState = ref<EmailState>(null)
/** The one the email found, whose ID is in the field. */
let emailFound: SeatCandidate | null = null
let emailSeq = 0

async function findByEmail() {
  const address = wholeEmail(email.value)
  if (!address) {
    emailState.value = email.value.trim() ? 'partial' : null
    return
  }
  const mine = ++emailSeq
  const before = form.actorId
  emailState.value = 'finding'
  try {
    const out = await lookupActor({ course_id: props.courseId, email: address })
    if (mine !== emailSeq) return
    emailState.value = null
    // An ID typed or pasted while this was on its way is the one meant: it stays.
    if (form.actorId !== before) return
    emailFound = out
    if (form.actorId === out.actor_id) actorInfo.value = out
    else form.actorId = out.actor_id
    formRef.value?.clearValidate('actorId')
  } catch (e) {
    if (mine !== emailSeq) return
    if (foundNobody(e)) emailState.value = 'nobody'
    // A Core without the tool: the field goes, and the ID field is as it always was.
    else if (lacksLookup(e)) emailState.value = null
    else emailState.value = { error: errorMessage(e) }
  }
}
function onEmailKey(e: Event | KeyboardEvent) {
  if (!(e instanceof KeyboardEvent) || e.key !== 'Enter' || e.isComposing) return
  e.preventDefault()
  void findByEmail()
}
// Typing again (or clearing): what the last try said no longer applies, nor does
// one still on its way, nor the ID it put in the field, which the text no longer finds.
watch(email, () => {
  emailSeq++
  emailState.value = null
  if (emailFound && form.actorId === emailFound.actor_id) form.actorId = ''
  emailFound = null
})

// Whom the ID in the field names, and whether they already have a seat here.
const actorInfo = ref<SeatCandidate | 'missing' | null>(null)
const actorLooking = ref(false)
/** Core can say whom an ID names: to anyone through the lookup, and to administrators through the directory. */
const canResolve = computed(() => session.isAdmin || hasLookup.value !== false)
let lookupTimer: ReturnType<typeof setTimeout> | undefined
let lookupSeq = 0

async function resolveActor(id: string): Promise<SeatCandidate | 'missing' | null> {
  if (hasLookup.value !== false) {
    try {
      return await lookupActor({ course_id: props.courseId, actor_id: id })
    } catch (e) {
      if (foundNobody(e)) return 'missing'
      if (!lacksLookup(e)) return null
    }
  }
  if (!session.isAdmin) return null
  try {
    return candidateFrom(await read('actor.get', { actor_id: id }))
  } catch (e) {
    return isApiError(e) && e.isNotFound ? 'missing' : null
  }
}

watch(
  () => form.actorId,
  (raw) => {
    actorInfo.value = null
    clearTimeout(lookupTimer)
    const mine = ++lookupSeq
    actorLooking.value = false
    const id = raw.trim().toLowerCase()
    // An ID typed over the one picked or found leaves the search empty again.
    if (picked && id !== picked.id) {
      picked = null
      foundId.value = ''
    }
    if (emailFound && id !== emailFound.actor_id) emailFound = null
    if (!isUuid(id)) return
    if (emailFound) {
      actorInfo.value = emailFound
      return
    }
    if (!canResolve.value) return
    // What the directory said of the one picked shows at once; the lookup adds whether they have a seat here.
    if (picked) {
      actorInfo.value = candidateFrom(picked)
      if (hasLookup.value === false) return
    }
    lookupTimer = setTimeout(
      async () => {
        if (!picked) actorLooking.value = true
        const info = await resolveActor(id)
        if (mine !== lookupSeq) return
        actorLooking.value = false
        if (info) actorInfo.value = info
      },
      picked ? 0 : 350,
    )
  },
)
/** Their seat here, when they already have one: a second is not offered. */
const seatedAs = computed(() => (actorInfo.value && actorInfo.value !== 'missing' && actorInfo.value.member_id) || null)
/**
 * For an agent a person owns, that person: Core refuses to seat it with
 * member.add (its owner brings it in, as their delegate), so it is not offered.
 */
const owner = computed(() => (actorInfo.value && actorInfo.value !== 'missing' ? ownedBy(actorInfo.value) : null))

// --- The preset to start from, by who is being seated ------------------------
/** The person picked a preset themselves: who is being seated no longer changes it. */
const presetChosen = ref(false)
/** An agent starts as the built-in grader, a person as a student. */
const kindPreset: Record<string, string> = { agent: 'grader', human: 'student' }
watch(
  () => (actorInfo.value && actorInfo.value !== 'missing' ? actorInfo.value.kind : null),
  (kind) => {
    if (!kind || presetChosen.value) return
    const id = builtIn.value.find((p) => p.name === kindPreset[kind])?.id
    if (id) form.presetId = id
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
  if (!formRef.value || !preset.value || seatedAs.value || owner.value !== null) return
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
                <span>{{
                  a.email ??
                  (a.owner_name
                    ? t('common.agent.ownersAgent', { owner: a.owner_name })
                    : t(`enums.actorKind.${a.kind}`))
                }}</span>
                <!-- Two may share a name: the end of the ID, as People & agents shows it, tells them apart. -->
                <code class="app-mono add-member__found-id">{{ shortId(a.id) }}</code>
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
      <el-form-item v-else-if="canFindByEmail" :label="t('members.add.findEmail')" for="add-member-email">
        <div class="add-member__email">
          <el-input
            id="add-member-email"
            v-model="email"
            type="email"
            inputmode="email"
            name="lookup_email"
            autocomplete="off"
            clearable
            :placeholder="t('members.add.emailPlaceholder')"
            class="add-member__email-input"
            @keydown="onEmailKey"
          />
          <el-button :loading="emailState === 'finding'" :disabled="!email.trim()" @click="findByEmail">
            {{ t('members.add.findButton') }}
          </el-button>
        </div>
        <el-alert
          v-if="emailState === 'nobody'"
          type="warning"
          :closable="false"
          show-icon
          :title="t('members.add.emailNobody')"
          class="add-member__inline-alert add-member__email-alert"
        />
        <el-alert
          v-else-if="emailState === 'partial'"
          type="info"
          :closable="false"
          show-icon
          :title="t('members.add.emailPartial')"
          class="add-member__inline-alert add-member__email-alert"
        />
        <el-alert
          v-else-if="emailState && emailState !== 'finding'"
          type="error"
          :closable="false"
          show-icon
          :title="emailState.error"
          class="add-member__inline-alert add-member__email-alert"
        />
        <div v-else class="app-form-hint">{{ t('members.add.emailHelp') }}</div>
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
        <div v-if="actorLooking || actorInfo" class="add-member__actor" aria-live="polite">
          <span v-if="actorLooking" class="app-muted">{{ t('common.labels.loading') }}</span>
          <span v-else-if="actorInfo === 'missing'" class="add-member__actor-missing">
            <el-icon><WarningFilled /></el-icon>{{ t('members.add.actorMissing') }}
          </span>
          <template v-else-if="actorInfo">
            <div class="add-member__actor-who">
              <el-icon><Cpu v-if="actorInfo.kind === 'agent'" /><User v-else /></el-icon>
              <strong>{{ actorInfo.display_name }}</strong>
              <StatusTag vocab="actorKind" :value="actorInfo.kind" />
              <StatusTag v-if="actorInfo.status !== 'active'" vocab="actorStatus" :value="actorInfo.status" />
            </div>
            <el-alert
              v-if="seatedAs"
              type="warning"
              :closable="false"
              show-icon
              :title="t('members.add.alreadySeated')"
              class="add-member__inline-alert"
            >
              <router-link
                :to="{ name: 'course-member', params: { courseId, memberId: seatedAs } }"
                class="add-member__seat-link"
                @click="open = false"
              >
                {{ t('members.add.openSeat') }}
              </router-link>
            </el-alert>
            <el-alert
              v-else-if="owner !== null"
              type="warning"
              :closable="false"
              show-icon
              :title="owner ? t('members.add.ownedAgent', { owner }) : t('members.add.ownedAgentNoName')"
              class="add-member__inline-alert"
            >
              {{ t('members.add.ownedAgentHelp') }}
            </el-alert>
            <el-alert
              v-else-if="actorInfo.status === 'suspended'"
              type="warning"
              :closable="false"
              show-icon
              :title="t('members.add.suspended')"
              class="add-member__inline-alert"
            />
          </template>
        </div>
      </el-form-item>

      <!-- Starting point -->
      <div class="add-member__row">
        <el-form-item :label="t('members.add.preset')" prop="presetId" class="add-member__grow">
          <el-select
            v-model="form.presetId"
            :loading="presetsLoading"
            filterable
            class="add-member__preset-select"
            @change="presetChosen = true"
          >
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
        <el-button
          type="primary"
          :loading="pending"
          :disabled="!course.writable || !preset || !!seatedAs || owner !== null"
          @click="submit"
        >
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
.add-member__found-meta > span:last-of-type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.add-member__found-id {
  flex-shrink: 0;
  font-size: 11px;
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
.add-member__email {
  display: flex;
  gap: 8px;
  width: 100%;
}
.add-member__email-input {
  flex: 1 1 auto;
  min-width: 0;
}
.add-member__email-alert {
  margin-top: 8px;
}
.add-member__actor {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  margin-top: 6px;
  font-size: 13px;
}
.add-member__actor-who {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.add-member__actor-who strong {
  overflow-wrap: anywhere;
}
.add-member__seat-link {
  color: var(--el-color-primary);
  font-weight: 500;
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
  border-radius: var(--app-radius-control);
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
