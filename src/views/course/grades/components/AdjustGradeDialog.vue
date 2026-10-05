<script setup lang="ts">
// grade.adjust: one member's grade given from their group's, set apart from
// it (a score of their own, or plus or minus the group's, with a reason the
// member reads) or brought back to it. A draft gets a new draft in its place,
// as entering one does (grade_submit); a posted grade a new posted grade at
// once, the old kept and the member's totals written again, as a regrade
// (grade_submit and grade_post, at the lower of the two).
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolOut, WriteOutcome } from '@/api/http'
import type { Decimal, GradeSummary } from '@/api/types'
import AppNote from '@/components/AppNote.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import AdjustmentText from '@/views/course/submissions/components/AdjustmentText.vue'
import {
  ADJUST_KINDS,
  REASON_MAX,
  memberScore,
  rowFrom,
  rowProblem,
  type AdjustKind,
  type AdjustRow,
} from '@/views/course/submissions/components/groupGrading'
import { formatScore } from './grading'

const visible = defineModel<boolean>({ default: false })
const props = defineProps<{
  courseId: string
  /** A member's live grade given from a group grade. */
  grade: Pick<GradeSummary, 'id' | 'state' | 'score' | 'student_member_id' | 'group'>
  /** The member, by name where it is known. */
  name: string
  pointsPossible?: Decimal | null
}>()
const emit = defineEmits<{ done: [out: WriteOutcome<ToolOut<'grade.adjust'>>] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('grade.adjust')

const posted = computed(() => props.grade.state === 'posted')
const needsApproval = computed(() =>
  posted.value ? course.needsApprovalAll(['grade_submit', 'grade_post']) : course.needsApproval('grade_submit'),
)
const groupScore = computed(() => String(props.grade.group?.score ?? ''))

const row = ref<AdjustRow>(rowFrom(props.grade.student_member_id, null))
const tried = ref(false)
// Opened with the grade's adjustment as it is now: mounted open, too.
watch(
  visible,
  (open) => {
    if (!open) return
    row.value = rowFrom(props.grade.student_member_id, props.grade.group?.adjustment)
    tried.value = false
  },
  { immediate: true },
)

const score = computed(() => memberScore(groupScore.value, row.value))
const problem = computed(() => rowProblem(row.value, groupScore.value, props.pointsPossible, false))
/** Above the points possible: Core takes it only where the group's grade allows extra, which is not known here. */
const blocking = computed(() => !!problem.value && problem.value !== 'abovePoints')
const problemText = computed(() => {
  const p = problem.value
  if (!p || (!tried.value && (p === 'reason' || (p === 'points' && !row.value.points.trim())))) return null
  return t(`groupGrading.editor.problem.${p === 'abovePoints' ? 'abovePointsMaybe' : p}`, {
    points: formatScore(props.pointsPossible),
    max: REASON_MAX,
  })
})

function setKind(v: string | number | boolean | undefined) {
  row.value = { ...row.value, kind: v as AdjustKind }
}

async function submit() {
  tried.value = true
  if (blocking.value) return
  const r = row.value
  const out = await run(
    {
      course_id: props.courseId,
      grade_id: props.grade.id,
      kind: r.kind,
      points: r.kind === 'none' ? undefined : r.points.trim(),
      reason: r.kind === 'none' ? undefined : r.reason.trim(),
    },
    { success: false, reasons: 'groupGrading.refusal' },
  )
  if (!out) return
  visible.value = false
  emit('done', out)
}
</script>

<template>
  <el-dialog v-model="visible" :title="t('groupGrading.adjust.title', { name })" width="560px" destroy-on-close>
    <dl class="adjust-dialog__now">
      <div>
        <dt>{{ t('groupGrading.adjust.groupScore') }}</dt>
        <dd>
          {{ t('groupGrading.score', { score: formatScore(grade.group?.score), points: formatScore(pointsPossible) }) }}
        </dd>
      </div>
      <div>
        <dt>{{ t('groupGrading.adjust.now') }}</dt>
        <dd>
          <span class="adjust-dialog__score">{{
            t('groupGrading.score', { score: formatScore(grade.score), points: formatScore(pointsPossible) })
          }}</span>
          <AdjustmentText :adjustment="grade.group?.adjustment" reason />
        </dd>
      </div>
    </dl>
    <p class="app-form-hint adjust-dialog__intro">
      {{ posted ? t('groupGrading.adjust.introPosted') : t('groupGrading.adjust.introDraft') }}
    </p>

    <el-form label-position="top" :disabled="pending" @submit.prevent="submit">
      <el-form-item :label="t('groupGrading.adjust.how')">
        <el-radio-group :model-value="row.kind" @update:model-value="setKind">
          <el-radio-button v-for="k in ADJUST_KINDS" :key="k" :value="k">{{
            t(`groupGrading.editor.kind.${k}`)
          }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <template v-if="row.kind !== 'none'">
        <el-form-item :label="t(`groupGrading.editor.points.${row.kind}`)">
          <el-input
            v-model="row.points"
            inputmode="decimal"
            class="adjust-dialog__points"
            :placeholder="t(`groupGrading.editor.pointsPlaceholder.${row.kind}`)"
          />
        </el-form-item>
        <el-form-item :label="t('groupGrading.editor.reason')">
          <el-input
            v-model="row.reason"
            type="textarea"
            :rows="2"
            :maxlength="REASON_MAX"
            show-word-limit
            :placeholder="t('groupGrading.editor.reasonPlaceholder')"
          />
        </el-form-item>
      </template>
      <p class="adjust-dialog__result" aria-live="polite">
        <template v-if="score !== null">{{
          t('groupGrading.adjust.result', { score: formatScore(score), points: formatScore(pointsPossible) })
        }}</template>
      </p>
      <p v-if="problemText" class="adjust-dialog__problem" :class="{ 'is-warning': !blocking }" role="alert">
        {{ problemText }}
      </p>
      <AppNote v-if="needsApproval">{{ t('groupGrading.adjust.approvalNote') }}</AppNote>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!course.writable" @click="submit">
        <span>{{ needsApproval ? t('groupGrading.adjust.propose') : t('groupGrading.adjust.submit') }}</span>
        <StatusTag
          v-if="needsApproval"
          vocab="level"
          value="confirm_required"
          size="small"
          class="adjust-dialog__approval"
        />
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.adjust-dialog__now {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--app-space-sm) var(--app-space-lg);
  margin: 0 0 var(--app-space-sm);
  padding: var(--app-space-sm) var(--app-space-md);
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-light);
}
.adjust-dialog__now dt {
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
  margin-bottom: 2px;
}
.adjust-dialog__now dd {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.adjust-dialog__score {
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
}
.adjust-dialog__intro {
  margin: 0 0 var(--app-space-md);
}
.adjust-dialog__points {
  width: 160px;
}
.adjust-dialog__result {
  margin: 0 0 var(--app-space-sm);
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
}
.adjust-dialog__problem {
  margin: 0 0 var(--app-space-sm);
  font-size: var(--app-text-xs);
  color: var(--el-color-danger);
}
.adjust-dialog__problem.is-warning {
  color: var(--app-ink-2);
}
.adjust-dialog__approval {
  margin-left: 6px;
}
</style>
