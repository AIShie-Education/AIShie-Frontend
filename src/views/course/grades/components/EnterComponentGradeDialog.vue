<script setup lang="ts">
// grade.submit for a directly graded component (an exam): a draft grade for
// one student, which is released later with grade.post. Assignment work is
// graded from its submission instead.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import { read, type ToolOut, type UploadedFile, type WriteOutcome } from '@/api/http'
import type { Component, GradeSummary } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatDecimal, isDecimal } from '@/utils/format'
import FileUploader from '@/components/FileUploader.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import StatusTag from '@/components/StatusTag.vue'
import BreakdownEditor from './BreakdownEditor.vue'
import ScoreText from './ScoreText.vue'
import { breakdownForApi, decimalGreater, type BreakdownDraft } from './grading'

const visible = defineModel<boolean>({ default: false })
const props = defineProps<{
  courseId: string
  components: Component[]
  /** Loading or refused: the scheme could not be read. */
  componentsLoading?: boolean
  studentMemberId?: string
}>()
const emit = defineEmits<{ done: [out: WriteOutcome<ToolOut<'grade.submit'>>] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('grade.submit')

const formRef = ref<FormInstance>()
const form = reactive({
  componentId: '' as string,
  studentMemberId: undefined as string | undefined,
  score: '',
  allowExtra: false,
  feedback: '',
  files: [] as UploadedFile[],
  breakdown: [] as BreakdownDraft[],
})
const showBreakdown = ref(false)

const component = computed(() => props.components.find((c) => c.id === form.componentId))
const outOf = computed(() => component.value?.points_possible ?? null)
const aboveMax = computed(() => isDecimal(form.score) && decimalGreater(form.score, outOf.value))
const needsApproval = computed(() => course.needsApproval('grade_submit'))

function onOpen() {
  form.componentId = props.components.length === 1 ? props.components[0].id : ''
  form.studentMemberId = props.studentMemberId
  form.score = ''
  form.allowExtra = false
  form.feedback = ''
  form.files = []
  form.breakdown = []
  showBreakdown.value = false
  existing.value = []
}

// What the student already has on this component: a posted grade is changed
// by regrading it, and a new draft replaces an earlier one.
const existing = ref<GradeSummary[]>([])
const checking = ref(false)
let lookup = 0
watch(
  () => [form.componentId, form.studentMemberId, visible.value] as const,
  async ([componentId, student, open]) => {
    existing.value = []
    if (!open || !componentId || !student) return
    const mine = ++lookup
    checking.value = true
    try {
      const found: GradeSummary[] = []
      let after: string | undefined
      for (let page = 0; page < 10; page++) {
        const out = await read('grade.list', {
          course_id: props.courseId,
          student_member_id: student,
          limit: 200,
          after,
        })
        for (const g of out.grades ?? []) {
          if (g.component_id === componentId && g.origin === 'entered' && g.state !== 'superseded') found.push(g)
        }
        if (!out.next) break
        after = out.next
      }
      if (mine === lookup) existing.value = found
    } catch {
      /* only a hint: Core still decides */
    } finally {
      if (mine === lookup) checking.value = false
    }
  },
)
const existingPosted = computed(() => existing.value.find((g) => g.state === 'posted'))
const existingDraft = computed(() => existing.value.find((g) => g.state === 'draft'))

const breakdownOk = computed(() =>
  (breakdownForApi(form.breakdown) ?? []).every(
    (b) => b.criterion && isDecimal(b.points) && isDecimal(b.max) && Number(b.points) >= 0 && Number(b.max) >= 0,
  ),
)

const rules = computed<FormRules>(() => ({
  componentId: [{ required: true, message: t('common.errors.required'), trigger: 'change' }],
  studentMemberId: [{ required: true, message: t('common.errors.required'), trigger: 'change' }],
  score: [
    {
      trigger: 'blur',
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        if (!v || !v.trim()) return cb(new Error(t('common.errors.required')))
        if (!isDecimal(v)) return cb(new Error(t('common.errors.invalidDecimal')))
        if (Number(v) < 0) return cb(new Error(t('grades.form.negative')))
        if (decimalGreater(v, outOf.value) && !form.allowExtra) return cb(new Error(t('grades.form.aboveMax')))
        cb()
      },
    },
  ],
}))

async function submit() {
  if (!formRef.value) return
  const ok = await formRef.value.validate().catch(() => false)
  if (!ok || !breakdownOk.value) return
  const out = await run(
    {
      course_id: props.courseId,
      component_id: form.componentId,
      student_member_id: form.studentMemberId,
      score: form.score.trim(),
      out_of: outOf.value ?? undefined,
      allow_extra: form.allowExtra || undefined,
      feedback: form.feedback.trim() || undefined,
      feedback_files: form.files.length
        ? form.files.map((f) => ({ title: f.fileName, upload_token: f.uploadToken }))
        : undefined,
      breakdown: breakdownForApi(form.breakdown),
    },
    { success: t('grades.enter.done') },
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
    :title="t('grades.enter.title')"
    width="560px"
    destroy-on-close
    @open="onOpen"
  >
    <p class="app-form-hint enter-dialog__intro">{{ t('grades.enter.intro') }}</p>

    <el-alert
      v-if="!componentsLoading && !components.length"
      type="info"
      :closable="false"
      show-icon
      :title="t('grades.enter.noComponents')"
    >
      <router-link :to="{ name: 'course-scheme', params: { courseId } }">{{ t('grades.enter.toScheme') }}</router-link>
    </el-alert>

    <el-form v-else ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="pending">
      <el-form-item :label="t('grades.enter.component')" prop="componentId">
        <el-select v-model="form.componentId" :loading="componentsLoading" filterable>
          <el-option v-for="c in components" :key="c.id" :value="c.id" :label="c.name">
            <span>{{ c.name }}</span>
            <span class="enter-dialog__meta">{{
              t('grades.enter.pointsPossible', { n: formatDecimal(c.points_possible) })
            }}</span>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item :label="t('grades.columns.student')" prop="studentMemberId">
        <MemberSelect v-model="form.studentMemberId" role="student" />
      </el-form-item>

      <div v-if="checking" class="app-form-hint">{{ t('grades.enter.checking') }}</div>
      <el-alert v-else-if="existingPosted" type="warning" :closable="false" show-icon class="enter-dialog__existing">
        <template #title>
          {{ t('grades.enter.hasPosted') }}
          <ScoreText :score="existingPosted.score" :out-of="outOf" hide-percent />
        </template>
        <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: existingPosted.id } }">
          {{ t('grades.enter.openToRegrade') }}
        </router-link>
      </el-alert>
      <el-alert v-else-if="existingDraft" type="info" :closable="false" show-icon class="enter-dialog__existing">
        <template #title>
          {{ t('grades.enter.hasDraft') }}
          <ScoreText :score="existingDraft.score" :out-of="outOf" hide-percent />
          <StatusTag vocab="gradeState" value="draft" />
        </template>
      </el-alert>

      <el-form-item :label="t('grades.form.score')" prop="score">
        <div class="enter-dialog__score">
          <el-input v-model="form.score" inputmode="decimal" class="enter-dialog__score-input" />
          <span class="enter-dialog__of">/ {{ formatDecimal(outOf) }}</span>
        </div>
      </el-form-item>
      <el-form-item v-if="aboveMax || form.allowExtra">
        <el-checkbox v-model="form.allowExtra" :label="t('grades.form.allowExtra')" />
        <p class="app-form-hint grades-hint">{{ t('grades.form.allowExtraHelp') }}</p>
      </el-form-item>

      <el-form-item :label="t('grades.form.feedback')">
        <MarkdownEditor v-model="form.feedback" :rows="5" :placeholder="t('grades.form.feedbackPlaceholder')" />
      </el-form-item>

      <el-form-item :label="t('grades.form.feedbackFiles')">
        <FileUploader v-model="form.files" :course-id="courseId" kind="feedback" multiple :disabled="pending" />
        <p class="app-form-hint grades-hint">{{ t('grades.form.feedbackFilesHelp') }}</p>
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="showBreakdown" :label="t('grades.form.addBreakdown')" />
      </el-form-item>
      <el-form-item
        v-if="showBreakdown"
        :label="t('grades.breakdown.title')"
        :error="breakdownOk ? '' : t('grades.form.breakdownInvalid')"
      >
        <BreakdownEditor v-model="form.breakdown" :disabled="pending" @use-total="(v) => (form.score = v)" />
      </el-form-item>

      <el-alert v-if="needsApproval" type="info" :closable="false" show-icon>
        {{ t('grades.enter.proposalNote') }}
      </el-alert>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!course.writable || !components.length" @click="submit">
        {{ needsApproval ? t('grades.enter.submitProposal') : t('grades.enter.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.enter-dialog__intro {
  margin: 0 0 12px;
}
.enter-dialog__meta {
  float: right;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 12px;
}
.enter-dialog__existing {
  margin-bottom: 16px;
}
.enter-dialog__existing :deep(.el-alert__title) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.enter-dialog__score {
  display: flex;
  align-items: center;
  gap: 8px;
}
.enter-dialog__score-input {
  width: 140px;
}
.enter-dialog__of {
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
