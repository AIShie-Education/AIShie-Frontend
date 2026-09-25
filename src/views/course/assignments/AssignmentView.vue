<script setup lang="ts">
// One assignment (assignment.get): its instructions, read inline
// (document.get), what it is worth, when it is due and where it counts. Those
// who write assignments edit and publish it here (assignment.update,
// .publish); those who read the class's work see where it stands and go on to
// the submissions and grades pages. A student works on it here: see
// MyWorkPanel.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { ElMessageBox } from 'element-plus'
import { read } from '@/api/http'
import type { Assignment, DocumentFull } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatDecimal } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import DocumentFileLink from '@/components/DocumentFileLink.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import PageHeader from '@/components/PageHeader.vue'
import TimeText from '@/components/TimeText.vue'
import AssignmentFormDialog from './components/AssignmentFormDialog.vue'
import MyWorkPanel from './components/MyWorkPanel.vue'
import WorkSummary from './components/WorkSummary.vue'
import { useScheme } from './components/useAssignmentData'

const props = defineProps<{ courseId: string; assignmentId: string }>()
const { t } = useI18n()
const course = useCourseStore()

const state = useAsync<Assignment>(
  () => read('assignment.get', { course_id: props.courseId, assignment_id: props.assignmentId }),
  { watch: [() => props.assignmentId], keepData: true },
)
const assignment = computed(() => (state.data.value?.id === props.assignmentId ? state.data.value : undefined))
const scheme = useScheme(() => props.courseId)

const writer = computed(() => course.can('assignment_write'))
const isStudent = computed(() => course.role === 'student' && !!course.myMemberId)
const seesWork = computed(() => !isStudent.value && course.can('submission_read'))
const seesGrades = computed(
  () => !isStudent.value && (course.can('grade_read') || course.can('grade_submit') || course.can('grade_post')),
)

// --- Instructions ---------------------------------------------------------------
const instructions = useAsync<DocumentFull | null>(
  async () => {
    const id = assignment.value?.instructions_document_id
    return id ? read('document.get', { course_id: props.courseId, document_id: id }) : null
  },
  { watch: [() => assignment.value?.instructions_document_id] },
)
const instructionsDoc = computed(() => instructions.data.value ?? null)
/** Instructions exist but students have nothing of them to read. */
const instructionsUnpublished = computed(() => !!instructionsDoc.value && !instructionsDoc.value.published_version_id)

// --- Due -----------------------------------------------------------------------------
const pastDue = computed(() => !!assignment.value?.due_at && dayjs(assignment.value.due_at).isBefore(dayjs()))
const componentLabel = computed(() => {
  const a = assignment.value
  if (!a?.component_id) return t('assignments.state.practice')
  return scheme.componentName(a.component_id) ?? t('assignments.state.counts')
})

// --- Editing and publishing ---------------------------------------------------------
/** A change that waits for approval: the page shows the assignment as it still is. */
const pendingNote = ref<string | null>(null)
/** Publications asked for from this page that wait for approval: not to be asked for twice. */
const publishProposed = ref(false)
const instructionsProposed = ref(false)

const formOpen = ref(false)
function onSaved(r: { status: 'executed' | 'proposed' }) {
  pendingNote.value = r.status === 'proposed' ? t('assignments.detail.proposed.edit') : null
  void state.reload()
  void instructions.reload()
  void scheme.reload()
}

const publishW = useWrite('assignment.publish')
async function publish() {
  const a = assignment.value
  if (!a) return
  const lines = [t('assignments.detail.publishConfirm', { title: a.title })]
  // Instructions known to be unpublished keep the button disabled; those that
  // could not be read may be either.
  if (a.instructions_document_id && !instructionsDoc.value) lines.push(t('assignments.detail.publishNeedsInstructions'))
  if (course.needsApproval('assignment_write')) lines.push(t('assignments.detail.publishApproval'))
  try {
    await ElMessageBox.confirm(lines.join(' '), t('assignments.detail.publishTitle'), {
      type: 'warning',
      confirmButtonText: t('common.actions.publish'),
      cancelButtonText: t('common.actions.cancel'),
    })
  } catch {
    return
  }
  const out = await publishW.run(
    { course_id: props.courseId, assignment_id: a.id },
    { success: t('assignments.detail.published') },
  )
  if (out?.status === 'executed') {
    pendingNote.value = null
    course.invalidate('assignments')
    void state.reload()
  } else if (out?.status === 'proposed') {
    publishProposed.value = true
    pendingNote.value = t('assignments.detail.proposed.publish')
  }
}

const publishDocW = useWrite('document.publish')
async function publishInstructions() {
  const d = instructionsDoc.value
  if (!d) return
  const out = await publishDocW.run(
    { course_id: props.courseId, document_id: d.id, version_id: d.version?.id },
    { success: t('assignments.detail.instructionsPublished') },
  )
  if (out?.status === 'executed') void instructions.reload()
  else if (out?.status === 'proposed') {
    instructionsProposed.value = true
    pendingNote.value = t('assignments.detail.proposed.instructions')
  }
}

/** A hand-in found other instructions in force than the ones shown: show those. */
function onInstructionsChanged() {
  void state.reload()
  void instructions.reload()
}

const summary = ref<InstanceType<typeof WorkSummary> | null>(null)
const work = ref<InstanceType<typeof MyWorkPanel> | null>(null)
function refresh() {
  // What was proposed may have been decided since; Core says if it is still waiting.
  publishProposed.value = false
  instructionsProposed.value = false
  void state.reload()
  void instructions.reload()
  summary.value?.reload()
  work.value?.reload()
}
</script>

<template>
  <div class="assignment-view">
    <PageHeader
      :title="assignment?.title ?? t('assignments.detail.title')"
      :back="{ name: 'course-assignments', params: { courseId } }"
    >
      <template v-if="assignment" #tags>
        <el-tag v-if="!assignment.published_at" type="warning" disable-transitions>
          {{ t('assignments.state.unpublished') }}
        </el-tag>
        <el-tag v-if="pastDue" type="info" disable-transitions>{{ t('assignments.state.pastDue') }}</el-tag>
      </template>
      <template v-if="assignment" #subtitle>
        <span v-if="assignment.due_at">
          {{ t('assignments.detail.dueLine') }} <TimeText :value="assignment.due_at" /> (<TimeText
            :value="assignment.due_at"
            relative
          />)
        </span>
        <span v-else>{{ t('common.time.noDue') }}</span>
        · {{ t('assignments.detail.pointsLine', { n: formatDecimal(assignment.points_possible) }) }}
      </template>
      <el-button :loading="state.loading.value" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.refresh') }}</span>
      </el-button>
      <template v-if="assignment && writer">
        <el-button :disabled="!course.writable" @click="formOpen = true">
          <el-icon><Edit /></el-icon>
          <span>{{ t('common.actions.edit') }}</span>
        </el-button>
        <el-tooltip
          v-if="!assignment.published_at"
          :content="
            instructionsUnpublished
              ? t('assignments.detail.instructionsUnpublished')
              : t('assignments.detail.proposed.publish')
          "
          :disabled="!(instructionsUnpublished || publishProposed) || !course.writable"
          placement="bottom"
        >
          <span>
            <el-button
              type="primary"
              :disabled="!course.writable || instructionsUnpublished || publishProposed"
              :loading="publishW.pending.value"
              @click="publish"
            >
              <el-icon><Promotion /></el-icon>
              <span>{{ t('common.actions.publish') }}</span>
            </el-button>
          </span>
        </el-tooltip>
        <el-tag
          v-if="course.needsApproval('assignment_write')"
          type="warning"
          size="small"
          class="assignment-view__approval"
          disable-transitions
        >
          {{ t('enums.level.confirm_required') }}
        </el-tag>
      </template>
    </PageHeader>

    <el-alert v-if="pendingNote" type="info" show-icon class="assignment-view__alert" @close="pendingNote = null">
      <template #title>
        {{ pendingNote }}
        <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
          {{ t('assignments.list.viewMyActions') }}
        </router-link>
      </template>
    </el-alert>

    <AsyncState :loading="state.loading.value && !assignment" :error="state.error.value" @retry="state.reload">
      <template v-if="assignment">
        <el-alert
          v-if="writer && !assignment.published_at"
          type="info"
          :closable="false"
          show-icon
          class="assignment-view__alert"
          :title="t('assignments.detail.unpublishedAlert')"
        />
        <el-alert
          v-if="writer && !assignment.published_at && instructionsUnpublished"
          type="warning"
          :closable="false"
          show-icon
          class="assignment-view__alert"
        >
          <template #title>
            {{ t('assignments.detail.instructionsUnpublished') }}
            <el-button
              v-if="course.can('document_write') && instructionsDoc?.version"
              link
              type="primary"
              :disabled="!course.writable || instructionsProposed"
              :loading="publishDocW.pending.value"
              @click="publishInstructions"
            >
              {{ t('assignments.detail.publishInstructions') }}
            </el-button>
          </template>
        </el-alert>

        <div class="assignment-view__layout">
          <div class="assignment-view__main">
            <!-- Instructions -->
            <section class="app-card">
              <h2 class="app-card__title">
                <span>{{ t('assignments.detail.instructions') }}</span>
                <router-link
                  v-if="assignment.instructions_document_id"
                  :to="{
                    name: 'course-document',
                    params: { courseId, documentId: assignment.instructions_document_id },
                  }"
                  class="assignment-view__doclink"
                >
                  {{ t('assignments.detail.openDocument') }}
                  <el-icon><ArrowRight /></el-icon>
                </router-link>
              </h2>
              <p v-if="!assignment.instructions_document_id" class="app-muted assignment-view__none">
                {{ t('assignments.detail.noInstructions') }}
              </p>
              <AsyncState
                v-else
                :loading="instructions.loading.value && !instructionsDoc"
                :error="instructions.error.value"
                @retry="instructions.reload"
              >
                <template v-if="instructionsDoc">
                  <el-alert
                    v-if="instructionsDoc.version && !instructionsDoc.version.published"
                    type="info"
                    :closable="false"
                    class="assignment-view__alert"
                    :title="
                      instructionsDoc.published_version_id
                        ? t('assignments.detail.draftVersion', { seq: instructionsDoc.version.seq })
                        : t('assignments.detail.draftVersionNone', { seq: instructionsDoc.version.seq })
                    "
                  />
                  <template v-if="instructionsDoc.version">
                    <MarkdownView v-if="instructionsDoc.version.body_md" :source="instructionsDoc.version.body_md" />
                    <p v-else-if="!instructionsDoc.version.download_url" class="app-muted assignment-view__none">
                      {{ t('assignments.detail.noText') }}
                    </p>
                    <div v-if="instructionsDoc.version.download_url" class="assignment-view__file">
                      <span class="app-muted">{{ t('assignments.detail.attachedFile') }}</span>
                      <DocumentFileLink
                        :course-id="courseId"
                        :document-id="instructionsDoc.id"
                        :version-id="instructionsDoc.version.id"
                        :title="instructionsDoc.title"
                      />
                    </div>
                  </template>
                  <p v-else class="app-muted assignment-view__none">{{ t('assignments.detail.noVersion') }}</p>
                </template>
              </AsyncState>
            </section>

            <MyWorkPanel
              v-if="isStudent"
              ref="work"
              :course-id="courseId"
              :assignment="assignment"
              :instructions-version-id="instructionsDoc?.published_version_id ?? null"
              @instructions-changed="onInstructionsChanged"
            />
          </div>

          <aside class="assignment-view__side">
            <!-- Details -->
            <section class="app-card">
              <h2 class="app-card__title">{{ t('assignments.detail.details') }}</h2>
              <dl class="assignment-view__facts">
                <dt>{{ t('assignments.detail.points') }}</dt>
                <dd class="assignment-view__num">{{ formatDecimal(assignment.points_possible) }}</dd>
                <dt>{{ t('assignments.detail.due') }}</dt>
                <dd>
                  <template v-if="assignment.due_at">
                    <TimeText :value="assignment.due_at" />
                    <div class="app-muted assignment-view__rel"><TimeText :value="assignment.due_at" relative /></div>
                  </template>
                  <span v-else class="app-muted">{{ t('common.time.noDue') }}</span>
                </dd>
                <dt>{{ t('assignments.detail.component') }}</dt>
                <dd>
                  {{ componentLabel }}
                  <div v-if="!assignment.component_id" class="app-muted assignment-view__rel">
                    {{ t('assignments.detail.practiceHint') }}
                  </div>
                </dd>
                <template v-if="writer || assignment.published_at">
                  <dt>{{ t('assignments.detail.publishedAt') }}</dt>
                  <dd>
                    <TimeText v-if="assignment.published_at" :value="assignment.published_at" />
                    <span v-else class="app-muted">{{ t('assignments.detail.notPublished') }}</span>
                  </dd>
                </template>
                <template v-if="assignment.rubric_document_id && course.can('rubric_read')">
                  <dt>{{ t('assignments.detail.rubric') }}</dt>
                  <dd>
                    <router-link
                      :to="{ name: 'course-document', params: { courseId, documentId: assignment.rubric_document_id } }"
                    >
                      {{ t('assignments.detail.openRubric') }}
                    </router-link>
                  </dd>
                </template>
              </dl>
            </section>

            <!-- The class's work -->
            <section v-if="seesWork || seesGrades" class="app-card">
              <h2 class="app-card__title">{{ t('assignments.detail.work') }}</h2>
              <WorkSummary v-if="seesWork" ref="summary" :course-id="courseId" :assignment-id="assignment.id" />
              <div class="assignment-view__links">
                <router-link
                  v-if="seesWork"
                  :to="{ name: 'course-submissions', params: { courseId }, query: { assignment: assignment.id } }"
                >
                  <el-button>
                    <el-icon><Files /></el-icon>
                    <span>{{ t('assignments.detail.openSubmissions') }}</span>
                  </el-button>
                </router-link>
                <router-link
                  v-if="seesGrades"
                  :to="{ name: 'course-grades', params: { courseId }, query: { assignment: assignment.id } }"
                >
                  <el-button>
                    <el-icon><Medal /></el-icon>
                    <span>{{ t('assignments.detail.openGrades') }}</span>
                  </el-button>
                </router-link>
              </div>
              <p class="app-form-hint">{{ t('assignments.detail.workHint') }}</p>
            </section>
          </aside>
        </div>

        <AssignmentFormDialog
          v-if="writer"
          v-model:visible="formOpen"
          :course-id="courseId"
          :assignment="assignment"
          @saved="onSaved"
        />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.assignment-view__alert {
  margin-bottom: 16px;
}
.assignment-view__alert a {
  margin-left: 6px;
}
/* Room for the close button beside a long notice. */
.assignment-view__alert:deep(.el-alert__content) {
  padding-right: 24px;
}
.assignment-view__approval {
  align-self: center;
}
.assignment-view__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}
.assignment-view__main,
.assignment-view__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
/* The cards are spaced by the column's gap. */
.assignment-view__main .app-card + .app-card,
.assignment-view__side .app-card + .app-card {
  margin-top: 0;
}
.assignment-view__doclink {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  font-weight: 400;
  text-decoration: none;
  white-space: nowrap;
}
.assignment-view__none {
  margin: 0;
  font-size: 14px;
}
.assignment-view__file {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
}
.assignment-view__facts {
  margin: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px 16px;
  font-size: 14px;
}
.assignment-view__facts dt {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.assignment-view__facts dd {
  margin: 0;
  word-break: break-word;
}
.assignment-view__num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.assignment-view__rel {
  font-size: 12px;
  margin-top: 2px;
}
.assignment-view__links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
@media (max-width: 960px) {
  .assignment-view__layout {
    grid-template-columns: minmax(0, 1fr);
  }
  /* On a narrow screen the facts come first. */
  .assignment-view__side {
    order: -1;
  }
}
@media (max-width: 640px) {
  .app-card {
    padding: 14px;
  }
}
</style>
