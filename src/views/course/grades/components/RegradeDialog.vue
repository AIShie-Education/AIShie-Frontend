<script setup lang="ts">
// grade.regrade: replace a posted grade. The old grade is kept, marked
// superseded; the new one is posted at once and the student's totals are
// written down again if they changed. It takes grade_submit and grade_post,
// and runs at the lower of the two levels. The regrader is shown the rubric
// in force, and the new grade records that version, as grade.submit's does.
//
// A member's grade from their group's regrades the group's as a whole: a new
// group grade, and a new posted grade for each member whose grade came from
// the old one (and for each member of the work with none from it, one added
// since), each member's adjustment as their line here says, carried unless
// changed. It is refused while a grade from the old one is still a draft.
// The members it writes and the grades it replaces are sent as read, so that
// a proposal is refused on approval if they have changed. Core regrades a
// group only for a seat that reaches every member of its work, and shows a
// seat the grades only of those it reaches: the grade's page offers such a
// seat no regrade, and one that opens it all the same (its reach read only
// as it opens) is told so, shown no member's line (a grade it was not given
// would read as none) and offered nothing to save. Where whether the seat
// reaches a member is not known (its list cannot be read), a member with no
// grade shown is kept as their grade has it, unseen and unsent, and said so:
// never shown as the group's score.
import { computed, reactive, ref, watch } from 'vue'
import { read } from '@/api/http'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { ToolOut, UploadedFile, WriteOutcome } from '@/api/http'
import type { Decimal, Grade, GradeSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { isDecimal } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import FileDropZone from '@/components/FileDropZone.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import BreakdownEditor, { type BreakdownRow } from '@/views/course/submissions/components/BreakdownEditor.vue'
import RubricPanel from '@/views/course/submissions/components/RubricPanel.vue'
import { decimalAbove } from '@/views/course/submissions/components/decimal'
import { loadRubric, rubricArgs } from '@/views/course/submissions/components/rubric'
import GroupAdjustments from '@/views/course/submissions/components/GroupAdjustments.vue'
import {
  adjustmentsArg,
  anyAbove,
  liveByMember,
  rowProblem,
  rowsFor,
  workMemberIds,
  workReach,
  type AdjustRow,
} from '@/views/course/submissions/components/groupGrading'
import AsyncState from '@/components/AsyncState.vue'
import FinalOption from './FinalOption.vue'
import ScoreText from './ScoreText.vue'
import {
  breakdownForApi,
  breakdownValid,
  confirmFinal,
  formatScore,
  parseBreakdown,
  plainDecimal,
  toBreakdownRows,
} from './grading'

const visible = defineModel<boolean>({ default: false })
const props = defineProps<{ courseId: string; grade: Grade; outOf: Decimal | null; what: string }>()
const emit = defineEmits<{ done: [out: WriteOutcome<ToolOut<'grade.regrade'>>] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('grade.regrade')

const formRef = ref<FormInstance>()
const form = reactive({
  score: '',
  allowExtra: false,
  feedback: '',
  files: [] as UploadedFile[],
  breakdown: [] as BreakdownRow[],
  final: false,
})

const needsApproval = computed(() => course.needsApprovalAll(['grade_submit', 'grade_post']))

// ---------------------------------------------------------------------------
// A group's grade: every member it writes, read as the dialog opens
// ---------------------------------------------------------------------------

const isGroup = computed(() => !!props.grade.group && !!props.grade.submission_id)
const groupWork = useAsync(
  async () => {
    const submissionId = props.grade.submission_id
    const old = props.grade.group?.group_grade_id
    if (!visible.value || !isGroup.value || !submissionId || !old) return null
    const [sub, grades] = await Promise.all([
      read('submission.get', { course_id: props.courseId, submission_id: submissionId }),
      (async () => {
        const out: GradeSummary[] = []
        let after: string | undefined
        for (;;) {
          const page = await read('grade.list', {
            course_id: props.courseId,
            assignment_id: props.grade.assignment_id ?? undefined,
            limit: 200,
            after,
          })
          out.push(...(page.grades ?? []).filter((x) => x.submission_id === submissionId))
          if (!page.next) return out
          after = page.next
        }
      })(),
    ])
    const live = liveByMember(grades, submissionId)
    // Those whose posted grade came from the group's grade, and those of the work with none.
    const writes = workMemberIds(sub).filter((id) => {
      const x = live.get(id)
      return !x || (x.state === 'posted' && x.group?.group_grade_id === old)
    })
    for (const [id, x] of live)
      if (!writes.includes(id) && x.state === 'posted' && x.group?.group_grade_id === old) writes.push(id)
    return {
      members: sub.members ?? [],
      /** Some member of the work is outside the caller's reach: their grades were not read, and Core refuses it. */
      unreached: workReach(workMemberIds(sub), course.reachesStudent) === 'some',
      writes,
      // A member with no grade shown whom the seat may not reach: theirs was not given, and is kept unseen.
      rows: rowsFor(writes, live, course.reachesStudent),
      replaces: writes
        .map((id) => live.get(id))
        .filter((x): x is GradeSummary => !!x)
        .map((x) => x.id),
      partlyPosted: [...live.values()].some((x) => x.state === 'draft' && x.group?.group_grade_id === old),
    }
  },
  { watch: [visible, () => props.grade.id], immediate: false },
)
const adjustRows = ref<AdjustRow[]>([])
watch(
  () => groupWork.data.value,
  (w) => (adjustRows.value = w ? w.rows.map((r) => ({ ...r })) : []),
)
const rowsChecked = ref(false)
/** Some member's grade is not shown: the seat may not reach them, and their line is kept as it is. */
const someUnseen = computed(() => isGroup.value && !!groupWork.data.value?.rows.some((r) => r.unseen))
/** Some member of the work is outside the seat's reach: nothing is offered but to close. */
const unreached = computed(() => isGroup.value && !!groupWork.data.value?.unreached)
const groupBlocked = computed(
  () =>
    isGroup.value &&
    (!groupWork.data.value ||
      groupWork.data.value.partlyPosted ||
      groupWork.data.value.unreached ||
      groupWork.loading.value),
)

const aboveMax = computed(
  () =>
    decimalAbove(form.score.trim(), props.outOf) ||
    (isGroup.value && anyAbove(adjustRows.value, form.score, props.outOf)),
)
const scoreAbove = computed(() => decimalAbove(form.score.trim(), props.outOf))
const hadFiles = computed(() => (props.grade.feedback_files ?? []).length > 0)

// The rubric of the assignment the grade is for, read when the dialog opens.
// A grade on a component has none.
const rubric = useAsync(
  async () => {
    const assignmentId = props.grade.assignment_id
    if (!visible.value || !assignmentId) return undefined
    await course.ensureAssignments()
    return loadRubric(props.courseId, course.assignments.get(assignmentId), course.can('rubric_read'))
  },
  { watch: [visible, () => props.grade.id] },
)

// The breakdown is checked on saving rather than by a form rule: a failing
// form item marks every input inside it, and the editor marks only the bad ones.
const breakdownChecked = ref(false)
const breakdownError = computed(() => breakdownChecked.value && !breakdownValid(form.breakdown))

function onOpen() {
  // A member's grade from a group grade: the group's score is what is regraded.
  const score = props.grade.group?.score ?? props.grade.score
  form.score = plainDecimal(score) ?? String(score)
  form.allowExtra = decimalAbove(score, props.outOf)
  rowsChecked.value = false
  form.feedback = props.grade.feedback ?? ''
  form.files = []
  form.breakdown = toBreakdownRows(parseBreakdown(props.grade.breakdown))
  form.final = false
  breakdownChecked.value = false
}

const rules = computed<FormRules>(() => ({
  score: [
    {
      required: true,
      trigger: 'blur',
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        if (!v || !v.trim()) return cb(new Error(t('common.errors.required')))
        if (!isDecimal(v)) return cb(new Error(t('common.errors.invalidDecimal')))
        if (Number(v) < 0) return cb(new Error(t('grades.form.negative')))
        if (scoreAbove.value && !form.allowExtra) return cb(new Error(t('grades.form.aboveMax')))
        cb()
      },
    },
  ],
}))
watch(
  () => form.allowExtra,
  () => {
    if (form.score.trim()) void formRef.value?.validateField('score').catch(() => undefined)
  },
)

function useTotal(total: string) {
  form.score = total
  void formRef.value?.validateField('score').catch(() => undefined)
}

/** A feedback file is still uploading: saving now would go without it. */
const uploadingFiles = ref(false)

async function submit() {
  if (!formRef.value || uploadingFiles.value || groupBlocked.value) return
  breakdownChecked.value = true
  rowsChecked.value = true
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok || !breakdownValid(form.breakdown)) return
  const extra = aboveMax.value && form.allowExtra
  if (isGroup.value && adjustRows.value.some((r) => rowProblem(r, form.score, props.outOf, extra))) return
  const w = groupWork.data.value
  if (form.final && !(await confirmFinal(t))) return
  const out = await run(
    {
      course_id: props.courseId,
      grade_id: props.grade.id,
      score: form.score.trim(),
      out_of: props.outOf ?? undefined,
      allow_extra: (aboveMax.value && form.allowExtra) || undefined,
      feedback: form.feedback.trim() || undefined,
      feedback_files: form.files.length
        ? form.files.map((f) => ({ title: f.fileName, upload_token: f.uploadToken, filename: f.fileName }))
        : undefined,
      breakdown: breakdownForApi(form.breakdown),
      treat_ungraded_as_zero: form.final || undefined,
      ...rubricArgs(rubric.data.value),
      ...(isGroup.value && w
        ? { adjustments: adjustmentsArg(adjustRows.value), members: w.writes, replaces_grades: w.replaces }
        : {}),
    },
    { success: false, reasons: isGroup.value ? 'groupGrading.refusal' : undefined },
  )
  if (!out) return
  visible.value = false
  emit('done', out)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isGroup ? t('groupGrading.regrade.title') : t('grades.regrade.title')"
    width="640px"
    destroy-on-close
    @open="onOpen"
  >
    <div class="regrade__current">
      <span class="app-muted">{{
        isGroup
          ? t('groupGrading.regrade.current', { group: grade.group?.group_name ?? '', what })
          : t('grades.regrade.current', { what })
      }}</span>
      <ScoreText :score="grade.group?.score ?? grade.score" :out-of="outOf" />
    </div>
    <p v-if="!unreached" class="app-form-hint regrade__intro">
      {{ isGroup ? t('groupGrading.regrade.intro') : t('grades.regrade.intro') }}
    </p>
    <el-alert
      v-if="unreached"
      type="warning"
      :closable="false"
      show-icon
      class="regrade__partly"
      :title="t('groupGrading.regrade.unreached')"
    />
    <el-alert
      v-else-if="isGroup && groupWork.data.value?.partlyPosted"
      type="warning"
      :closable="false"
      show-icon
      class="regrade__partly"
      :title="t('groupGrading.regrade.partlyPosted')"
    />

    <div v-if="grade.assignment_id && !unreached" class="regrade__rubric">
      <RubricPanel
        :course-id="courseId"
        :state="rubric.data.value"
        :loading="rubric.loading.value"
        :error="rubric.error.value"
      />
    </div>

    <el-form v-if="!unreached" ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="pending">
      <el-form-item :label="isGroup ? t('groupGrading.regrade.score') : t('grades.form.newScore')" prop="score">
        <div class="regrade__score">
          <el-input v-model="form.score" inputmode="decimal" class="regrade__score-input" />
          <span class="regrade__of">/ {{ formatScore(outOf) }}</span>
        </div>
      </el-form-item>
      <el-form-item v-if="aboveMax || form.allowExtra">
        <el-checkbox v-model="form.allowExtra" :label="t('grades.form.allowExtra')" />
        <p class="app-form-hint grades-hint">{{ t('grades.form.allowExtraHelp') }}</p>
      </el-form-item>

      <el-form-item v-if="isGroup" :label="t('groupGrading.editor.title')">
        <AsyncState
          class="regrade__members"
          :loading="groupWork.loading.value && !groupWork.data.value"
          :error="groupWork.error.value"
          @retry="groupWork.reload"
        >
          <p class="app-form-hint grades-hint regrade__members-hint">{{ t('groupGrading.regrade.membersHint') }}</p>
          <p v-if="someUnseen" class="app-form-hint grades-hint regrade__members-hint">
            {{ t('groupGrading.regrade.someUnseen') }}
          </p>
          <GroupAdjustments
            v-model="adjustRows"
            :members="groupWork.data.value?.members ?? []"
            :group-score="form.score"
            :points-possible="outOf"
            :allow-extra="aboveMax && form.allowExtra"
            :strict="rowsChecked"
            :disabled="pending"
          />
        </AsyncState>
      </el-form-item>

      <el-form-item
        :label="t('grades.breakdown.title')"
        :error="breakdownError ? t('grades.form.breakdownInvalid') : ''"
      >
        <BreakdownEditor
          v-model="form.breakdown"
          :disabled="pending"
          :strict="breakdownChecked"
          @use-total="useTotal"
        />
      </el-form-item>

      <el-form-item :label="t('grades.form.feedback')">
        <MarkdownEditor v-model="form.feedback" :rows="6" :placeholder="t('grades.form.feedbackPlaceholder')" />
      </el-form-item>

      <el-form-item :label="t('grades.form.feedbackFiles')">
        <FileDropZone
          v-model="form.files"
          v-model:uploading="uploadingFiles"
          :course-id="courseId"
          kind="feedback"
          multiple
          page-drop
          compact
          :disabled="pending"
        />
        <p class="app-form-hint grades-hint">
          {{ hadFiles ? t('grades.regrade.filesStay') : t('grades.form.feedbackFilesHelp') }}
        </p>
      </el-form-item>

      <el-form-item>
        <FinalOption v-model="form.final" :disabled="pending" />
      </el-form-item>

      <AppNote v-if="needsApproval">
        {{ t('grades.regrade.proposalNote') }}
      </AppNote>
    </el-form>

    <template #footer>
      <span v-if="uploadingFiles" class="regrade__why">{{ t('common.upload.waitToSave') }}</span>
      <el-button @click="visible = false">
        {{ unreached ? t('common.actions.close') : t('common.actions.cancel') }}
      </el-button>
      <el-button
        v-if="!unreached"
        type="primary"
        :loading="pending"
        :disabled="!course.writable || rubric.loading.value || uploadingFiles || groupBlocked"
        @click="submit"
      >
        {{ needsApproval ? t('grades.regrade.submitProposal') : t('grades.regrade.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.regrade__why {
  margin-right: 12px;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.regrade__current {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-light);
  margin-bottom: 8px;
}
.regrade__intro {
  margin: 0 0 12px;
}
.regrade__partly {
  margin-bottom: 12px;
}
.regrade__members {
  width: 100%;
}
.regrade__members-hint {
  margin: 0 0 var(--app-space-sm);
}
.regrade__rubric {
  max-height: 260px;
  overflow: auto;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
}
.regrade__score {
  display: flex;
  align-items: center;
  gap: 8px;
}
.regrade__score-input {
  width: 140px;
}
.regrade__of {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.grades-hint {
  flex-basis: 100%;
  margin: 4px 0 0;
}
</style>
