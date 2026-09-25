<script setup lang="ts">
// grade.regrade: replace a posted grade. The old grade is kept, marked
// superseded; the new one is posted at once and the student's totals are
// written down again if they changed. It takes grade_submit and grade_post,
// and runs at the lower of the two levels. The regrader is shown the rubric
// in force, and the new grade records that version, as grade.submit's does.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { ToolOut, UploadedFile, WriteOutcome } from '@/api/http'
import type { Decimal, Grade } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { isDecimal } from '@/utils/format'
import FileUploader from '@/components/FileUploader.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import BreakdownEditor, { type BreakdownRow } from '@/views/course/submissions/components/BreakdownEditor.vue'
import RubricPanel from '@/views/course/submissions/components/RubricPanel.vue'
import { decimalAbove } from '@/views/course/submissions/components/decimal'
import { loadRubric, rubricArgs } from '@/views/course/submissions/components/rubric'
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
const aboveMax = computed(() => decimalAbove(form.score.trim(), props.outOf))
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
  form.score = plainDecimal(props.grade.score) ?? String(props.grade.score)
  form.allowExtra = decimalAbove(props.grade.score, props.outOf)
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
        if (decimalAbove(v.trim(), props.outOf) && !form.allowExtra) return cb(new Error(t('grades.form.aboveMax')))
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

async function submit() {
  if (!formRef.value) return
  breakdownChecked.value = true
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok || !breakdownValid(form.breakdown)) return
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
        ? form.files.map((f) => ({ title: f.fileName, upload_token: f.uploadToken }))
        : undefined,
      breakdown: breakdownForApi(form.breakdown),
      treat_ungraded_as_zero: form.final || undefined,
      ...rubricArgs(rubric.data.value),
    },
    { success: false },
  )
  if (!out) return
  visible.value = false
  emit('done', out)
}
</script>

<template>
  <el-dialog v-model="visible" :title="t('grades.regrade.title')" width="640px" destroy-on-close @open="onOpen">
    <div class="regrade__current">
      <span class="app-muted">{{ t('grades.regrade.current', { what }) }}</span>
      <ScoreText :score="grade.score" :out-of="outOf" />
    </div>
    <p class="app-form-hint regrade__intro">{{ t('grades.regrade.intro') }}</p>

    <div v-if="grade.assignment_id" class="regrade__rubric">
      <RubricPanel
        :course-id="courseId"
        :state="rubric.data.value"
        :loading="rubric.loading.value"
        :error="rubric.error.value"
      />
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="pending">
      <el-form-item :label="t('grades.form.newScore')" prop="score">
        <div class="regrade__score">
          <el-input v-model="form.score" inputmode="decimal" class="regrade__score-input" />
          <span class="regrade__of">/ {{ formatScore(outOf) }}</span>
        </div>
      </el-form-item>
      <el-form-item v-if="aboveMax || form.allowExtra">
        <el-checkbox v-model="form.allowExtra" :label="t('grades.form.allowExtra')" />
        <p class="app-form-hint grades-hint">{{ t('grades.form.allowExtraHelp') }}</p>
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
        <FileUploader v-model="form.files" :course-id="courseId" kind="feedback" multiple :disabled="pending" />
        <p class="app-form-hint grades-hint">
          {{ hadFiles ? t('grades.regrade.filesStay') : t('grades.form.feedbackFilesHelp') }}
        </p>
      </el-form-item>

      <el-form-item>
        <FinalOption v-model="form.final" :disabled="pending" />
      </el-form-item>

      <el-alert v-if="needsApproval" type="info" :closable="false" show-icon>
        {{ t('grades.regrade.proposalNote') }}
      </el-alert>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!course.writable || rubric.loading.value" @click="submit">
        {{ needsApproval ? t('grades.regrade.submitProposal') : t('grades.regrade.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.regrade__current {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  margin-bottom: 8px;
}
.regrade__intro {
  margin: 0 0 12px;
}
.regrade__rubric {
  max-height: 260px;
  overflow: auto;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
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
