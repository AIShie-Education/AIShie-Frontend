<script setup lang="ts">
// One grade in full (grade.get): the score and what it is out of, where it
// came from — the submission, the rubric version the grader was shown, the
// action that made it (who proposed it, who approved it) — its feedback and
// breakdown, and what replaced it. A live posted grade can be regraded
// (grade.regrade), and a draft posted (grade.post).
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { read, type ToolOut, type WriteOutcome } from '@/api/http'
import type { Grade, GradeSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import AsyncState from '@/components/AsyncState.vue'
import DocumentFileLink from '@/components/DocumentFileLink.vue'
import IdText from '@/components/IdText.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import MemberName from '@/components/MemberName.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import BreakdownTable from './components/BreakdownTable.vue'
import PostGradesDialog from './components/PostGradesDialog.vue'
import ProposalNotice from './components/ProposalNotice.vue'
import RegradeDialog from './components/RegradeDialog.vue'
import ScoreText from './components/ScoreText.vue'
import WorkingTable from './components/WorkingTable.vue'
import {
  parseBreakdown,
  parseWorking,
  percentOf,
  useGradeLookups,
  type PostRow,
  type WorkingItem,
} from './components/grading'

const props = defineProps<{ courseId: string; gradeId: string }>()
const { t } = useI18n()
const router = useRouter()
const course = useCourseStore()
const lookups = useGradeLookups(() => props.courseId)

const state = useAsync(() => read('grade.get', { course_id: props.courseId, grade_id: props.gradeId }), {
  watch: [() => props.gradeId],
})
const g = computed<Grade | undefined>(() => state.data.value)

const mine = computed(() => course.role === 'student')
const seesDrafts = computed(() => !mine.value && (course.can('grade_submit') || course.can('grade_post')))
const isComputed = computed(() => g.value?.origin === 'computed')
const what = computed(() => (g.value ? lookups.what(g.value, t) : null))
const outOf = computed(() => (g.value ? lookups.outOf(g.value) : null))
const breakdown = computed(() => (g.value && !isComputed.value ? parseBreakdown(g.value.breakdown) : null))
const working = computed(() => (g.value && isComputed.value ? parseWorking(g.value.breakdown) : null))
const files = computed(() => g.value?.feedback_files ?? [])
const kindLabel = computed(() =>
  g.value?.assignment_id
    ? t('grades.detail.assignment')
    : isComputed.value
      ? t('grades.detail.rollup')
      : t('grades.detail.component'),
)

const assignment = computed(() => (g.value?.assignment_id ? course.assignments.get(g.value.assignment_id) : undefined))
/** The rubric the grade's rubric version belongs to: the assignment's rubric. */
const rubricDocumentId = computed(() => assignment.value?.rubric_document_id ?? null)

function workingName(item: WorkingItem): string | null {
  if (item.kind === 'assignment') return course.assignmentTitle(item.id)
  return lookups.componentName(item.id, t)
}

// ---------------------------------------------------------------------------
// What can be done with it
// ---------------------------------------------------------------------------

// Regrading takes grade_submit and grade_post, and runs at the lower of the two.
const canRegrade = computed(
  () =>
    !!g.value &&
    !mine.value &&
    g.value.state === 'posted' &&
    g.value.origin === 'entered' &&
    course.canAll(['grade_submit', 'grade_post']),
)
const regradeNeedsApproval = computed(() => course.needsApprovalAll(['grade_submit', 'grade_post']))
const canPostThis = computed(
  () =>
    !!g.value && !mine.value && g.value.state === 'draft' && g.value.origin === 'entered' && course.can('grade_post'),
)

const regradeVisible = ref(false)
const postVisible = ref(false)
const proposal = ref<{ title: string; body: string } | null>(null)
// The route keeps this view when another grade is opened: a notice is about the grade it was given on.
watch(
  () => props.gradeId,
  () => {
    proposal.value = null
  },
)

const postRows = computed<PostRow[]>(() =>
  g.value
    ? [
        {
          id: g.value.id,
          studentMemberId: g.value.student_member_id,
          label: what.value ?? '',
          score: g.value.score,
          outOf: outOf.value,
        },
      ]
    : [],
)

async function onRegraded(out: WriteOutcome<ToolOut<'grade.regrade'>>) {
  if (out.status === 'proposed') {
    proposal.value = { title: t('grades.regrade.proposedTitle'), body: t('grades.regrade.proposedBody') }
    return
  }
  ElMessage({
    type: 'success',
    message:
      t('grades.regrade.done', { n: out.result.snapshots }) +
      (out.reviewState === 'pending' ? ` ${t('common.outcome.pendingReview')}` : ''),
  })
  await router.push({ name: 'course-grade', params: { courseId: props.courseId, gradeId: out.result.grade_id } })
}

async function onPosted(out: WriteOutcome<ToolOut<'grade.post'>>) {
  if (out.status === 'proposed') {
    proposal.value = { title: t('grades.post.proposedTitle'), body: t('grades.post.proposedBody') }
    return
  }
  ElMessage({
    type: 'success',
    message:
      t('grades.post.done', { n: (out.result.posted ?? []).length, s: out.result.snapshots }) +
      (out.reviewState === 'pending' ? ` ${t('common.outcome.pendingReview')}` : ''),
  })
  await Promise.all([state.reload(), history.reload()])
}

// ---------------------------------------------------------------------------
// The other grades for the same work: what this replaced, and what replaced it
// ---------------------------------------------------------------------------

const history = useAsync<GradeSummary[]>(
  async () => {
    const cur = g.value
    if (!cur || !seesDrafts.value) return []
    const found: GradeSummary[] = []
    let after: string | undefined
    for (let page = 0; page < 10; page++) {
      const out = await read('grade.list', {
        course_id: props.courseId,
        student_member_id: cur.student_member_id,
        assignment_id: cur.assignment_id ?? undefined,
        limit: 200,
        after,
      })
      for (const x of out.grades ?? []) {
        const same = cur.submission_id
          ? x.submission_id === cur.submission_id
          : !x.submission_id && x.component_id === cur.component_id && x.origin === cur.origin
        if (same) found.push(x)
      }
      if (!out.next) break
      after = out.next
    }
    return found.sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  { immediate: false },
)
watch(
  () => g.value?.id,
  (id) => {
    if (id) void history.reload()
  },
)
const replaced = computed(() => (history.data.value ?? []).filter((x) => x.superseded_by === props.gradeId))
const historyRows = computed(() => history.data.value ?? [])

const backLink = computed(() => ({
  name: 'course-grades',
  params: { courseId: props.courseId },
  query: mine.value
    ? {}
    : { assignment: g.value?.assignment_id ?? undefined, student: g.value?.student_member_id ?? undefined },
}))
</script>

<template>
  <div class="grade-view">
    <AsyncState :loading="state.loading.value && !g" :error="state.error.value" @retry="state.reload">
      <template v-if="g">
        <PageHeader :title="what ?? t('grades.detail.title')" :back="backLink">
          <template #tags>
            <StatusTag vocab="gradeState" :value="g.state" size="default" />
            <StatusTag v-if="isComputed" vocab="gradeOrigin" :value="g.origin" size="default" />
          </template>
          <template #subtitle>
            <span class="grade-view__subtitle">
              <MemberName :id="g.student_member_id" />
              <span>·</span>
              <span>{{ kindLabel }}</span>
            </span>
          </template>
          <el-button v-if="canPostThis" type="success" :disabled="!course.writable" @click="postVisible = true">
            <el-icon><Promotion /></el-icon>
            <span>{{ t('grades.detail.post') }}</span>
            <el-tag
              v-if="course.needsApproval('grade_post')"
              size="small"
              type="warning"
              effect="plain"
              class="grade-view__approval"
            >
              {{ t('enums.level.confirm_required') }}
            </el-tag>
          </el-button>
          <el-button v-if="canRegrade" type="primary" :disabled="!course.writable" @click="regradeVisible = true">
            <el-icon><EditPen /></el-icon>
            <span>{{ t('grades.regrade.button') }}</span>
            <el-tag v-if="regradeNeedsApproval" size="small" type="warning" effect="plain" class="grade-view__approval">
              {{ t('enums.level.confirm_required') }}
            </el-tag>
          </el-button>
        </PageHeader>

        <ProposalNotice
          v-if="proposal"
          :course-id="courseId"
          :title="proposal.title"
          :body="proposal.body"
          @close="proposal = null"
        />

        <el-alert v-if="g.state === 'superseded'" type="info" :closable="false" show-icon class="grade-view__banner">
          <template #title>
            {{ t('grades.detail.supersededBanner') }}
            <router-link
              v-if="g.superseded_by"
              :to="{ name: 'course-grade', params: { courseId, gradeId: g.superseded_by } }"
              class="grade-view__banner-link"
            >
              {{ t('grades.detail.openNewer') }}
            </router-link>
          </template>
        </el-alert>
        <el-alert
          v-else-if="g.state === 'draft'"
          type="warning"
          :closable="false"
          show-icon
          :title="t('grades.detail.draftBanner')"
          class="grade-view__banner"
        />

        <section class="app-card grade-view__score-card">
          <div class="grade-view__score">
            <ScoreText :score="g.score" :out-of="outOf" :as-percent="isComputed" size="large" hide-percent />
            <div v-if="!isComputed && outOf !== null" class="grade-view__pct">{{ percentOf(g.score, outOf) }}</div>
          </div>
          <p v-if="isComputed" class="app-muted grade-view__score-note">
            {{ t('grades.detail.computedNote') }}
            <template v-if="working">
              <el-tag v-if="!working.complete" size="small" type="warning">{{
                t('grades.gradebook.incomplete')
              }}</el-tag>
              <el-tag v-if="working.ungradedAsZero" size="small" type="danger" effect="plain">{{
                t('grades.detail.final')
              }}</el-tag>
            </template>
          </p>
        </section>

        <section class="app-card">
          <h2 class="app-card__title">{{ t('grades.detail.facts') }}</h2>
          <dl class="grade-view__facts">
            <div>
              <dt>{{ t('grades.columns.student') }}</dt>
              <dd>
                <MemberName :id="g.student_member_id" />
                <router-link
                  :to="{ name: 'course-gradebook', params: { courseId, studentMemberId: g.student_member_id } }"
                  class="grade-view__small-link"
                >
                  {{ t('grades.detail.toGradebook') }}
                </router-link>
              </dd>
            </div>
            <div>
              <dt>{{ t('grades.columns.what') }}</dt>
              <dd>
                <router-link
                  v-if="g.assignment_id"
                  :to="{ name: 'course-assignment', params: { courseId, assignmentId: g.assignment_id } }"
                >
                  {{ what ?? t('grades.detail.assignment') }}
                </router-link>
                <router-link v-else-if="g.component_id" :to="{ name: 'course-scheme', params: { courseId } }">
                  {{ what ?? t('grades.detail.component') }}
                </router-link>
                <span class="app-muted grade-view__kind">{{ kindLabel }}</span>
              </dd>
            </div>
            <div v-if="g.submission_id">
              <dt>{{ t('grades.detail.submission') }}</dt>
              <dd>
                <router-link :to="{ name: 'course-submission', params: { courseId, submissionId: g.submission_id } }">
                  {{ t('grades.detail.openSubmission') }}
                </router-link>
              </dd>
            </div>
            <div>
              <dt>{{ isComputed ? t('grades.detail.writtenBy') : t('grades.columns.grader') }}</dt>
              <dd><MemberName :id="g.grader_member_id" show-kind /></dd>
            </div>
            <div>
              <dt>{{ t('grades.columns.created') }}</dt>
              <dd><TimeText :value="g.created_at" /></dd>
            </div>
            <div>
              <dt>{{ t('grades.columns.posted') }}</dt>
              <dd>
                <TimeText v-if="g.posted_at" :value="g.posted_at" />
                <span v-else class="app-muted">{{ t('grades.detail.notPosted') }}</span>
              </dd>
            </div>
            <div v-if="g.superseded_by">
              <dt>{{ t('grades.detail.supersededBy') }}</dt>
              <dd>
                <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: g.superseded_by } }">
                  {{ t('grades.detail.newerGrade') }}
                </router-link>
                <IdText :id="g.superseded_by" />
              </dd>
            </div>
            <div v-if="replaced.length">
              <dt>{{ t('grades.detail.replaces') }}</dt>
              <dd>
                <span v-for="r in replaced" :key="r.id" class="grade-view__replaced">
                  <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: r.id } }">
                    <ScoreText :score="r.score" :out-of="outOf" :as-percent="isComputed" hide-percent />
                  </router-link>
                </span>
              </dd>
            </div>
            <div v-if="!isComputed && g.assignment_id">
              <dt>{{ t('grades.detail.rubric') }}</dt>
              <dd>
                <template v-if="g.rubric_version_id">
                  <router-link
                    v-if="rubricDocumentId && course.can('rubric_read')"
                    :to="{
                      name: 'course-document',
                      params: { courseId, documentId: rubricDocumentId },
                      query: { version: g.rubric_version_id },
                    }"
                  >
                    {{ t('grades.detail.rubricVersion') }}
                  </router-link>
                  <span v-else>{{ t('grades.detail.rubricRecorded') }}</span>
                  <IdText :id="g.rubric_version_id" />
                </template>
                <span v-else class="app-muted">{{ t('grades.detail.noRubric') }}</span>
              </dd>
            </div>
            <div class="grade-view__wide">
              <dt>{{ t('grades.detail.action') }}</dt>
              <dd>
                <router-link
                  v-if="course.can('action_decide')"
                  :to="{ name: 'course-action', params: { courseId, actionId: g.created_by_action_id } }"
                >
                  {{ t('grades.detail.openAction') }}
                </router-link>
                <IdText :id="g.created_by_action_id" />
                <p class="app-form-hint">
                  {{ course.can('action_decide') ? t('grades.detail.actionHint') : t('grades.detail.actionHintQuote') }}
                </p>
              </dd>
            </div>
          </dl>
        </section>

        <section v-if="!isComputed" class="app-card">
          <h2 class="app-card__title">{{ t('grades.detail.feedback') }}</h2>
          <MarkdownView :source="g.feedback" :empty="t('grades.detail.noFeedback')" />
          <div v-if="files.length" class="grade-view__files">
            <h3 class="grade-view__files-title">{{ t('grades.form.feedbackFiles') }}</h3>
            <ul>
              <li v-for="f in files" :key="f.document_id">
                <DocumentFileLink :course-id="courseId" :document-id="f.document_id" :title="f.title" />
              </li>
            </ul>
          </div>
        </section>

        <section v-if="breakdown" class="app-card">
          <h2 class="app-card__title">{{ t('grades.breakdown.title') }}</h2>
          <BreakdownTable :items="breakdown" :score="g.score" />
        </section>

        <section v-if="working" class="app-card">
          <h2 class="app-card__title">{{ t('grades.working.title') }}</h2>
          <p class="app-form-hint grade-view__working-hint">
            {{ working.ungradedAsZero ? t('grades.working.hintFinal') : t('grades.working.hintSoFar') }}
          </p>
          <WorkingTable v-if="working.items.length" :items="working.items" :name="workingName" />
        </section>

        <section v-if="seesDrafts && historyRows.length > 1" class="app-card">
          <h2 class="app-card__title">{{ t('grades.detail.history') }}</h2>
          <el-table
            :data="historyRows"
            row-key="id"
            size="small"
            class="grade-view__history"
            :row-class-name="({ row }: { row: GradeSummary }) => (row.id === gradeId ? 'is-current' : '')"
            @row-click="
              (row: GradeSummary) => router.push({ name: 'course-grade', params: { courseId, gradeId: row.id } })
            "
          >
            <el-table-column :label="t('grades.columns.score')" min-width="130">
              <template #default="{ row }">
                <ScoreText :score="row.score" :out-of="outOf" :as-percent="isComputed" hide-percent />
              </template>
            </el-table-column>
            <el-table-column :label="t('grades.columns.state')" min-width="100">
              <template #default="{ row }"><StatusTag vocab="gradeState" :value="row.state" /></template>
            </el-table-column>
            <el-table-column
              :label="isComputed ? t('grades.detail.writtenBy') : t('grades.columns.grader')"
              min-width="140"
            >
              <template #default="{ row }"><MemberName :id="row.grader_member_id" show-kind /></template>
            </el-table-column>
            <el-table-column :label="t('grades.columns.created')" min-width="150">
              <template #default="{ row }"><TimeText :value="row.created_at" /></template>
            </el-table-column>
            <el-table-column min-width="80">
              <template #default="{ row }">
                <el-tag v-if="row.id === gradeId" size="small" effect="plain">{{ t('grades.detail.thisOne') }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <RegradeDialog
          v-if="canRegrade"
          v-model="regradeVisible"
          :course-id="courseId"
          :grade="g"
          :out-of="outOf"
          :what="what ?? ''"
          @done="onRegraded"
        />
        <PostGradesDialog
          v-if="canPostThis"
          v-model="postVisible"
          :course-id="courseId"
          mode="ids"
          :rows="postRows"
          @done="onPosted"
        />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.grade-view__subtitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.grade-view__approval {
  margin-left: 6px;
}
.grade-view__banner {
  margin-bottom: 16px;
}
.grade-view__banner-link {
  margin-left: 8px;
  font-weight: 500;
}
.grade-view__score {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
}
.grade-view__pct {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}
.grade-view__score-note {
  margin: 8px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.grade-view__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px 24px;
  margin: 0;
}
.grade-view__facts dt {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.grade-view__facts dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  word-break: break-word;
}
.grade-view__facts dd .app-form-hint {
  flex-basis: 100%;
  margin: 0;
}
.grade-view__wide {
  grid-column: 1 / -1;
}
.grade-view__small-link {
  font-size: 12px;
}
.grade-view__kind {
  font-size: 12px;
}
.grade-view__replaced + .grade-view__replaced::before {
  content: '·';
  margin-right: 8px;
  color: var(--el-text-color-secondary);
}
.grade-view__files {
  margin-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
.grade-view__files-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.grade-view__files ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.grade-view__working-hint {
  margin: 0 0 12px;
}
.grade-view__history :deep(.el-table__row) {
  cursor: pointer;
}
.grade-view__history :deep(.is-current) {
  font-weight: 600;
}
</style>
