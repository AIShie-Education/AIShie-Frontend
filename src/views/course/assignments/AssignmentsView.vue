<script setup lang="ts">
// The course's assignments (assignment.list): what is set, when it is due,
// what it is worth and where it counts. Students also see where their own
// work stands on each; those who write assignments see which are not
// published yet, and create new ones here.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { read } from '@/api/http'
import type { AssignmentSummary, SubmissionSummary } from '@/api/types'
import { useAsync, usePaged } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { formatDecimal } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import AssignmentFormDialog from './components/AssignmentFormDialog.vue'
import { allSubmissions, latestByAssignment, useNarrow, useScheme } from './components/useAssignmentData'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const router = useRouter()

const writer = computed(() => course.can('assignment_write'))
const isStudent = computed(() => course.role === 'student' && !!course.myMemberId)

const list = usePaged<AssignmentSummary>((after) =>
  read('assignment.list', { course_id: props.courseId, limit: 50, after }).then((o) => ({
    items: o.assignments,
    next: o.next,
  })),
)
const scheme = useScheme(() => props.courseId)
/** On a phone the table keeps two columns; the rest goes under the title. */
const narrow = useNarrow()

// A student's own work, newest attempt per assignment. Not being able to read
// it only means the column says less.
const mine = useAsync<Map<string, SubmissionSummary>>(async () => {
  if (!isStudent.value || !course.myMemberId) return new Map()
  try {
    return latestByAssignment(await allSubmissions(props.courseId, { student_member_id: course.myMemberId }))
  } catch {
    return new Map()
  }
})

// --- Filtering ------------------------------------------------------------------
const query = ref('')
const show = ref<'all' | 'published' | 'unpublished'>('all')
const hasUnpublished = computed(() => list.items.value.some((a) => !a.published_at))
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return list.items.value.filter(
    (a) =>
      (!q || a.title.toLowerCase().includes(q)) &&
      (show.value === 'all' || (show.value === 'published') === !!a.published_at),
  )
})

// --- Due dates -----------------------------------------------------------------
const now = ref(Date.now())
const isPast = (due: string | null | undefined) => !!due && dayjs(due).valueOf() < now.value
function handedIn(a: AssignmentSummary): boolean {
  const s = mine.data.value?.get(a.id)
  return !!s && (s.state === 'submitted' || s.state === 'late')
}
/** Past due and, for a student, nothing handed in: overdue. */
function overdue(a: AssignmentSummary): boolean {
  return isStudent.value && isPast(a.due_at) && !handedIn(a)
}
function byDue(a: AssignmentSummary, b: AssignmentSummary): number {
  const x = a.due_at ? dayjs(a.due_at).valueOf() : Number.POSITIVE_INFINITY
  const y = b.due_at ? dayjs(b.due_at).valueOf() : Number.POSITIVE_INFINITY
  return x === y ? 0 : x < y ? -1 : 1
}
function byPoints(a: AssignmentSummary, b: AssignmentSummary): number {
  return Number(a.points_possible) - Number(b.points_possible)
}

function componentLabel(a: AssignmentSummary): string {
  if (!a.component_id) return t('assignments.state.practice')
  return scheme.componentName(a.component_id) ?? t('assignments.state.counts')
}

function open(a: AssignmentSummary) {
  void router.push({ name: 'course-assignment', params: { courseId: props.courseId, assignmentId: a.id } })
}

// --- Creating ------------------------------------------------------------------
const formOpen = ref(false)
const proposed = ref(false)
function onSaved(r: { status: 'executed' | 'proposed'; id?: string }) {
  if (r.status === 'executed' && r.id) {
    void router.push({ name: 'course-assignment', params: { courseId: props.courseId, assignmentId: r.id } })
    return
  }
  proposed.value = true
  void list.reload()
}

function refresh() {
  now.value = Date.now()
  void list.reload()
  void mine.reload()
  void scheme.reload()
}
</script>

<template>
  <div class="assignments-view">
    <PageHeader :title="t('assignments.title')" :subtitle="t('assignments.subtitle')">
      <el-button :aria-label="t('common.actions.refresh')" @click="refresh">
        <el-icon><Refresh /></el-icon>
      </el-button>
      <template v-if="writer">
        <el-button type="primary" :disabled="!course.writable" @click="formOpen = true">
          <el-icon><Plus /></el-icon>
          <span>{{ t('assignments.list.new') }}</span>
        </el-button>
      </template>
    </PageHeader>

    <el-alert v-if="proposed" type="info" show-icon class="assignments-view__alert" @close="proposed = false">
      <template #title>
        {{ t('assignments.list.proposed') }}
        <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{ t('assignments.list.viewMyActions') }}</router-link>
      </template>
    </el-alert>
    <div v-if="writer && course.needsApproval('assignment_write')" class="app-form-hint assignments-view__approval">
      <el-tag type="warning" size="small" disable-transitions>{{ t('enums.level.confirm_required') }}</el-tag>
      {{ t('assignments.list.approvalHint') }}
    </div>

    <section class="app-card">
      <div class="app-toolbar">
        <el-input
          v-model="query"
          :placeholder="t('assignments.list.filter')"
          clearable
          class="assignments-view__search"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-radio-group v-if="writer && hasUnpublished" v-model="show" size="small">
          <el-radio-button value="all">{{ t('assignments.list.show.all') }}</el-radio-button>
          <el-radio-button value="published">{{ t('assignments.list.show.published') }}</el-radio-button>
          <el-radio-button value="unpublished">{{ t('assignments.list.show.unpublished') }}</el-radio-button>
        </el-radio-group>
      </div>

      <AsyncState
        :loading="list.loading.value && !list.items.value.length"
        :error="list.error.value"
        :empty="!list.items.value.length"
        :empty-text="writer ? t('assignments.list.empty') : t('assignments.list.emptyStudent')"
        @retry="list.reload"
      >
        <template #empty>
          <el-button v-if="writer" type="primary" :disabled="!course.writable" @click="formOpen = true">
            {{ t('assignments.list.new') }}
          </el-button>
        </template>
        <el-table
          :data="rows"
          row-key="id"
          class="assignments-view__table"
          :empty-text="t('assignments.list.noMatch')"
          :default-sort="{ prop: 'due_at', order: 'ascending' }"
          @row-click="open"
        >
          <el-table-column :label="t('assignments.list.col.title')" prop="title" :min-width="narrow ? 180 : 240" sortable>
            <template #default="{ row }">
              <div class="assignments-view__title">
                <router-link
                  :to="{ name: 'course-assignment', params: { courseId, assignmentId: row.id } }"
                  class="assignments-view__link"
                  @click.stop
                >
                  {{ row.title }}
                </router-link>
                <el-tag v-if="!row.published_at" type="warning" size="small" effect="plain" disable-transitions>
                  {{ t('assignments.state.unpublished') }}
                </el-tag>
              </div>
              <div class="assignments-view__sub app-muted">{{ componentLabel(row) }}</div>
              <div v-if="narrow" class="assignments-view__meta">
                <span class="app-muted">{{ t('assignments.list.pointsShort', { n: formatDecimal(row.points_possible) }) }}</span>
                <template v-if="isStudent">
                  <template v-if="mine.data.value?.get(row.id)">
                    <StatusTag vocab="submissionState" :value="mine.data.value.get(row.id)!.state" />
                  </template>
                  <span v-else-if="!mine.loading.value" class="app-muted">{{ t('assignments.state.notStarted') }}</span>
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('assignments.list.col.due')"
            prop="due_at"
            :min-width="narrow ? 110 : 150"
            sortable
            :sort-method="byDue"
          >
            <template #default="{ row }">
              <div v-if="row.due_at" class="assignments-view__due">
                <TimeText :value="row.due_at" relative />
                <el-tag v-if="overdue(row)" type="danger" size="small" disable-transitions>
                  {{ t('assignments.state.overdue') }}
                </el-tag>
                <el-tag v-else-if="isPast(row.due_at)" type="info" size="small" disable-transitions>
                  {{ t('assignments.state.pastDue') }}
                </el-tag>
              </div>
              <span v-else class="app-muted">{{ t('common.time.noDue') }}</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="!narrow"
            :label="t('assignments.list.col.points')"
            prop="points_possible"
            min-width="90"
            align="right"
            sortable
            :sort-method="byPoints"
          >
            <template #default="{ row }">{{ formatDecimal(row.points_possible) }}</template>
          </el-table-column>
          <el-table-column v-if="isStudent && !narrow" :label="t('assignments.list.col.mine')" min-width="150">
            <template #default="{ row }">
              <template v-if="mine.data.value?.get(row.id)">
                <div class="assignments-view__mine">
                  <StatusTag vocab="submissionState" :value="mine.data.value.get(row.id)!.state" />
                  <span class="app-muted">
                    {{ t('assignments.state.attempt', { n: mine.data.value.get(row.id)!.attempt }) }}
                  </span>
                </div>
              </template>
              <span v-else-if="mine.loading.value" class="app-muted">…</span>
              <span v-else class="app-muted">{{ t('assignments.state.notStarted') }}</span>
            </template>
          </el-table-column>
          <el-table-column v-else-if="writer && !narrow" :label="t('assignments.list.col.published')" min-width="150">
            <template #default="{ row }">
              <TimeText v-if="row.published_at" :value="row.published_at" />
              <span v-else class="app-muted">{{ t('assignments.detail.notPublished') }}</span>
            </template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
      </AsyncState>
    </section>

    <AssignmentFormDialog v-if="writer" v-model:visible="formOpen" :course-id="courseId" @saved="onSaved" />
  </div>
</template>

<style scoped>
.assignments-view__alert {
  margin-bottom: 16px;
}
.assignments-view__alert a {
  margin-left: 6px;
}
.assignments-view__alert:deep(.el-alert__content) {
  padding-right: 24px;
}
.assignments-view__approval {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -8px 0 16px;
}
.assignments-view__search {
  width: 260px;
  max-width: 100%;
}
.assignments-view__table :deep(.el-table__row) {
  cursor: pointer;
}
.assignments-view__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.assignments-view__link {
  color: var(--el-text-color-primary);
  font-weight: 500;
  text-decoration: none;
  word-break: break-word;
}
.assignments-view__link:hover {
  color: var(--el-color-primary);
}
.assignments-view__sub {
  font-size: 12px;
  margin-top: 2px;
}
.assignments-view__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 12px;
}
.assignments-view__due,
.assignments-view__mine {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
@media (max-width: 640px) {
  .app-card {
    padding: 12px;
  }
  .assignments-view__search {
    width: 100%;
  }
}
</style>
