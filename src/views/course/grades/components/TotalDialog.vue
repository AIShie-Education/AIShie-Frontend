<script setup lang="ts">
// A person's say on one of a student's totals: overriding it with a score of
// their own and the reason (grade.override_total), or writing the student a
// comment on it (grade.comment_total). The total worked out stays beside an
// override, and the student sees the override and the comment, never who made
// the override or why. Each takes grade_submit and grade_post, as a regrade
// does, and a reach over the whole course; Core's refusals are said in words.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import type { ToolOut, WriteOutcome } from '@/api/http'
import type { Decimal } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { formatPct, plainDecimal } from './grading'

type Mode = 'override' | 'comment'
const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  mode: Mode
  courseId: string
  studentMemberId: string
  componentId: string
  /** What the total is, in words: "Course total", "Total for Exams". */
  what: string
  /** The percentage worked out now, to show beside an override. */
  computedPercent: Decimal | null
  /** The override there is now, to start from. */
  current?: { score: Decimal; reason?: string | null } | null
  /** The comment there is now. */
  feedback?: string | null
}>()
const emit = defineEmits<{ done: [out: WriteOutcome<ToolOut<'grade.override_total'>>] }>()
const { t } = useI18n()
const course = useCourseStore()
const overrideWrite = useWrite('grade.override_total')
const commentWrite = useWrite('grade.comment_total')
const pending = computed(() => overrideWrite.pending.value || commentWrite.pending.value)
const needsApproval = computed(() => course.needsApprovalAll(['grade_submit', 'grade_post']))
const REASONS = ['grades.override.refusal']
const MAX_REASON = 500

const formRef = ref<FormInstance>()
const form = reactive({ score: '', reason: '', feedback: '' })
watch(
  open,
  (v) => {
    if (!v) return
    form.score = props.current ? (plainDecimal(props.current.score) ?? '') : ''
    form.reason = props.current?.reason ?? ''
    form.feedback = props.feedback ?? ''
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const rules = computed<FormRules>(() => ({
  score: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        const s = (v ?? '').trim()
        if (!s) return cb(new Error(t('common.errors.required')))
        const p = plainDecimal(s)
        return p === null || p.startsWith('-') ? cb(new Error(t('grades.override.scoreInvalid'))) : cb()
      },
      trigger: 'blur',
    },
  ],
  reason: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        const s = (v ?? '').trim()
        if (!s) return cb(new Error(t('common.errors.required')))
        return [...s].length > MAX_REASON ? cb(new Error(t('grades.override.reasonLong'))) : cb()
      },
      trigger: 'blur',
    },
  ],
}))

async function submit() {
  const target = {
    course_id: props.courseId,
    student_member_id: props.studentMemberId,
    component_id: props.componentId,
  }
  if (props.mode === 'override') {
    if (!(await formRef.value?.validate().catch(() => false))) return
    const out = await overrideWrite.run(
      { ...target, score: form.score.trim(), reason: form.reason.trim() },
      { success: false, reasons: REASONS },
    )
    if (!out) return
    if (out.status === 'executed' && !out.replayed) {
      ElMessage(
        out.result.changed
          ? {
              type: 'success',
              message: out.result.snapshots
                ? t('grades.override.done', { n: out.result.snapshots })
                : t('grades.override.doneTop'),
            }
          : { type: 'info', message: t('grades.override.unchanged') },
      )
    }
    open.value = false
    emit('done', out)
    return
  }
  const feedback = form.feedback.trim() ? form.feedback : ''
  const out = await commentWrite.run({ ...target, feedback }, { success: false, reasons: REASONS })
  if (!out) return
  if (out.status === 'executed' && !out.replayed) {
    ElMessage(
      !out.result.changed
        ? { type: 'info', message: t('grades.override.unchanged') }
        : {
            type: 'success',
            message: feedback ? t('grades.override.commentSaved') : t('grades.override.commentRemoved'),
          },
    )
  }
  open.value = false
  emit('done', out)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="mode === 'override' ? t('grades.override.title', { what }) : t('grades.override.commentTitle', { what })"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="total-dialog__intro">
      {{ mode === 'override' ? t('grades.override.intro') : t('grades.override.commentIntro') }}
    </p>
    <el-form
      ref="formRef"
      :model="form"
      :rules="mode === 'override' ? rules : {}"
      :validate-on-rule-change="false"
      label-position="top"
      :disabled="pending"
      @submit.prevent="submit"
    >
      <template v-if="mode === 'override'">
        <el-form-item :label="t('grades.override.score')" prop="score">
          <el-input v-model="form.score" name="score" inputmode="decimal" class="total-dialog__score" />
          <div class="app-form-hint total-dialog__hint">
            {{ t('grades.override.scoreHint', { value: formatPct(computedPercent) }) }}
          </div>
        </el-form-item>
        <el-form-item :label="t('grades.override.reason')" prop="reason">
          <el-input
            v-model="form.reason"
            name="reason"
            type="textarea"
            :rows="3"
            :maxlength="MAX_REASON"
            show-word-limit
            :placeholder="t('grades.override.reasonPlaceholder')"
          />
          <div class="app-form-hint total-dialog__hint">{{ t('grades.override.reasonHint') }}</div>
        </el-form-item>
      </template>
      <el-form-item v-else :label="t('grades.override.commentLabel')">
        <MarkdownEditor v-model="form.feedback" :rows="6" />
      </el-form-item>
    </el-form>
    <el-alert v-if="needsApproval" type="info" :closable="false" show-icon :title="t('grades.override.approvalNote')" />
    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!course.writable" @click="submit">
        {{ mode === 'override' ? t('grades.override.submit') : t('common.actions.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.total-dialog__intro {
  margin: 0 0 14px;
  line-height: var(--app-lh-text);
}
.total-dialog__score {
  max-width: 180px;
}
.total-dialog__hint {
  width: 100%;
}
</style>
