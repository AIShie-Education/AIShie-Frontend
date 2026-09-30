<script setup lang="ts">
// Entering a draft grade for one submission (grade.submit), with the rubric
// beside the form. A draft is not visible to the student until it is posted;
// for a seat whose grading waits for approval, the grade does not exist at
// all until someone approves it.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, type FormInstance, type FormItemRule } from 'element-plus'
import { read, type UploadedFile } from '@/api/http'
import type { ActionSummary, Assignment, GradeSummary, Submission } from '@/api/types'
import DocumentFileLink from '@/components/DocumentFileLink.vue'
import FileDropZone from '@/components/FileDropZone.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatDecimal, isDecimal } from '@/utils/format'
import BreakdownEditor, { type BreakdownRow } from './BreakdownEditor.vue'
import RubricPanel from './RubricPanel.vue'
import { decimalAbove, isNonNegativeDecimal } from './decimal'
import { proposalFate } from './proposals'
import { loadRubric, rubricArgs } from './rubric'

const props = defineProps<{
  courseId: string
  submission: Submission
  /** Undefined when the assignment could not be read. */
  assignment?: Assignment
  /** The live draft grade for this work, if one is known. */
  liveDraft?: GradeSummary
  /** The live posted grade for this work, if one is known. */
  livePosted?: GradeSummary
  /** The caller cannot read grades, so whether any exist is not known. */
  gradesHidden?: boolean
  /** Grades proposed for this work and waiting for approval. */
  proposals?: ActionSummary[]
}>()
const emit = defineEmits<{ graded: [] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('grade.submit')

/** Whether the form is offered: the work is handed in (or missing) and has no posted grade. */
const showForm = computed(() => course.writable && props.submission.state !== 'draft' && !props.livePosted)

// The rubric is read only when there is a form to grade with beside it.
const rubric = useAsync(
  async () => (showForm.value ? loadRubric(props.courseId, props.assignment, course.can('rubric_read')) : undefined),
  { watch: [() => props.assignment?.id, () => props.assignment?.rubric_document_id, showForm] },
)

interface Form {
  score: string
  allowExtra: boolean
  breakdown: BreakdownRow[]
  feedback: string
  files: UploadedFile[]
}
const blank = (): Form => ({ score: '', allowExtra: false, breakdown: [], feedback: '', files: [] })
const form = reactive<Form>(blank())
const formRef = ref<FormInstance>()

type Outcome = { status: 'executed'; gradeId: string; review: boolean } | { status: 'proposed' }
const outcome = ref<Outcome | null>(null)

const points = computed(() => props.assignment?.points_possible)
const pointsText = computed(() => (points.value === undefined ? '' : formatDecimal(points.value, 4)))
const above = computed(() => points.value !== undefined && decimalAbove(form.score.trim(), points.value))
const missing = computed(() => props.submission.state === 'missing')
const needsApproval = computed(() => course.needsApproval('grade_submit'))

// Grades proposed for this work that wait for approval. Approving one is
// refused once a draft newer than it exists (Core's noNewerDraft), so a
// draft saved now stops those not already behind a newer draft. A grade the
// caller enters is itself a proposal when their grading needs approval: the
// one proposed later then stands, whichever is approved first.
const proposed = computed(() => props.proposals ?? [])
const proposedByMe = computed(() => proposed.value.filter((p) => p.member_id === course.myMemberId))
const wouldStop = computed(() =>
  needsApproval.value ? [] : proposed.value.filter((p) => proposalFate(p, props.liveDraft) !== 'newerDraft'),
)
const proposedHint = computed(() => {
  if (needsApproval.value) {
    if (proposedByMe.value.length) return t('submissions.grade.pending.mine')
    if (proposed.value.length) return t('submissions.grade.pending.otherPropose')
    return null
  }
  return wouldStop.value.length ? t('submissions.grade.pending.other') : null
})

function breakdownValid(): boolean {
  return form.breakdown.every(
    (r) => !!r.criterion.trim() && isNonNegativeDecimal(r.points) && isNonNegativeDecimal(r.max),
  )
}

const rules: Record<string, FormItemRule[]> = {
  score: [
    {
      // Checked on blur and on saving only: a rule without a trigger would
      // also run when the form is cleared after saving, and flag it at once.
      required: true,
      trigger: 'blur',
      validator: (_rule, _value, callback) => {
        const s = form.score.trim()
        if (!s) return callback(new Error(t('common.errors.required')))
        if (!isDecimal(s)) return callback(new Error(t('common.errors.invalidDecimal')))
        if (!isNonNegativeDecimal(s)) return callback(new Error(t('submissions.grade.scoreNegative')))
        if (above.value && !form.allowExtra) {
          return callback(new Error(t('submissions.grade.scoreAbove', { points: pointsText.value })))
        }
        callback()
      },
    },
  ],
}
// The breakdown is checked here rather than by a form rule: a failing form
// item marks every input inside it, and the editor marks only the bad ones.
const breakdownChecked = ref(false)
const breakdownError = computed(() => breakdownChecked.value && !breakdownValid())
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

/**
 * The feedback files of the draft the form was filled from. They belong to
 * that draft and stay with it when the new one replaces it, so they are named
 * beside the uploader, to be uploaded again if they should come along.
 */
type DraftFiles = { document_id: string; title: string }[] | 'loading' | 'failed'
const draftFiles = ref<DraftFiles | null>(null)
let draftFilesSeq = 0

async function loadDraftFiles(gradeId: string) {
  const mine = ++draftFilesSeq
  draftFiles.value = 'loading'
  try {
    // grade.list does not carry feedback files; grade.get does.
    const full = await read('grade.get', { course_id: props.courseId, grade_id: gradeId })
    if (mine === draftFilesSeq) draftFiles.value = full.feedback_files ?? []
  } catch {
    if (mine === draftFilesSeq) draftFiles.value = 'failed'
  }
}
const draftFileList = computed(() => (Array.isArray(draftFiles.value) ? draftFiles.value : []))
const draftFilesHint = computed(() => {
  if (draftFiles.value === 'failed') return t('submissions.grade.draftFilesUnknown')
  return draftFileList.value.length ? t('submissions.grade.draftFiles') : null
})

/** Fills the form from the current draft, to change it rather than start again. */
function startFromDraft() {
  const g = props.liveDraft
  if (!g) return
  void loadDraftFiles(g.id)
  form.score = String(g.score)
  form.feedback = g.feedback ?? ''
  form.allowExtra = decimalAbove(g.score, points.value)
  const rows = Array.isArray(g.breakdown) ? (g.breakdown as Record<string, unknown>[]) : []
  let key = Date.now()
  form.breakdown = rows.map((r) => ({
    key: key++,
    criterion: String(r.criterion ?? ''),
    points: r.points === undefined || r.points === null ? '' : String(r.points),
    max: r.max === undefined || r.max === null ? '' : String(r.max),
    comment: typeof r.comment === 'string' ? r.comment : '',
  }))
  formRef.value?.clearValidate()
}

// Remounting the uploader on a reset also clears any row it left behind,
// and stops what was still uploading.
const uploaderKey = ref(0)
/** A feedback file is still uploading: saving now would go without it. */
const uploadingFiles = ref(false)

function reset() {
  Object.assign(form, blank())
  draftFilesSeq++
  draftFiles.value = null
  breakdownChecked.value = false
  uploaderKey.value++
  formRef.value?.clearValidate()
}

async function submit() {
  if (uploadingFiles.value) return
  breakdownChecked.value = true
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !breakdownValid()) return
  const stops = wouldStop.value.length > 0
  const confirmText = props.liveDraft
    ? stops
      ? t('submissions.grade.replaceAndStopConfirm')
      : t('submissions.grade.replaceConfirm')
    : stops
      ? t('submissions.grade.stopConfirm')
      : null
  if (confirmText) {
    try {
      await ElMessageBox.confirm(confirmText, t('common.confirm.title'), {
        type: 'warning',
        confirmButtonText: t('common.actions.confirm'),
        cancelButtonText: t('common.actions.cancel'),
      })
    } catch {
      return
    }
  }
  const out = await run(
    {
      course_id: props.courseId,
      submission_id: props.submission.id,
      score: form.score.trim(),
      // What the grader was looking at: nothing handed in, or work. The grade
      // is refused if that has changed by the time it is entered.
      for_missing: missing.value,
      // What the score is out of, as shown: refused if the work is rescaled.
      out_of: props.assignment ? String(props.assignment.points_possible) : undefined,
      allow_extra: above.value && form.allowExtra ? true : undefined,
      feedback: form.feedback.trim() ? form.feedback : undefined,
      breakdown: form.breakdown.length
        ? form.breakdown.map((r) => ({
            criterion: r.criterion.trim(),
            points: r.points.trim(),
            max: r.max.trim(),
            comment: r.comment.trim() || undefined,
          }))
        : undefined,
      feedback_files: form.files.length
        ? form.files.map((f) => ({ title: f.fileName, upload_token: f.uploadToken }))
        : undefined,
      ...rubricArgs(rubric.data.value),
    },
    { success: t('submissions.grade.saved') },
  )
  if (!out) return
  outcome.value =
    out.status === 'executed'
      ? { status: 'executed', gradeId: out.result.grade_id, review: out.reviewState === 'pending' }
      : { status: 'proposed' }
  reset()
  emit('graded')
}
</script>

<template>
  <section class="app-card grade-panel">
    <h2 class="app-card__title">
      <span>{{ t('submissions.grade.title') }}</span>
      <el-tag v-if="needsApproval" type="warning" size="small" disable-transitions>
        {{ t('enums.level.confirm_required') }}
      </el-tag>
    </h2>

    <el-alert
      v-if="outcome?.status === 'executed'"
      type="success"
      :title="t('submissions.grade.saved')"
      show-icon
      class="grade-panel__alert"
      @close="outcome = null"
    >
      <p class="grade-panel__alert-text">
        {{ t('submissions.grade.savedBody') }}
        <template v-if="outcome.review">{{ t('submissions.grade.savedReview') }}</template>
      </p>
      <div class="grade-panel__links">
        <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: outcome.gradeId } }">
          {{ t('submissions.grade.openGrade') }}
        </router-link>
        <router-link
          :to="{ name: 'course-grades', params: { courseId }, query: { assignment: submission.assignment_id } }"
        >
          {{ course.can('grade_post') ? t('submissions.grade.postGrades') : t('submissions.links.grades') }}
        </router-link>
      </div>
    </el-alert>
    <el-alert
      v-else-if="outcome?.status === 'proposed'"
      type="info"
      :title="t('submissions.grade.proposedTitle')"
      show-icon
      class="grade-panel__alert"
      @close="outcome = null"
    >
      <p class="grade-panel__alert-text">{{ t('submissions.grade.proposedBody') }}</p>
      <div class="grade-panel__links">
        <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
          {{ t('submissions.grade.myActions') }}
        </router-link>
      </div>
    </el-alert>

    <p v-if="!course.writable" class="app-muted grade-panel__note">{{ t('submissions.grade.archived') }}</p>
    <p v-else-if="submission.state === 'draft'" class="app-muted grade-panel__note">
      {{ t('submissions.grade.notYet') }}
    </p>
    <el-alert v-else-if="livePosted" type="info" :closable="false" show-icon>
      <p class="grade-panel__alert-text">{{ t('submissions.grade.postedExists') }}</p>
      <div class="grade-panel__links">
        <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: livePosted.id } }">
          {{ t('submissions.grade.openPosted') }}
        </router-link>
      </div>
    </el-alert>

    <template v-else>
      <p v-if="needsApproval" class="app-form-hint grade-panel__hint">{{ t('submissions.grade.needsApprovalHint') }}</p>
      <p v-else-if="course.permsSource === 'unknown'" class="app-form-hint grade-panel__hint">
        {{ t('common.permissionUnknown') }}
      </p>
      <el-alert v-if="gradesHidden" type="info" :closable="false" show-icon class="grade-panel__alert">
        {{ t('submissions.grade.gradesHidden') }}
      </el-alert>
      <el-alert
        v-if="proposedHint && outcome?.status !== 'proposed'"
        type="warning"
        :closable="false"
        show-icon
        class="grade-panel__alert"
      >
        {{ proposedHint }}
      </el-alert>
      <el-alert v-if="missing" type="warning" :closable="false" show-icon class="grade-panel__alert">
        {{ t('submissions.grade.forMissing') }}
      </el-alert>
      <el-alert v-if="liveDraft" type="info" :closable="false" show-icon class="grade-panel__alert">
        <p class="grade-panel__alert-text">
          {{
            t('submissions.grade.draftExists', {
              score: pointsText
                ? `${formatDecimal(liveDraft.score, 4)} / ${pointsText}`
                : formatDecimal(liveDraft.score, 4),
            })
          }}
        </p>
        <div class="grade-panel__links">
          <el-button link type="primary" @click="startFromDraft">{{ t('submissions.grade.startFromDraft') }}</el-button>
          <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: liveDraft.id } }">
            {{ t('submissions.grade.openDraft') }}
          </router-link>
        </div>
      </el-alert>

      <div class="grade-panel__grid">
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          class="grade-panel__form"
          @submit.prevent="submit"
        >
          <el-form-item :label="t('submissions.grade.score')" prop="score">
            <div class="grade-panel__score">
              <el-input
                v-model="form.score"
                inputmode="decimal"
                :placeholder="t('submissions.grade.scorePlaceholder')"
                class="grade-panel__score-input"
              />
              <span v-if="pointsText" class="app-muted">{{
                t('submissions.grade.outOf', { points: pointsText })
              }}</span>
            </div>
          </el-form-item>
          <el-form-item v-if="above || form.allowExtra">
            <el-checkbox v-model="form.allowExtra" :label="t('submissions.grade.allowExtra')" />
          </el-form-item>

          <el-form-item :label="t('submissions.grade.breakdown')">
            <div class="grade-panel__block">
              <BreakdownEditor v-model="form.breakdown" :strict="breakdownChecked" @use-total="useTotal" />
              <div v-if="breakdownError" class="grade-panel__error" role="alert">
                {{ t('submissions.breakdown.invalid') }}
              </div>
              <div class="app-form-hint">{{ t('submissions.grade.breakdownHint') }}</div>
            </div>
          </el-form-item>

          <el-form-item :label="t('submissions.grade.feedback')">
            <MarkdownEditor
              v-model="form.feedback"
              :rows="8"
              :placeholder="t('submissions.grade.feedbackPlaceholder')"
            />
          </el-form-item>

          <el-form-item :label="t('submissions.grade.files')">
            <div class="grade-panel__block">
              <FileDropZone
                :key="uploaderKey"
                v-model="form.files"
                v-model:uploading="uploadingFiles"
                :course-id="courseId"
                kind="feedback"
                multiple
                compact
              />
              <div v-if="draftFilesHint" class="grade-panel__draft-files" role="note">
                <p class="grade-panel__draft-files-text">{{ draftFilesHint }}</p>
                <ul v-if="draftFileList.length" class="grade-panel__draft-files-list">
                  <li v-for="f in draftFileList" :key="f.document_id">
                    <DocumentFileLink :course-id="courseId" :document-id="f.document_id" :title="f.title" />
                  </li>
                </ul>
              </div>
              <div class="app-form-hint">{{ t('submissions.grade.filesHint') }}</div>
            </div>
          </el-form-item>

          <div class="grade-panel__actions">
            <el-button
              type="primary"
              native-type="submit"
              :loading="pending"
              :disabled="rubric.loading.value || uploadingFiles"
            >
              {{ needsApproval ? t('submissions.grade.propose') : t('submissions.grade.submit') }}
            </el-button>
            <el-button :disabled="pending" @click="reset">{{ t('submissions.grade.reset') }}</el-button>
            <span v-if="uploadingFiles" class="grade-panel__why">{{ t('common.upload.waitToSave') }}</span>
          </div>
        </el-form>

        <aside class="grade-panel__rubric">
          <RubricPanel
            :course-id="courseId"
            :state="rubric.data.value"
            :loading="rubric.loading.value"
            :error="rubric.error.value"
          />
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.grade-panel__why {
  align-self: center;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.grade-panel__alert {
  margin-bottom: 12px;
}
.grade-panel__alert-text {
  margin: 0 0 4px;
  line-height: 1.5;
}
.grade-panel__links {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.grade-panel__note {
  margin: 0;
  font-size: 13px;
}
.grade-panel__hint {
  margin: -4px 0 12px;
}
/* The card's own width decides its columns, not the window's: the side bar takes from it. */
.grade-panel {
  container-type: inline-size;
}
.grade-panel__grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 24px;
  align-items: start;
}
.grade-panel__rubric {
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
}
.grade-panel__block {
  width: 100%;
}
.grade-panel__error {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-danger);
}
.grade-panel__links a {
  text-decoration: none;
}
.grade-panel__links a:hover {
  text-decoration: underline;
}
.grade-panel__score {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.grade-panel__score-input {
  width: 140px;
}
.grade-panel__draft-files {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: var(--app-radius-control);
  border: 1px solid var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
  font-size: 13px;
  line-height: 1.5;
}
.grade-panel__draft-files-text {
  margin: 0;
}
.grade-panel__draft-files-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}
.grade-panel__draft-files-list :deep(.el-button span) {
  white-space: normal;
  text-align: left;
  overflow-wrap: anywhere;
}
.grade-panel__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
/* Two columns (3 : 2) while the grading one keeps 420 px or more. */
@container (max-width: 723px) {
  .grade-panel__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  /* On a narrow screen the rubric comes first: it is read before grading. */
  .grade-panel__rubric {
    order: -1;
    position: static;
    max-height: 360px;
  }
}
</style>
