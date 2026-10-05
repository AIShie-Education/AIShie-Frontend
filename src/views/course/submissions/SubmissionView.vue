<script setup lang="ts">
// One submission: the work as handed in (or as drafted so far), what it was
// handed in under, the grades given for it (and those proposed for it that
// wait for approval), and — for those who grade — a form to grade it and a
// way to correct its lateness. A group's work says whose work it is (its
// members, marked against the group now for those who grade, who correct
// them), is graded once for every member, and lists each member's grade.
// Core shows a group's work to a seat that reaches any of its members, but
// grades it, and corrects its members and lateness, only for one that
// reaches every one: a seat that does not is told so, and offered none of
// those.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { workOf, type ActionSummary, type GradeSummary, type SubmissionSummary } from '@/api/types'
import AppNote from '@/components/AppNote.vue'
import AsyncState from '@/components/AsyncState.vue'
import DocumentFiles from '@/components/DocumentFiles.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import MemberName from '@/components/MemberName.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { formatDecimal } from '@/utils/format'
import GradePanel from './components/GradePanel.vue'
import GroupGrades from './components/GroupGrades.vue'
import GroupWorkMembers from './components/GroupWorkMembers.vue'
import LatenessControl from './components/LatenessControl.vue'
import SubmissionGrades from './components/SubmissionGrades.vue'
import { loadPendingGradeProposals } from './components/proposals'
import { workMemberIds, workReach, type WorkReach } from './components/groupGrading'

const props = defineProps<{ courseId: string; submissionId: string }>()
const { t } = useI18n()
const course = useCourseStore()
onMounted(() => void course.ensureAssignments())

const PAGE = 200

const sub = useAsync(() => read('submission.get', { course_id: props.courseId, submission_id: props.submissionId }), {
  watch: [() => props.submissionId],
  keepData: true,
})
const s = computed(() => (sub.data.value?.id === props.submissionId ? sub.data.value : undefined))
const assignmentId = computed(() => s.value?.assignment_id)
/** A group's work, graded once for every member of it. */
const isGroup = computed(() => !!s.value?.group_id)
/** What staff are told of a draft or of missing work: the student's, or the group's. */
const notices = computed(() => (isGroup.value ? 'groupGrading.notice' : 'submissions.detail.notice'))
/** The caller's own work: their own, or their group's that they are part of. */
const own = computed(() => !!s.value && !!course.myMemberId && workOf(s.value).includes(course.myMemberId))
const mayReadGrades = computed(() => own.value || course.can('grade_read'))
/** Whether the caller's seat reaches every member of a group's work: one of its own is theirs. */
const reach = computed<WorkReach>(() =>
  !s.value?.group_id || own.value ? 'all' : workReach(workMemberIds(s.value), course.reachesStudent),
)

const assignment = useAsync(
  async () =>
    assignmentId.value
      ? read('assignment.get', { course_id: props.courseId, assignment_id: assignmentId.value })
      : undefined,
  { watch: [assignmentId], immediate: false, keepData: true },
)
const a = computed(() => (assignment.data.value?.id === assignmentId.value ? assignment.data.value : undefined))
const assignmentSettled = computed(() => !!a.value || !!assignment.error.value)

// Every grade for this student on this assignment, kept to this attempt's.
// A draft has none: it cannot be graded until it is handed in.
const grades = useAsync(
  async (): Promise<GradeSummary[]> => {
    const cur = s.value
    if (!cur || cur.state === 'draft' || !mayReadGrades.value) return []
    const out: GradeSummary[] = []
    let after: string | undefined
    for (;;) {
      const page = await read('grade.list', {
        course_id: props.courseId,
        assignment_id: cur.assignment_id,
        student_member_id: cur.student_member_id,
        limit: PAGE,
        after,
      })
      out.push(...(page.grades ?? []).filter((g) => g.submission_id === cur.id))
      if (!page.next) break
      after = page.next
    }
    return out
  },
  { watch: [() => s.value?.id], immediate: false, keepData: true },
)
const gradeList = computed(() => grades.data.value ?? [])
const gradesSettled = computed(() => grades.data.value !== undefined || !!grades.error.value)
const liveDraft = computed(() => gradeList.value.find((g) => g.state === 'draft'))
const livePosted = computed(() => gradeList.value.find((g) => g.state === 'posted'))
/** Whether the grades already given for this work are not known to the caller: refused, or not read. */
const gradesHidden = computed(() => !mayReadGrades.value || !!grades.error.value)

// Grades proposed for this work and waiting for approval. Approving one over
// a draft entered after it is refused, so whoever grades is told of them.
// Deciders read the approval queue; a seat whose grading waits for approval
// reads its own actions. Not knowing of them only loses the warning, so a
// failure to read them is not shown.
const decides = computed(() => course.can('action_decide'))
const mightPropose = computed(() => {
  const l = course.level('grade_submit')
  return l === null || l === 'confirm_required'
})
const proposals = useAsync(
  async (): Promise<{ submissionId: string; items: ActionSummary[] }> => {
    const cur = s.value
    if (!cur) return { submissionId: '', items: [] }
    if (own.value || cur.state === 'draft' || !(decides.value || mightPropose.value)) {
      return { submissionId: cur.id, items: [] }
    }
    const items = await loadPendingGradeProposals(props.courseId, cur.id, {
      decides: decides.value,
      mightPropose: mightPropose.value,
    })
    return { submissionId: cur.id, items }
  },
  { watch: [() => s.value?.id], immediate: false, keepData: true },
)
const proposalList = computed(() =>
  proposals.data.value?.submissionId === s.value?.id ? (proposals.data.value?.items ?? []) : [],
)

// The student's other attempts at the same assignment.
const attempts = useAsync(
  async (): Promise<SubmissionSummary[]> => {
    const cur = s.value
    if (!cur) return []
    const out: SubmissionSummary[] = []
    let after: string | undefined
    for (;;) {
      // A group's attempts are the group's: never every group's of the assignment.
      const page = await read('submission.list', {
        course_id: props.courseId,
        assignment_id: cur.assignment_id,
        ...(cur.group_id ? { group_id: cur.group_id } : { student_member_id: cur.student_member_id }),
        limit: PAGE,
        after,
      })
      out.push(...(page.submissions ?? []))
      if (!page.next) break
      after = page.next
    }
    return out.sort((x, y) => x.attempt - y.attempt)
  },
  { watch: [() => s.value?.id], immediate: false, keepData: true },
)
const attemptList = computed(() => attempts.data.value ?? [])

const title = computed(
  () => a.value?.title ?? course.assignmentTitle(assignmentId.value) ?? t('submissions.detail.title'),
)
const handedIn = computed(() => s.value?.state === 'submitted' || s.value?.state === 'late')
const mayGrade = computed(() => !own.value && course.can('grade_submit'))
/** Correcting lateness: a group's for every member of it, so only within reach of them all. */
const mayCorrectLateness = computed(() => mayGrade.value && handedIn.value && reach.value !== 'some')
const files = computed(() => s.value?.files ?? [])

function reloadAll() {
  void sub.reload()
}

/** After grading, the grades again — unless they were refused: they still are. */
function onGraded() {
  if (!grades.error.value?.isForbidden) void grades.reload()
  void proposals.reload()
}
</script>

<template>
  <div class="submission-view">
    <AsyncState :loading="sub.loading.value && !s" :error="s ? null : sub.error.value" @retry="reloadAll">
      <template v-if="s">
        <PageHeader
          :title="title"
          :back="{
            name: 'course-submissions',
            params: { courseId },
            query: own ? {} : { assignment: s.assignment_id },
          }"
        >
          <template #tags>
            <StatusTag vocab="submissionState" :value="s.state" size="default" />
          </template>
          <template #subtitle>
            <span class="submission-view__subtitle">
              <span v-if="isGroup">{{ s.group_name ?? t('groupGrading.members.groupWork') }}</span>
              <MemberName v-else :id="s.student_member_id" />
              <span>·</span>
              <span>{{ t('submissions.detail.attempt', { n: s.attempt }) }}</span>
            </span>
          </template>
          <LatenessControl v-if="mayCorrectLateness" :course-id="courseId" :submission="s" @changed="reloadAll" />
          <router-link
            v-if="own && (s.state === 'draft' || s.state === 'missing')"
            :to="{ name: 'course-assignment', params: { courseId, assignmentId: s.assignment_id } }"
          >
            <el-button type="primary">
              <el-icon><EditPen /></el-icon>
              <span>{{
                s.state === 'draft' ? t('submissions.detail.continueEditing') : t('submissions.detail.handInLate')
              }}</span>
            </el-button>
          </router-link>
        </PageHeader>

        <AppNote v-if="s.state === 'draft'" class="submission-view__notice">
          {{ own ? t('submissions.detail.notice.draftOwn') : t(`${notices}.draftStaff`) }}
        </AppNote>
        <el-alert
          v-else-if="s.state === 'missing'"
          type="warning"
          :closable="false"
          show-icon
          class="submission-view__notice"
          :title="
            own
              ? t('submissions.detail.notice.missingOwn')
              : gradeList.length
                ? t(`${notices}.missingGraded`)
                : t(`${notices}.missingStaff`)
          "
        />

        <section class="app-card">
          <dl class="facts">
            <div class="facts__item">
              <dt>{{ t('submissions.detail.facts.assignment') }}</dt>
              <dd>
                <router-link :to="{ name: 'course-assignment', params: { courseId, assignmentId: s.assignment_id } }">
                  {{ title }}
                </router-link>
                <router-link
                  v-if="!own"
                  class="facts__aside"
                  :to="{ name: 'course-submissions', params: { courseId }, query: { assignment: s.assignment_id } }"
                >
                  {{ t('submissions.detail.allForAssignment') }}
                </router-link>
              </dd>
            </div>
            <div v-if="isGroup" class="facts__item">
              <dt>{{ t('groupGrading.members.group') }}</dt>
              <dd>{{ s.group_name ?? t('groupGrading.members.groupWork') }}</dd>
            </div>
            <div v-else class="facts__item">
              <dt>{{ t('submissions.detail.facts.student') }}</dt>
              <dd>
                <MemberName :id="s.student_member_id" />
                <router-link
                  v-if="!own"
                  class="facts__aside"
                  :to="{ name: 'course-submissions', params: { courseId }, query: { student: s.student_member_id } }"
                >
                  {{ t('submissions.detail.allByStudent') }}
                </router-link>
              </dd>
            </div>
            <div class="facts__item">
              <dt>{{ t('submissions.detail.facts.state') }}</dt>
              <dd><StatusTag vocab="submissionState" :value="s.state" /></dd>
            </div>
            <div class="facts__item">
              <dt>{{ t('submissions.detail.facts.submittedAt') }}</dt>
              <dd>
                <TimeText v-if="s.submitted_at" :value="s.submitted_at" />
                <span v-else class="app-muted">{{ t('submissions.notHandedIn') }}</span>
              </dd>
            </div>
            <div class="facts__item">
              <dt>{{ t('submissions.detail.facts.dueAt') }}</dt>
              <dd>
                <TimeText v-if="a?.due_at" :value="a.due_at" cutoff />
                <span v-else class="app-muted">{{ a ? t('submissions.detail.noDue') : '—' }}</span>
              </dd>
            </div>
            <div class="facts__item">
              <dt>{{ t('submissions.detail.facts.points') }}</dt>
              <dd>{{ a ? t('submissions.detail.pointsValue', { n: formatDecimal(a.points_possible, 4) }) : '—' }}</dd>
            </div>
            <div v-if="s.state !== 'missing'" class="facts__item">
              <dt>{{ t('submissions.detail.facts.createdAt') }}</dt>
              <dd><TimeText :value="s.created_at" /></dd>
            </div>
            <div v-if="s.state !== 'draft' && s.state !== 'missing'" class="facts__item">
              <dt>{{ t('submissions.detail.facts.instructions') }}</dt>
              <dd>
                <router-link
                  v-if="s.instructions_version_id && a?.instructions_document_id"
                  :to="{
                    name: 'course-document',
                    params: { courseId, documentId: a.instructions_document_id },
                    query: { version: s.instructions_version_id },
                  }"
                >
                  {{ t('submissions.detail.instructionsLink') }}
                </router-link>
                <span v-else class="app-muted">{{ t('submissions.detail.noInstructionsVersion') }}</span>
              </dd>
            </div>
          </dl>
        </section>

        <GroupWorkMembers
          v-if="isGroup"
          :course-id="courseId"
          :submission="s"
          :assignment="a"
          :grades="gradeList"
          :own="own"
          :reach="reach"
          @changed="reloadAll"
        />

        <section class="app-card">
          <h2 class="app-card__title">{{ t('submissions.detail.work') }}</h2>
          <div class="submission-view__body">
            <MarkdownView
              :source="s.body"
              :empty="s.state === 'draft' ? t('submissions.detail.draftBody') : t('submissions.detail.noBody')"
            />
          </div>
          <template v-if="s.state !== 'missing' || files.length">
            <h3 class="submission-view__subhead">{{ t('submissions.detail.files') }}</h3>
            <ul v-if="files.length" class="submission-view__files">
              <li v-for="f in files" :key="f.document_id">
                <DocumentFiles :course-id="courseId" :document-id="f.document_id" :title="f.title" />
              </li>
            </ul>
            <p v-else class="app-muted submission-view__none">{{ t('submissions.detail.noFiles') }}</p>
          </template>
        </section>

        <section v-if="attemptList.length > 1" class="app-card">
          <h2 class="app-card__title">{{ t('submissions.detail.attempts') }}</h2>
          <ul class="attempts">
            <li v-for="x in attemptList" :key="x.id">
              <router-link
                :to="{ name: 'course-submission', params: { courseId, submissionId: x.id } }"
                class="attempts__row"
                :class="{ 'is-current': x.id === s.id }"
              >
                <span class="attempts__n">{{ t('submissions.detail.attempt', { n: x.attempt }) }}</span>
                <StatusTag vocab="submissionState" :value="x.state" />
                <span v-if="x.submitted_at" class="app-muted"><TimeText :value="x.submitted_at" /></span>
                <span v-if="x.id === s.id" class="attempts__current">{{ t('submissions.detail.current') }}</span>
              </router-link>
            </li>
          </ul>
        </section>

        <GroupGrades
          v-if="s.state !== 'draft' && isGroup"
          :course-id="courseId"
          :submission="s"
          :grades="gradeList"
          :points-possible="a?.points_possible"
          :loading="grades.loading.value"
          :error="grades.error.value"
          :own="own"
          :forbidden="!mayReadGrades"
          :proposals="proposalList"
          :live-draft="liveDraft"
          :live-posted="livePosted"
          :reach="reach"
          @retry="grades.reload"
          @changed="onGraded"
        />
        <SubmissionGrades
          v-else-if="s.state !== 'draft'"
          :course-id="courseId"
          :assignment-id="s.assignment_id"
          :student-id="s.student_member_id"
          :grades="gradeList"
          :points-possible="a?.points_possible"
          :loading="grades.loading.value"
          :error="grades.error.value"
          :own="own"
          :forbidden="!mayReadGrades"
          :proposals="proposalList"
          :live-draft="liveDraft"
          :live-posted="livePosted"
          @retry="grades.reload"
        />

        <GradePanel
          v-if="mayGrade && assignmentSettled && gradesSettled"
          :key="s.id"
          :course-id="courseId"
          :submission="s"
          :assignment="a"
          :live-draft="liveDraft"
          :live-posted="livePosted"
          :grades-hidden="gradesHidden"
          :proposals="proposalList"
          :work-grades="gradeList"
          :reach="reach"
          @graded="onGraded"
        />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.submission-view__subtitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.submission-view__notice {
  margin-bottom: 16px;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px 24px;
  margin: 0;
}
.facts__item {
  min-width: 0;
}
@media (max-width: 640px) {
  .facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
  }
}
.facts__item dt {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
/* In the interface's size, as every other page's facts are (an assignment's, a document's, a seat's): with none of
   its own it was the browser's 16 px. */
.facts__item dd {
  margin: 0;
  font-size: var(--app-text-md);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  overflow-wrap: anywhere;
}
.facts__aside {
  font-size: var(--app-text-xs);
}
.facts a {
  text-decoration: none;
}
.facts a:hover {
  text-decoration: underline;
}
.submission-view__body {
  overflow-wrap: anywhere;
}
.submission-view__subhead {
  margin: 20px 0 8px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.submission-view__files {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.submission-view__none {
  margin: 0;
  font-size: var(--app-text-sm);
}
.attempts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.attempts__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-radius: var(--app-radius-item);
  border: 1px solid var(--el-border-color-lighter);
  color: inherit;
  text-decoration: none;
}
.attempts__row:hover {
  background: var(--el-fill-color-light);
}
.attempts__row.is-current {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.attempts__n {
  font-weight: 500;
}
.attempts__current {
  margin-left: auto;
  font-size: var(--app-text-xs);
  color: var(--el-color-primary);
}
</style>
