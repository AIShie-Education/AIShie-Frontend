<script setup lang="ts">
// Bringing one of the caller's agents into one of their courses as their
// delegate (member.add_delegate). The caller picks the course (one where
// their seat allows agent_delegate) and what the agent is for there: their
// own assistant (preset delegate), or, when they manage the course's
// members, a course agent students may ask (preset course_tutor). Whom it
// answers is sent outright (answers_course), never left to the preset's
// default. What it would be seated with is previewed from
// member.delegate_defaults, which says too whether the call will be carried
// out at once or become a request an instructor approves, and the most the
// seat may hold of each permission (perm_ceilings): the caller may name
// other levels (member.add_delegate's perms), up to those and no further —
// for a student, her own writes such as drafting her submission, which her
// agent then does only by proposal.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { AgentFull, AutonomyLevel, DelegateDefaults, Perm, PermLevels } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import { delegateArgsFor, presetForPurpose, type SeatPurpose } from '@/utils/agents'
import { aboveCeiling, capToCeilings, ceilingsOf } from '@/utils/ceilings'
import AsyncState from '@/components/AsyncState.vue'
import PermEditor from '@/components/PermEditor.vue'
import TimeText from '@/components/TimeText.vue'
import { assignmentReach, courseChoices, grantedPerms, studentReach, toPermLevels } from './agents'
import { courseCodeText } from '@/utils/parts'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ agent: AgentFull }>()
const emit = defineEmits<{ done: [status: 'executed' | 'proposed'] }>()
const { t } = useI18n()
const session = useSessionStore()

// --- The caller's courses ------------------------------------------------------------
// Seats change while the page is open: they are read afresh when the dialog
// opens, unless they were read a moment ago.
const seats = useAsync(() => session.loadMemberships({ maxAgeMs: 5000 }), { immediate: false })
const choices = computed(() => courseChoices(session.memberships, props.agent))
const available = computed(() => choices.value.filter((c) => !c.blocked))
const courseId = ref<string>('')
const purpose = ref<SeatPurpose>('personal')
const choice = computed(() => choices.value.find((c) => c.membership.course_id === courseId.value) ?? null)

watch(open, async (v) => {
  if (!v) return
  courseId.value = ''
  purpose.value = 'personal'
  await seats.reload()
  courseId.value = available.value[0]?.membership.course_id ?? ''
})
// A course agent is offered only where the caller manages members.
watch(choice, (c) => {
  if (c && !c.canCourseAgent) purpose.value = 'personal'
})

// --- What it would be seated with ----------------------------------------------------
const preview = useAsync<DelegateDefaults | null>(
  () =>
    open.value && choice.value && !choice.value.blocked
      ? read('member.delegate_defaults', { course_id: courseId.value, preset: presetForPurpose(purpose.value) })
      : Promise.resolve(null),
  { immediate: false, watch: [courseId, purpose, open] },
)
const defaults = computed(() => preview.data.value ?? null)
const level = computed(() => (defaults.value?.level ?? null) as AutonomyLevel | null)

// --- Naming other levels -------------------------------------------------------------
// What it would get unless told otherwise, and the most it may hold of each
// permission here, why, as Core says them for this course and preset.
const baseline = computed<PermLevels>(() => toPermLevels(defaults.value?.perms))
const ceilings = computed(() => ceilingsOf(defaults.value))
/** Levels the caller set in the editor; those that differ from the baseline are sent. */
const named = ref<PermLevels>({})
const overrides = computed<PermLevels>(() => {
  const out: PermLevels = {}
  for (const [p, l] of Object.entries(named.value) as [Perm, AutonomyLevel][]) {
    if (l && l !== baseline.value[p] && !aboveCeiling(ceilings.value, p, l)) out[p] = l
  }
  return out
})
const changedPerms = computed(() => Object.keys(overrides.value) as Perm[])
/** What it would hold: the baseline with the levels named, never above a ceiling. */
const effective = computed<PermLevels>(() => capToCeilings({ ...baseline.value, ...overrides.value }, ceilings.value))
// Another course or purpose is another starting point.
watch([courseId, purpose, open], () => {
  named.value = {}
})
const granted = computed(() => grantedPerms(effective.value))
const students = computed(() =>
  defaults.value
    ? studentReach(defaults.value.student_scope, defaults.value.listed_students, choice.value?.membership.member_id)
    : null,
)
const assignments = computed(() =>
  defaults.value ? assignmentReach(defaults.value.assignment_scope, defaults.value.listed_assignments) : null,
)

function studentsText(): string {
  const r = students.value
  if (!r) return ''
  return r.kind === 'listed'
    ? t('agents.bring.reach.students.listed', { n: r.n }, r.n)
    : t(`agents.bring.reach.students.${r.kind}`)
}
function assignmentsText(): string {
  const r = assignments.value
  if (!r) return ''
  return r.kind === 'listed'
    ? t('agents.bring.reach.assignments.listed', { n: r.n }, r.n)
    : t(`agents.bring.reach.assignments.${r.kind}`)
}

function courseName(m: { code: string; section: string }): string {
  return courseCodeText(m.code, m.section)
}

// --- Bringing it in ---------------------------------------------------------------------
const { run, pending } = useWrite('member.add_delegate')
const canSubmit = computed(
  () => !!choice.value && !choice.value.blocked && !!defaults.value && level.value !== 'denied' && !pending.value,
)

async function submit() {
  if (!canSubmit.value || !choice.value) return
  const course = courseName(choice.value.membership)
  const out = await run(
    {
      course_id: courseId.value,
      actor_id: props.agent.actor_id,
      ...delegateArgsFor(purpose.value),
      ...(changedPerms.value.length ? { perms: { ...overrides.value } } : {}),
    },
    { success: t('agents.bring.done', { name: props.agent.display_name, course }) },
  )
  if (!out) return
  open.value = false
  emit('done', out.status)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('agents.bring.title', { name: agent.display_name })"
    width="640px"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="bring__intro">{{ t('agents.bring.intro') }}</p>

    <AsyncState
      :loading="seats.loading.value && !session.memberships.length"
      :error="session.memberships.length ? null : seats.error.value"
      :empty="!choices.length"
      :empty-text="t('agents.bring.noCourses')"
      @retry="seats.reload"
    >
      <h3 class="bring__step">{{ t('agents.bring.course') }}</h3>
      <el-alert
        v-if="!available.length"
        type="info"
        :closable="false"
        show-icon
        :title="t('agents.bring.noneAvailable')"
        class="bring__alert"
      />
      <el-radio-group v-model="courseId" class="bring__courses">
        <el-radio
          v-for="c in choices"
          :key="c.membership.course_id"
          :value="c.membership.course_id"
          :disabled="!!c.blocked"
          border
          class="bring__course"
        >
          <span class="bring__course-name">
            <strong>{{ courseName(c.membership) }}</strong>
            <span class="bring__course-title">{{ c.membership.title }}</span>
          </span>
          <span v-if="c.blocked" class="bring__course-note">{{ t(`agents.bring.blocked.${c.blocked}`) }}</span>
          <span v-else-if="c.needsApproval" class="bring__course-note is-warning">
            {{ t('agents.bring.needsApproval') }}
          </span>
        </el-radio>
      </el-radio-group>

      <template v-if="choice && !choice.blocked">
        <h3 class="bring__step">{{ t('agents.bring.purpose') }}</h3>
        <el-radio-group v-model="purpose" class="bring__purposes">
          <el-radio value="personal" border class="bring__purpose">
            <span class="bring__purpose-name">{{ t('enums.seatPurpose.personal') }}</span>
            <span class="bring__purpose-help">{{ t('agents.bring.purposeHelp.personal') }}</span>
          </el-radio>
          <el-radio v-if="choice.canCourseAgent" value="course" border class="bring__purpose">
            <span class="bring__purpose-name">{{ t('agents.bring.purposeCourse') }}</span>
            <span class="bring__purpose-help">{{ t('agents.bring.purposeHelp.course') }}</span>
          </el-radio>
        </el-radio-group>

        <h3 class="bring__step">{{ t('agents.bring.preview') }}</h3>
        <AsyncState :loading="preview.loading.value && !defaults" :error="preview.error.value" @retry="preview.reload">
          <div v-if="defaults" class="bring__preview" :class="{ 'is-loading': preview.loading.value }">
            <el-alert
              v-if="level"
              :type="level === 'confirm_required' ? 'warning' : level === 'denied' ? 'error' : 'success'"
              :closable="false"
              show-icon
              :title="t(`agents.bring.level.${level}`)"
              class="bring__alert"
            />
            <dl class="bring__facts">
              <dt>{{ t('agents.bring.answers') }}</dt>
              <dd>{{ purpose === 'course' ? t('agents.bring.answersCourse') : t('agents.bring.answersYou') }}</dd>
              <dt>{{ t('agents.bring.students') }}</dt>
              <dd>{{ studentsText() }}</dd>
              <dt>{{ t('agents.bring.assignments') }}</dt>
              <dd>{{ assignmentsText() }}</dd>
              <dt>{{ t('agents.bring.ends') }}</dt>
              <dd>
                <TimeText v-if="defaults.expires_at" :value="defaults.expires_at" cutoff />
                <template v-else>{{ t('agents.bring.noEnd') }}</template>
              </dd>
              <dt>{{ t('agents.bring.may') }}</dt>
              <dd class="bring__perms">
                <template v-if="granted.length">
                  <el-tag
                    v-for="g in granted"
                    :key="g.perm"
                    type="info"
                    effect="plain"
                    size="small"
                    :title="t(`enums.level.${g.level}`)"
                    disable-transitions
                  >
                    {{ t(`enums.perm.${g.perm}`) }}
                  </el-tag>
                </template>
                <span v-else class="app-muted">{{ t('agents.seats.nothing') }}</span>
              </dd>
            </dl>
            <details class="bring__details">
              <summary>
                {{ t('agents.bring.adjust') }}
                <el-tag v-if="changedPerms.length" size="small" type="warning" round class="bring__changed">
                  {{ t('agents.bring.changed', { n: changedPerms.length }) }}
                </el-tag>
              </summary>
              <p class="app-form-hint bring__hint">{{ t('agents.bring.adjustHelp') }}</p>
              <PermEditor
                v-model="named"
                sparse
                :baseline="baseline"
                :ceilings="ceilings"
                :changed="changedPerms"
                size="small"
              />
            </details>
            <p class="app-form-hint bring__hint">{{ t('agents.bring.cappedHint') }}</p>
          </div>
        </AsyncState>
      </template>
    </AsyncState>

    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!canSubmit" @click="submit">
        {{ level === 'confirm_required' ? t('agents.bring.submitRequest') : t('agents.bring.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.bring__intro {
  margin: 0 0 8px;
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.bring__step {
  margin: 16px 0 8px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.bring__alert {
  margin-bottom: 10px;
}
.bring__courses,
.bring__purposes {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.bring__course,
.bring__purpose {
  height: auto;
  min-height: 40px;
  margin-right: 0;
  padding: 8px 12px;
  white-space: normal;
  align-items: flex-start;
}
.bring__course :deep(.el-radio__input),
.bring__purpose :deep(.el-radio__input) {
  margin-top: 3px;
}
.bring__course :deep(.el-radio__label),
.bring__purpose :deep(.el-radio__label) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: var(--app-lh-ui);
}
.bring__course-name {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.bring__course-title {
  word-break: break-word;
  color: var(--el-text-color-regular);
}
.bring__course-note,
.bring__purpose-help {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.bring__course-note.is-warning {
  color: var(--el-color-warning);
}
.bring__purpose-name {
  font-weight: var(--app-weight-strong);
}
.bring__preview.is-loading {
  opacity: 0.6;
}
.bring__facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 16px;
  margin: 0;
  font-size: var(--app-text-sm);
}
.bring__facts dt {
  color: var(--el-text-color-secondary);
}
.bring__facts dd {
  margin: 0;
}
.bring__perms {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.bring__details {
  margin-top: 10px;
  font-size: var(--app-text-sm);
}
.bring__details summary {
  cursor: pointer;
  color: var(--el-color-primary);
  margin-bottom: 6px;
}
.bring__hint {
  margin: 10px 0 0;
}
.bring__details .bring__hint {
  margin: 0 0 6px;
}
.bring__changed {
  margin-left: 6px;
}
@media (max-width: 480px) {
  .bring__facts {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
  .bring__facts dd {
    margin-bottom: 6px;
  }
}
</style>
