<script setup lang="ts">
// member.rescope: which students and assignments a seat's scoped permissions
// reach, and when the seat ends. Only what changed is sent; a list that is
// not sent is kept as it is. Widening (a scope opened, a list added to, an
// end moved later or cleared) is a grant and must be within the caller's own
// seat; narrowing is always allowed.
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { ToolIn } from '@/api/http'
import type { Member, PermLevels } from '@/api/types'
import { useWrite, announce } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import StatusTag from '@/components/StatusTag.vue'
import AssignmentSelect from '@/components/AssignmentSelect.vue'
import MemberName from '@/components/MemberName.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import TimeText from '@/components/TimeText.vue'
import RefusalAlert from './RefusalAlert.vue'
import { fullPerms, grantProblems, widens, type Shape } from './seat'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ courseId: string; member: Member }>()
const emit = defineEmits<{ done: [status: 'executed' | 'proposed', actionId: string] }>()

const { t } = useI18n()
const course = useCourseStore()
const { run, pending, lastError } = useWrite('member.rescope')

type ExpiryMode = 'keep' | 'set' | 'clear'
const form = reactive({
  studentScope: 'all',
  students: [] as string[],
  assignmentScope: 'all',
  assignments: [] as string[],
  expiry: 'keep' as ExpiryMode,
  expiresAt: null as Date | null,
})

function reset() {
  const m = props.member
  form.studentScope = m.student_scope
  form.students = [...(m.listed_students ?? [])]
  form.assignmentScope = m.assignment_scope
  form.assignments = [...(m.listed_assignments ?? [])]
  form.expiry = 'keep'
  form.expiresAt = m.expires_at ? new Date(m.expires_at) : null
  lastError.value = null
}
watch(open, (v) => v && reset(), { immediate: true })

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

const studentScopeChanged = computed(() => form.studentScope !== props.member.student_scope)
const studentsChanged = computed(
  () => form.studentScope === 'listed' && !sameSet(form.students, props.member.listed_students ?? []),
)
const assignmentScopeChanged = computed(() => form.assignmentScope !== props.member.assignment_scope)
const assignmentsChanged = computed(
  () => form.assignmentScope === 'listed' && !sameSet(form.assignments, props.member.listed_assignments ?? []),
)
const expiryChanged = computed(() => {
  if (form.expiry === 'clear') return !!props.member.expires_at
  if (form.expiry === 'set') {
    if (!form.expiresAt) return false
    return !props.member.expires_at || form.expiresAt.getTime() !== new Date(props.member.expires_at).getTime()
  }
  return false
})
const changed = computed(
  () =>
    studentScopeChanged.value ||
    studentsChanged.value ||
    assignmentScopeChanged.value ||
    assignmentsChanged.value ||
    expiryChanged.value,
)

const expiryInvalid = computed(
  () => form.expiry === 'set' && (!form.expiresAt || form.expiresAt.getTime() <= Date.now()),
)

// Students on the list who are no longer current students of the course:
// Core refuses a list that names one, so a changed list must drop them.
const staleStudents = computed(() => {
  if (form.studentScope !== 'listed') return []
  if (course.membersState !== 'loaded') return []
  return form.students.filter((id) => {
    const m = course.members.get(id)
    return !m || m.role !== 'student' || m.status === 'removed'
  })
})
// The picker offers current students only (active or paused: Core takes a
// paused student on a list, never a removed one). Those already on the list
// who are no longer students are kept apart, shown by name under it.
const currentStudents = computed<string[]>({
  get: () => form.students.filter((id) => !staleStudents.value.includes(id)),
  set: (ids) => (form.students = [...ids, ...staleStudents.value]),
})
function dropStale() {
  form.students = currentStudents.value
}

// --- Measured against the caller's own seat ----------------------------------
const before = computed<Shape>(() => ({
  perms: fullPerms(props.member.perms) as PermLevels,
  studentScope: props.member.student_scope,
  students: props.member.listed_students ?? [],
  assignmentScope: props.member.assignment_scope,
  assignments: props.member.listed_assignments ?? [],
  expiresAt: props.member.expires_at ?? null,
}))
const after = computed<Shape>(() => ({
  perms: before.value.perms,
  studentScope: form.studentScope,
  students:
    form.studentScope === 'listed'
      ? studentsChanged.value || studentScopeChanged.value
        ? form.students
        : before.value.students
      : [],
  assignmentScope: form.assignmentScope,
  assignments:
    form.assignmentScope === 'listed'
      ? assignmentsChanged.value || assignmentScopeChanged.value
        ? form.assignments
        : before.value.assignments
      : [],
  expiresAt:
    form.expiry === 'clear'
      ? null
      : form.expiry === 'set' && form.expiresAt
        ? form.expiresAt.toISOString()
        : before.value.expiresAt,
}))
const isGrant = computed(() => changed.value && widens(before.value, after.value))
const problems = computed(() => (isGrant.value ? grantProblems(after.value) : []))

function disabledDate(d: Date) {
  return dayjs(d).endOf('day').isBefore(dayjs())
}

async function submit() {
  if (!changed.value || expiryInvalid.value) return
  const args: ToolIn<'member.rescope'> = { course_id: props.courseId, member_id: props.member.id }
  if (studentScopeChanged.value) args.student_scope = form.studentScope
  if (form.studentScope === 'listed' && (studentsChanged.value || studentScopeChanged.value)) {
    args.listed_students = [...form.students]
  }
  if (assignmentScopeChanged.value) args.assignment_scope = form.assignmentScope
  if (form.assignmentScope === 'listed' && (assignmentsChanged.value || assignmentScopeChanged.value)) {
    args.listed_assignments = [...form.assignments]
  }
  if (expiryChanged.value) {
    if (form.expiry === 'clear') args.clear_expiry = true
    else if (form.expiresAt) args.expires_at = dayjs(form.expiresAt).toISOString()
  }
  const out = await run(args, { notify: false })
  if (!out) return
  announce(out, { success: t('members.rescope.success') })
  open.value = false
  emit('done', out.status, out.actionId)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('members.rescope.title', { name: member.display_name })"
    width="600px"
    destroy-on-close
    append-to-body
  >
    <p class="rescope__intro">{{ t('members.rescope.intro') }}</p>
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('members.add.studentScope')">
        <el-radio-group v-model="form.studentScope">
          <el-radio-button value="all">{{ t('members.scope.all.students') }}</el-radio-button>
          <el-radio-button value="listed">{{ t('members.scope.onlyThese') }}</el-radio-button>
        </el-radio-group>
        <div v-if="form.studentScope === 'listed'" class="rescope__list">
          <MemberSelect
            v-model="currentStudents"
            multiple
            role="student"
            :statuses="['active', 'paused']"
            clearable
            :placeholder="t('members.add.pickStudents')"
          />
          <el-alert
            v-if="!form.students.length"
            type="warning"
            :closable="false"
            show-icon
            :title="t('members.add.nobodyStudents')"
          />
          <el-alert
            v-if="staleStudents.length"
            type="warning"
            :closable="false"
            show-icon
            :title="t('members.rescope.staleStudents', { n: staleStudents.length }, staleStudents.length)"
          >
            <div class="rescope__stale">
              <el-tag v-for="id in staleStudents" :key="id" type="info" size="small" disable-transitions>
                <MemberName :id="id" />
              </el-tag>
            </div>
            <el-button size="small" class="rescope__drop" @click="dropStale">
              {{ t('members.rescope.dropStale') }}
            </el-button>
          </el-alert>
        </div>
      </el-form-item>

      <el-form-item :label="t('members.add.assignmentScope')">
        <el-radio-group v-model="form.assignmentScope">
          <el-radio-button value="all">{{ t('members.scope.all.assignments') }}</el-radio-button>
          <el-radio-button value="listed">{{ t('members.scope.onlyThese') }}</el-radio-button>
        </el-radio-group>
        <div v-if="form.assignmentScope === 'listed'" class="rescope__list">
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
          />
        </div>
      </el-form-item>

      <el-form-item :label="t('members.add.expires')">
        <div class="rescope__expiry">
          <div class="rescope__now">
            <span class="app-muted">{{ t('members.rescope.currently') }}</span>
            <TimeText v-if="member.expires_at" :value="member.expires_at" />
            <span v-else>{{ t('members.detail.noExpiry') }}</span>
          </div>
          <el-radio-group v-model="form.expiry">
            <el-radio value="keep">{{ t('members.rescope.keep') }}</el-radio>
            <el-radio value="set">{{ t('members.rescope.setEnd') }}</el-radio>
            <el-radio value="clear" :disabled="!member.expires_at">{{ t('members.rescope.clear') }}</el-radio>
          </el-radio-group>
          <el-date-picker
            v-if="form.expiry === 'set'"
            v-model="form.expiresAt"
            type="datetime"
            :disabled-date="disabledDate"
            class="rescope__date"
          />
          <div v-if="expiryInvalid && form.expiresAt" class="rescope__error">{{ t('members.add.expiresPast') }}</div>
          <div class="app-form-hint">{{ t('members.rescope.expiryHelp') }}</div>
        </div>
      </el-form-item>
    </el-form>

    <el-alert v-if="isGrant" type="info" :closable="false" show-icon class="rescope__alert">
      <template #title>{{ t('members.rescope.isGrant') }}</template>
    </el-alert>
    <el-alert v-if="problems.length" type="warning" :closable="false" show-icon class="rescope__alert">
      <template #title>{{ t('members.grant.willRefuse') }}</template>
      <ul class="rescope__problems">
        <li v-for="(p, i) in problems" :key="i">{{ p }}</li>
      </ul>
    </el-alert>
    <RefusalAlert :error="lastError" @close="lastError = null" />

    <template #footer>
      <div class="rescope__footer">
        <StatusTag v-if="course.needsApproval('member_manage')" vocab="level" value="confirm_required" size="default" />
        <span v-if="!changed" class="app-muted rescope__nothing">{{ t('members.rescope.nothing') }}</span>
        <span class="app-toolbar__spacer" />
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="pending"
          :disabled="!changed || expiryInvalid || !course.writable"
          @click="submit"
        >
          {{ t('common.actions.save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.rescope__intro {
  margin: 0 0 16px;
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.rescope__list {
  width: 100%;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rescope__list :deep(.el-select) {
  width: 100%;
}
.rescope__expiry {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.rescope__now {
  display: flex;
  gap: 6px;
  font-size: var(--app-text-sm);
  flex-wrap: wrap;
}
.rescope__date {
  max-width: 280px;
}
.rescope__error {
  color: var(--el-color-danger);
  font-size: var(--app-text-xs);
}
.rescope__alert {
  margin-bottom: 12px;
}
.rescope__alert :deep(.el-alert__title) {
  font-size: var(--app-text-md);
  line-height: var(--app-lh-ui);
}
.rescope__problems {
  margin: 4px 0 0;
  padding-left: 18px;
}
.rescope__stale {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.rescope__drop {
  margin-top: 8px;
}
.rescope__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rescope__nothing {
  font-size: var(--app-text-xs);
}
</style>
