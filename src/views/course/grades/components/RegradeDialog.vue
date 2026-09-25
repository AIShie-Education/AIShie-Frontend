<script setup lang="ts">
// grade.regrade: replace a posted grade. The old grade is kept, marked
// superseded; the new one is posted at once and the student's totals are
// written down again if they changed. It takes grade_submit and grade_post,
// and runs at the lower of the two levels.
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { ToolOut, UploadedFile, WriteOutcome } from '@/api/http'
import type { Decimal, Grade } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatDecimal, isDecimal } from '@/utils/format'
import FileUploader from '@/components/FileUploader.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import BreakdownEditor from './BreakdownEditor.vue'
import FinalOption from './FinalOption.vue'
import ScoreText from './ScoreText.vue'
import {
  breakdownForApi,
  confirmFinal,
  decimalGreater,
  parseBreakdown,
  toBreakdownDrafts,
  type BreakdownDraft,
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
  breakdown: [] as BreakdownDraft[],
  final: false,
})

const needsApproval = computed(() => course.needsApproval('grade_submit') || course.needsApproval('grade_post'))
const aboveMax = computed(() => isDecimal(form.score) && decimalGreater(form.score, props.outOf))
const hadFiles = computed(() => (props.grade.feedback_files ?? []).length > 0)

function onOpen() {
  form.score = String(props.grade.score)
  form.allowExtra = decimalGreater(props.grade.score, props.outOf)
  form.feedback = props.grade.feedback ?? ''
  form.files = []
  form.breakdown = toBreakdownDrafts(parseBreakdown(props.grade.breakdown))
  form.final = false
}

const breakdownOk = computed(() =>
  (breakdownForApi(form.breakdown) ?? []).every(
    (b) => b.criterion && isDecimal(b.points) && isDecimal(b.max) && Number(b.points) >= 0 && Number(b.max) >= 0,
  ),
)

const rules = computed<FormRules>(() => ({
  score: [
    {
      trigger: 'blur',
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        if (!v || !v.trim()) return cb(new Error(t('common.errors.required')))
        if (!isDecimal(v)) return cb(new Error(t('common.errors.invalidDecimal')))
        if (Number(v) < 0) return cb(new Error(t('grades.form.negative')))
        if (decimalGreater(v, props.outOf) && !form.allowExtra) return cb(new Error(t('grades.form.aboveMax')))
        cb()
      },
    },
  ],
}))

async function submit() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok || !breakdownOk.value) return
  if (form.final && !(await confirmFinal(t))) return
  const out = await run(
    {
      course_id: props.courseId,
      grade_id: props.grade.id,
      score: form.score.trim(),
      out_of: props.outOf ?? undefined,
      allow_extra: form.allowExtra || undefined,
      feedback: form.feedback.trim() || undefined,
      feedback_files: form.files.length
        ? form.files.map((f) => ({ title: f.fileName, upload_token: f.uploadToken }))
        : undefined,
      breakdown: breakdownForApi(form.breakdown),
      treat_ungraded_as_zero: form.final || undefined,
    },
    { success: false },
  )
  if (!out) return
  visible.value = false
  emit('done', out)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="grades-dialog"
    :title="t('grades.regrade.title')"
    width="640px"
    destroy-on-close
    @open="onOpen"
  >
    <div class="regrade__current">
      <span class="app-muted">{{ t('grades.regrade.current', { what }) }}</span>
      <ScoreText :score="grade.score" :out-of="outOf" />
    </div>
    <p class="app-form-hint regrade__intro">{{ t('grades.regrade.intro') }}</p>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="pending">
      <el-form-item :label="t('grades.form.newScore')" prop="score">
        <div class="regrade__score">
          <el-input v-model="form.score" inputmode="decimal" class="regrade__score-input" />
          <span class="regrade__of">/ {{ formatDecimal(outOf) }}</span>
        </div>
      </el-form-item>
      <el-form-item v-if="aboveMax || form.allowExtra">
        <el-checkbox v-model="form.allowExtra" :label="t('grades.form.allowExtra')" />
        <p class="app-form-hint grades-hint">{{ t('grades.form.allowExtraHelp') }}</p>
      </el-form-item>

      <el-form-item :label="t('grades.breakdown.title')" :error="breakdownOk ? '' : t('grades.form.breakdownInvalid')">
        <BreakdownEditor v-model="form.breakdown" :disabled="pending" @use-total="(v) => (form.score = v)" />
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
      <el-button type="primary" :loading="pending" :disabled="!course.writable" @click="submit">
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
</style>

<style>
/* Dialogs are teleported out of this component; keep them inside a phone screen. */
.grades-dialog {
  max-width: calc(100vw - 24px);
}
.grades-dialog .grades-hint {
  flex-basis: 100%;
  margin: 4px 0 0;
}
</style>
