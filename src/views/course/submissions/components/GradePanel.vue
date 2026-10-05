<script setup lang="ts">
// Entering a draft grade for one submission (grade.submit), with the rubric
// beside the form. A draft is not visible to the student until it is posted;
// for a seat whose grading waits for approval, the grade does not exist at
// all until someone approves it.
//
// A draft says who drafted it: an agent with its avatar and "AI", a person by
// name. Filled into the form from an agent's draft, what it wrote carries a
// line at its left (--app-indigo) until the grader changes it, a note above
// the form says so, and each such field's label says it to a screen reader.
//
// A group's work is graded once: the group's score, feedback, breakdown,
// rubric and files, which every member of the work is given, and below them
// each member's line (GroupAdjustments), set apart from the group's score
// with a reason where the grader says so. Every member's line is sent, as it
// is shown, with the work's members, so that a proposal is refused if they
// change. Once a grade from it is posted the group is regraded instead.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, type FormInstance, type FormItemRule } from 'element-plus'
import { read, type UploadedFile } from '@/api/http'
import type { ActionSummary, Assignment, GradeSummary, Submission } from '@/api/types'
import AppNote from '@/components/AppNote.vue'
import StatusTag from '@/components/StatusTag.vue'
import DocumentFiles from '@/components/DocumentFiles.vue'
import FileDropZone from '@/components/FileDropZone.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import MemberName from '@/components/MemberName.vue'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatDecimal, isDecimal } from '@/utils/format'
import BreakdownEditor, { type BreakdownRow } from './BreakdownEditor.vue'
import GroupAdjustments from './GroupAdjustments.vue'
import {
  adjustmentsArg,
  anyAbove,
  liveByMember,
  rowProblem,
  rowsFor,
  workMemberIds,
  type AdjustRow,
} from './groupGrading'
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
  /** A group's work: every grade read for it, each member's own. */
  workGrades?: GradeSummary[]
}>()
const emit = defineEmits<{ graded: [] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('grade.submit')
onMounted(() => void course.ensureMembers())

/** A group's work: one group grade, each member's grade given from it. */
const isGroup = computed(() => !!props.submission.group_id)

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

/** gradeId: the grade written; null for a group's work, which gives each member a grade of their own. */
type Outcome =
  { status: 'executed'; gradeId: string | null; review: boolean; members?: number | null } | { status: 'proposed' }
const outcome = ref<Outcome | null>(null)

// Each member's line, as their grade on the work has it now: what Core
// would carry, shown, and sent as shown.
const members = computed(() => (isGroup.value ? workMemberIds(props.submission) : []))
const liveGrades = computed(() => liveByMember(props.workGrades ?? [], props.submission.id))
const carried = computed(() => rowsFor(members.value, liveGrades.value))
const adjustRows = ref<AdjustRow[]>([])
/** What the lines are read from: read again (after saving), they start from it again. */
const carriedKey = computed(() => JSON.stringify(carried.value))
watch(carriedKey, () => (adjustRows.value = carried.value.map((r) => ({ ...r }))), { immediate: true })

const points = computed(() => props.assignment?.points_possible)
const pointsText = computed(() => (points.value === undefined ? '' : formatDecimal(points.value, 4)))
/** The score typed is above the points possible. */
const scoreAbove = computed(() => points.value !== undefined && decimalAbove(form.score.trim(), points.value))
/** The score, or a member's score from it, is above the points possible: extra is offered. */
const above = computed(
  () =>
    scoreAbove.value ||
    (isGroup.value && points.value !== undefined && anyAbove(adjustRows.value, form.score, points.value)),
)
/** A member's line that is wrong: the form is not saved. */
const rowsValid = () =>
  adjustRows.value.every((r) => !rowProblem(r, form.score, points.value, above.value && form.allowExtra))
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
        if (scoreAbove.value && !form.allowExtra) {
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
/** The members' lines say what is missing too, once saving was tried. */
const rowsChecked = ref(false)
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

/** Who drafted the live draft, where the member list says: its seat, and whether it is an agent's. */
const drafter = computed(() => {
  const id = props.liveDraft?.grader_member_id
  const name = course.memberName(id)
  return id && name ? { id, name, agent: course.members.get(id)?.kind === 'agent' } : null
})

/**
 * What an agent's draft filled in, as it filled it in: a field still the
 * same is marked as the agent's. Nothing while the form was not filled
 * from an agent's draft.
 */
interface Prefill {
  name: string
  score: string
  feedback: string
  breakdown: string
}
const prefill = ref<Prefill | null>(null)
const breakdownKey = (rows: BreakdownRow[]) =>
  JSON.stringify(rows.map((r) => [r.criterion, r.points, r.max, r.comment]))
const untouched = computed(() => {
  const p = prefill.value
  return {
    score: !!p && form.score === p.score,
    feedback: !!p && !!p.feedback && form.feedback === p.feedback,
    breakdown: !!p && p.breakdown !== '[]' && breakdownKey(form.breakdown) === p.breakdown,
  }
})
const anyUntouched = computed(() => Object.values(untouched.value).some(Boolean))

/** Fills the form from the current draft, to change it rather than start again. */
function startFromDraft() {
  const g = props.liveDraft
  if (!g) return
  void loadDraftFiles(g.id)
  // A member's grade from a group grade: the group's score, not the member's own.
  const score = g.group?.score ?? g.score
  form.score = String(score)
  form.feedback = g.feedback ?? ''
  form.allowExtra = decimalAbove(score, points.value)
  const rows = Array.isArray(g.breakdown) ? (g.breakdown as Record<string, unknown>[]) : []
  let key = Date.now()
  form.breakdown = rows.map((r) => ({
    key: key++,
    criterion: String(r.criterion ?? ''),
    points: r.points === undefined || r.points === null ? '' : String(r.points),
    max: r.max === undefined || r.max === null ? '' : String(r.max),
    comment: typeof r.comment === 'string' ? r.comment : '',
  }))
  const d = drafter.value
  prefill.value =
    d?.agent && d.id === g.grader_member_id
      ? { name: d.name, score: form.score, feedback: form.feedback, breakdown: breakdownKey(form.breakdown) }
      : null
  formRef.value?.clearValidate()
}

// Remounting the uploader on a reset also clears any row it left behind,
// and stops what was still uploading.
const uploaderKey = ref(0)
/** A feedback file is still uploading: saving now would go without it. */
const uploadingFiles = ref(false)

function reset() {
  Object.assign(form, blank())
  prefill.value = null
  draftFilesSeq++
  draftFiles.value = null
  breakdownChecked.value = false
  rowsChecked.value = false
  adjustRows.value = carried.value.map((r) => ({ ...r }))
  uploaderKey.value++
  formRef.value?.clearValidate()
}

async function submit() {
  if (uploadingFiles.value) return
  breakdownChecked.value = true
  rowsChecked.value = true
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !breakdownValid() || !rowsValid()) return
  const stops = wouldStop.value.length > 0
  const confirmText = props.liveDraft
    ? stops
      ? t('submissions.grade.replaceAndStopConfirm')
      : isGroup.value
        ? t('groupGrading.panel.replaceConfirm')
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
        ? form.files.map((f) => ({ title: f.fileName, upload_token: f.uploadToken, filename: f.fileName }))
        : undefined,
      ...rubricArgs(rubric.data.value),
      // A group's work: every member's line as shown, and whose work it is as
      // shown, which a proposal is refused on approval if it changes.
      ...(isGroup.value ? { adjustments: adjustmentsArg(adjustRows.value), members: members.value } : {}),
    },
    { success: t('submissions.grade.saved'), reasons: isGroup.value ? 'groupGrading.refusal' : undefined },
  )
  if (!out) return
  outcome.value =
    out.status === 'executed'
      ? {
          status: 'executed',
          gradeId: out.result.grade_id ?? null,
          review: out.reviewState === 'pending',
          members: out.result.member_grades?.length ?? null,
        }
      : { status: 'proposed' }
  reset()
  emit('graded')
}
</script>

<template>
  <section class="app-card grade-panel">
    <h2 class="app-card__title">
      <span>{{ t('submissions.grade.title') }}</span>
      <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
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
        {{
          outcome.members
            ? t('groupGrading.panel.savedBody', { n: outcome.members }, outcome.members)
            : t('submissions.grade.savedBody')
        }}
        <template v-if="outcome.review">{{ t('submissions.grade.savedReview') }}</template>
      </p>
      <div class="grade-panel__links">
        <router-link
          v-if="outcome.gradeId"
          :to="{ name: 'course-grade', params: { courseId, gradeId: outcome.gradeId } }"
        >
          {{ t('submissions.grade.openGrade') }}
        </router-link>
        <router-link
          :to="{ name: 'course-grades', params: { courseId }, query: { assignment: submission.assignment_id } }"
        >
          {{ course.can('grade_post') ? t('submissions.grade.postGrades') : t('submissions.links.grades') }}
        </router-link>
      </div>
    </el-alert>
    <AppNote
      v-else-if="outcome?.status === 'proposed'"
      :title="t('submissions.grade.proposedTitle')"
      class="grade-panel__alert"
      @close="outcome = null"
      closable
    >
      <p class="grade-panel__alert-text">{{ t('submissions.grade.proposedBody') }}</p>
      <div class="grade-panel__links">
        <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
          {{ t('submissions.grade.myActions') }}
        </router-link>
      </div>
    </AppNote>

    <p v-if="!course.writable" class="app-muted grade-panel__note">{{ t('submissions.grade.archived') }}</p>
    <p v-else-if="submission.state === 'draft'" class="app-muted grade-panel__note">
      {{ t('submissions.grade.notYet') }}
    </p>
    <AppNote v-else-if="livePosted">
      <p class="grade-panel__alert-text">
        {{ isGroup ? t('groupGrading.panel.postedExists') : t('submissions.grade.postedExists') }}
      </p>
      <div class="grade-panel__links">
        <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: livePosted.id } }">
          {{ isGroup ? t('groupGrading.panel.openPosted') : t('submissions.grade.openPosted') }}
        </router-link>
      </div>
    </AppNote>

    <template v-else>
      <p v-if="needsApproval" class="app-form-hint grade-panel__hint">{{ t('submissions.grade.needsApprovalHint') }}</p>
      <p v-else-if="course.permsSource === 'unknown'" class="app-form-hint grade-panel__hint">
        {{ t('common.permissionUnknown') }}
      </p>
      <AppNote v-if="gradesHidden" class="grade-panel__alert">
        {{ t('submissions.grade.gradesHidden') }}
      </AppNote>
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
      <AppNote v-if="liveDraft" class="grade-panel__alert">
        <p v-if="drafter" class="grade-panel__alert-text grade-panel__drafter">
          <i18n-t keypath="submissions.grade.draftBy" tag="span" scope="global">
            <template #name><MemberName :id="drafter.id" show-kind class="grade-panel__drafter-name" /></template>
          </i18n-t>
        </p>
        <p class="grade-panel__alert-text">
          {{
            t(isGroup ? 'groupGrading.panel.draftExists' : 'submissions.grade.draftExists', {
              score: pointsText
                ? `${formatDecimal(liveDraft.group?.score ?? liveDraft.score, 4)} / ${pointsText}`
                : formatDecimal(liveDraft.group?.score ?? liveDraft.score, 4),
            })
          }}
        </p>
        <div class="grade-panel__links">
          <el-button link type="primary" @click="startFromDraft">{{ t('submissions.grade.startFromDraft') }}</el-button>
          <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: liveDraft.id } }">
            {{ t('submissions.grade.openDraft') }}
          </router-link>
        </div>
      </AppNote>

      <div class="grade-panel__grid">
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          class="grade-panel__form"
          @submit.prevent="submit"
        >
          <AppNote v-if="isGroup" plain class="grade-panel__group-intro">{{ t('groupGrading.panel.intro') }}</AppNote>
          <p v-if="anyUntouched && prefill" class="app-form-hint grade-panel__prefilled-note">
            {{ t('submissions.grade.prefilledBy', { name: prefill.name }) }}
          </p>
          <el-form-item
            :label="isGroup ? t('groupGrading.panel.score') : t('submissions.grade.score')"
            prop="score"
            :class="{ 'is-prefilled': untouched.score }"
          >
            <template #label
              >{{ isGroup ? t('groupGrading.panel.score') : t('submissions.grade.score')
              }}<span v-if="untouched.score" class="grade-panel__sr">{{
                t('submissions.grade.prefilledMark')
              }}</span></template
            >
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

          <el-form-item v-if="isGroup" :label="t('groupGrading.editor.title')">
            <div class="grade-panel__block">
              <div class="app-form-hint grade-panel__members-hint">{{ t('groupGrading.editor.hint') }}</div>
              <GroupAdjustments
                v-model="adjustRows"
                :members="submission.members ?? []"
                :group-score="form.score"
                :points-possible="points"
                :allow-extra="above && form.allowExtra"
                :strict="rowsChecked"
              />
            </div>
          </el-form-item>

          <el-form-item :label="t('submissions.grade.breakdown')" :class="{ 'is-prefilled': untouched.breakdown }">
            <template #label
              >{{ t('submissions.grade.breakdown')
              }}<span v-if="untouched.breakdown" class="grade-panel__sr">{{
                t('submissions.grade.prefilledMark')
              }}</span></template
            >
            <div class="grade-panel__block">
              <BreakdownEditor v-model="form.breakdown" :strict="breakdownChecked" @use-total="useTotal" />
              <div v-if="breakdownError" class="grade-panel__error" role="alert">
                {{ t('submissions.breakdown.invalid') }}
              </div>
              <div class="app-form-hint">{{ t('submissions.grade.breakdownHint') }}</div>
            </div>
          </el-form-item>

          <el-form-item :label="t('submissions.grade.feedback')" :class="{ 'is-prefilled': untouched.feedback }">
            <template #label
              >{{ t('submissions.grade.feedback')
              }}<span v-if="untouched.feedback" class="grade-panel__sr">{{
                t('submissions.grade.prefilledMark')
              }}</span></template
            >
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
                    <DocumentFiles :course-id="courseId" :document-id="f.document_id" :title="f.title" />
                  </li>
                </ul>
              </div>
              <div class="app-form-hint">
                {{ isGroup ? t('groupGrading.panel.filesHint') : t('submissions.grade.filesHint') }}
              </div>
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
  font-size: var(--app-text-xs);
}
.grade-panel__alert {
  margin-bottom: 12px;
}
.grade-panel__alert-text {
  margin: 0 0 4px;
  line-height: var(--app-lh-ui);
}
.grade-panel__links {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.grade-panel__note {
  margin: 0;
  font-size: var(--app-text-sm);
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
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
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
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-ui);
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
.grade-panel__drafter {
  display: flex;
  align-items: center;
  /* The light at the avatar's corner is ringed in the note's ground. */
  --agent-avatar-ring: var(--el-color-info-light-9);
}
.grade-panel__drafter-name {
  vertical-align: middle;
}
/* In Chinese the words around the drafter have no spaces of their own: it stands a little apart by itself. */
:lang(zh) .grade-panel__drafter-name {
  margin: 0 0.3em;
}
/*
 * What an agent drafted and the grader has not changed: a line at its left,
 * in the gutter, so that the field does not move when it goes.
 */
.grade-panel__form :deep(.el-form-item.is-prefilled > .el-form-item__content) {
  margin-left: -13px;
  padding-left: 10px;
  /* The indigo itself: the indigo line is too faint (under 3:1) for the one mark that says this. */
  border-left: 3px solid var(--app-indigo);
}
.grade-panel__prefilled-note {
  margin: 0 0 12px;
}
.grade-panel__group-intro {
  margin-bottom: var(--app-space-md);
}
.grade-panel__members-hint {
  margin: 0 0 var(--app-space-sm);
}
/* Said to a screen reader with the field's label: the line at its left is seen alone. */
.grade-panel__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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
