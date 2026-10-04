<script setup lang="ts">
// One assignment (assignment.get): its instructions, read inline
// (document.get), what it is worth, when it is due and where it counts. Those
// who write assignments edit and publish it here (assignment.update,
// .publish), and take back a publication made by mistake (.unpublish) while
// nobody has started on it; those who read the class's work see where it
// stands and go on to the submissions and grades pages. A student works on it
// here: see MyWorkPanel. Those who write assignments delete one for good
// from the header's ⋯ menu (DeleteAssignmentDialog), and come back to the
// list; an assignment deleted since its link was given says so.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessageBox } from 'element-plus'
import { read } from '@/api/http'
import type { Assignment, DocumentFull } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatDecimal } from '@/utils/format'
import { versionFilesOf } from '@/utils/documentFiles'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import StatusTag from '@/components/StatusTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import VersionFileList from '@/components/VersionFileList.vue'
import Tombstone from '@/views/course/materials/components/Tombstone.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import PageHeader from '@/components/PageHeader.vue'
import TimeText from '@/components/TimeText.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import AssignmentFormDialog from './components/AssignmentFormDialog.vue'
import AssignmentMoreMenu from './components/AssignmentMoreMenu.vue'
import DeleteAssignmentDialog from './components/DeleteAssignmentDialog.vue'
import MyWorkPanel from './components/MyWorkPanel.vue'
import WorkSummary from './components/WorkSummary.vue'
import { useScheme } from './components/useAssignmentData'
import { deletedAt, isDeletedError } from './components/deletion'

const props = defineProps<{ courseId: string; assignmentId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const router = useRouter()

const state = useAsync<Assignment>(
  () => read('assignment.get', { course_id: props.courseId, assignment_id: props.assignmentId }),
  { watch: [() => props.assignmentId], keepData: true },
)
const assignment = computed(() => (state.data.value?.id === props.assignmentId ? state.data.value : undefined))
/** Core's word that it was deleted for good: the page says so, and leads back to the list. */
const deleted = computed(() => (state.error.value && isDeletedError(state.error.value) ? state.error.value : null))
const deletedWhen = computed(() => deletedAt(deleted.value))
const scheme = useScheme(() => props.courseId)

const writer = computed(() => course.can('assignment_write'))
const isStudent = computed(() => course.role === 'student' && !!course.myMemberId)
const seesWork = computed(() => !isStudent.value && course.can('submission_read'))
// The grades page lists with grade.list and component.tree, which take grade_read alone.
const seesGrades = computed(() => !isStudent.value && course.can('grade_read'))

// --- Instructions ---------------------------------------------------------------
const instructions = useAsync<DocumentFull | null>(
  async () => {
    const id = assignment.value?.instructions_document_id
    return id ? read('document.get', { course_id: props.courseId, document_id: id }) : null
  },
  { watch: [() => assignment.value?.instructions_document_id] },
)
const instructionsDoc = computed(() => instructions.data.value ?? null)
/** The instructions' files, in order. */
const instructionFiles = computed(() => versionFilesOf(instructionsDoc.value?.version))
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
  // Core's sweep then records every student with nothing as missing, and
  // from then on it cannot be taken back.
  if (pastDue.value) lines.push(t('assignments.detail.publishPastDue'))
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
    unpublishProposed.value = false
    course.invalidate('assignments')
    void state.reload()
  } else if (out?.status === 'proposed') {
    publishProposed.value = true
    pendingNote.value = t('assignments.detail.proposed.publish')
  }
}

// --- Unpublishing ----------------------------------------------------------------------
// Core takes a publication back only while nobody has any submission row for
// the assignment: not a draft, not a hand-in, not a record of missing work
// (made by hand, or by Core's sweep once the due date has passed). Where the
// class's work is read (WorkSummary), a row seen settles it; where it is not,
// or the caller's student scope leaves students out, Core decides. (An
// assignment outside the caller's assignment scope does not open here.)

/** Rows of work on it the caller can see, of any state; null while not known. */
const workRows = ref<number | null>(null)
/** Of those, drafts and hand-ins: not records of missing work. */
const workAttempts = ref<number | null>(null)
function onCounted(rows: number | null, attempts: number | null) {
  workRows.value = rows
  workAttempts.value = attempts
}
/** Someone has a row for it: Core would refuse. */
const started = computed(() => (workRows.value ?? 0) > 0)
/** Why it can no longer be unpublished: someone started, or only missing work was recorded. */
const startedText = computed(() =>
  (workAttempts.value ?? 0) > 0 ? t('assignments.detail.unpublishStarted') : t('assignments.detail.unpublishMissing'),
)
/** Nobody has started, as far as every student's work goes (the caller's student scope reaches them all). */
const checkedAll = computed(() => workRows.value === 0 && course.membership?.student_scope === 'all')
/** Unpublishing asked for from this page that waits for approval: not to be asked for twice. */
const unpublishProposed = ref(false)

const unpublishW = useWrite('assignment.unpublish')
async function unpublish() {
  const a = assignment.value
  if (!a) return
  const lines = [t('assignments.detail.unpublishConfirm', { title: a.title })]
  if (!checkedAll.value) lines.push(t('assignments.detail.unpublishUnchecked'))
  if (course.needsApproval('assignment_write')) lines.push(t('assignments.detail.unpublishApproval'))
  try {
    await ElMessageBox.confirm(lines.join(' '), t('assignments.detail.unpublishTitle'), {
      type: 'warning',
      confirmButtonText: t('assignments.detail.unpublish'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  const out = await unpublishW.run(
    { course_id: props.courseId, assignment_id: a.id },
    { success: t('assignments.detail.unpublished') },
  )
  if (out?.status === 'executed') {
    pendingNote.value = null
    publishProposed.value = false
    course.invalidate('assignments')
    void state.reload()
  } else if (out?.status === 'proposed') {
    unpublishProposed.value = true
    pendingNote.value = t('assignments.detail.proposed.unpublish')
  } else {
    // Refused (and shown). Someone may have started on it since the page was
    // read, or it was unpublished elsewhere: show where it stands now.
    const code = unpublishW.lastError.value?.code
    if (code === 'failed_precondition' || code === 'conflict') {
      void state.reload()
      summary.value?.reload()
    }
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

// --- Deleting it for good ------------------------------------------------------------
const deleteOpen = ref(false)
/** Deleting it, asked for from this page, waits for approval: not to be asked for twice. */
const deleteProposed = ref(false)
/** Why it cannot be deleted from here now, which the menu says; null while it can. */
const deleteWhy = computed(() => {
  if (!course.writable) return t('common.archivedCourse')
  if (deleteProposed.value && assignment.value)
    return t('assignments.delete.proposed', { title: assignment.value.title })
  return null
})
function onDeleted() {
  // Every list of assignments the course keeps leaves it out from now on.
  course.invalidate('assignments')
  void router.replace({ name: 'course-assignments', params: { courseId: props.courseId } })
}
function onDeleteProposed() {
  deleteProposed.value = true
  if (assignment.value) pendingNote.value = t('assignments.delete.proposed', { title: assignment.value.title })
}
/** It was deleted elsewhere meanwhile: read it again, and the page says so. */
function onGone() {
  course.invalidate('assignments')
  void state.reload()
}

const summary = ref<InstanceType<typeof WorkSummary> | null>(null)
const work = ref<InstanceType<typeof MyWorkPanel> | null>(null)
function refresh() {
  // What was proposed may have been decided since; Core says if it is still waiting.
  publishProposed.value = false
  unpublishProposed.value = false
  instructionsProposed.value = false
  deleteProposed.value = false
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
        <AppTag v-if="!assignment.published_at" tone="wait" size="default">
          {{ t('assignments.state.unpublished') }}
        </AppTag>
        <AppTag v-if="pastDue" size="default">{{ t('assignments.state.pastDue') }}</AppTag>
      </template>
      <template v-if="assignment" #subtitle>
        <!-- A cut-off: the time with its zone, the exact UTC on hover. -->
        <i18n-t v-if="assignment.due_at" keypath="assignments.detail.dueLine" tag="span" scope="global">
          <template #at><TimeText :value="assignment.due_at" cutoff /></template>
          <template #rel><TimeText :value="assignment.due_at" relative /></template>
        </i18n-t>
        <span v-else>{{ t('common.time.noDue') }}</span
        >{{ t('common.sep') }}{{ t('assignments.detail.pointsLine', { n: formatDecimal(assignment.points_possible) }) }}
      </template>
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
        <el-tooltip
          v-else
          :content="unpublishProposed ? t('assignments.detail.proposed.unpublish') : startedText"
          :disabled="!(started || unpublishProposed) || !course.writable"
          placement="bottom"
        >
          <span>
            <el-button
              type="danger"
              plain
              :disabled="!course.writable || started || unpublishProposed"
              :loading="unpublishW.pending.value"
              @click="unpublish"
            >
              <el-icon><Hide /></el-icon>
              <span>{{ t('assignments.detail.unpublish') }}</span>
            </el-button>
          </span>
        </el-tooltip>
        <StatusTag
          v-if="course.needsApproval('assignment_write')"
          vocab="level"
          value="confirm_required"
          class="assignment-view__approval"
          size="small"
        />
        <!-- What cannot be taken back is not beside what is done every day: it is in the ⋯ menu, at the far end. -->
        <AssignmentMoreMenu :title="assignment.title" :why="deleteWhy" @delete="deleteOpen = true" />
      </template>
    </PageHeader>

    <AppNote v-if="pendingNote" class="assignment-view__alert" @close="pendingNote = null" closable>
      {{ pendingNote }}
      <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
        {{ t('assignments.list.viewMyActions') }}
      </router-link>
    </AppNote>

    <AppEmpty v-if="deleted" page :title="t('assignments.delete.gone')" :text="t('assignments.delete.goneHint')">
      <p v-if="deletedWhen" class="assignment-view__gone-at">
        <i18n-t keypath="assignments.delete.goneAt" tag="span" scope="global">
          <template #at><TimeText :value="deletedWhen" /></template>
        </i18n-t>
      </p>
      <router-link :to="{ name: 'course-assignments', params: { courseId } }">
        <el-button type="primary">{{ t('assignments.delete.backToList') }}</el-button>
      </router-link>
    </AppEmpty>
    <AsyncState v-else :loading="state.loading.value && !assignment" :error="state.error.value" @retry="state.reload">
      <template v-if="assignment">
        <AppNote v-if="writer && !assignment.published_at" class="assignment-view__alert">
          {{ t('assignments.detail.unpublishedAlert') }}
        </AppNote>
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

        <div class="assignment-view__layout app-columns">
          <div class="assignment-view__main app-column">
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
                  <AppNote
                    v-if="instructionsDoc.version && !instructionsDoc.version.published"
                    class="assignment-view__alert"
                  >
                    {{
                      instructionsDoc.published_version_id
                        ? t('assignments.detail.draftVersion', { seq: instructionsDoc.version.seq })
                        : t('assignments.detail.draftVersionNone', { seq: instructionsDoc.version.seq })
                    }}
                  </AppNote>
                  <Tombstone
                    v-if="instructionsDoc.version?.purged"
                    :purge="instructionsDoc.version.purged"
                    of="version"
                  />
                  <template v-else-if="instructionsDoc.version">
                    <MarkdownView v-if="instructionsDoc.version.body_md" :source="instructionsDoc.version.body_md" />
                    <p v-else-if="!instructionFiles.length" class="app-muted assignment-view__none">
                      {{ t('assignments.detail.noText') }}
                    </p>
                    <div v-if="instructionFiles.length" class="assignment-view__file">
                      <span class="app-muted">{{
                        t('assignments.detail.attachedFiles', instructionFiles.length)
                      }}</span>
                      <VersionFileList
                        :course-id="courseId"
                        :document-id="instructionsDoc.id"
                        :version-id="instructionsDoc.version.id"
                        :files="instructionFiles"
                        :doc-title="instructionsDoc.title"
                        :date="instructionsDoc.version.created_at"
                        :retry-renditions="course.writable && course.can('document_write')"
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

          <aside class="assignment-view__side app-column">
            <!-- Details -->
            <section class="app-card">
              <h2 class="app-card__title">
                <span>{{ t('assignments.detail.details') }}</span>
                <RefreshButton :loading="state.loading.value" @click="refresh" />
              </h2>
              <dl class="assignment-view__facts">
                <dt>{{ t('assignments.detail.points') }}</dt>
                <dd class="assignment-view__num">{{ formatDecimal(assignment.points_possible) }}</dd>
                <dt>{{ t('assignments.detail.due') }}</dt>
                <dd>
                  <template v-if="assignment.due_at">
                    <TimeText :value="assignment.due_at" cutoff />
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
              <WorkSummary
                v-if="seesWork"
                ref="summary"
                :course-id="courseId"
                :assignment-id="assignment.id"
                @counted="onCounted"
              />
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
        <DeleteAssignmentDialog
          v-if="writer"
          v-model="deleteOpen"
          :course-id="courseId"
          :assignment="assignment"
          @deleted="onDeleted"
          @proposed="onDeleteProposed"
          @gone="onGone"
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
/* The page's own width decides its columns, not the window's: the side bar takes from it. */
.assignment-view {
  container-type: inline-size;
}
.assignment-view__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
}
.assignment-view__doclink {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--app-text-sm);
  font-weight: 400;
  text-decoration: none;
  white-space: nowrap;
}
.assignment-view__none {
  margin: 0;
  font-size: var(--app-text-md);
}
.assignment-view__file {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: var(--app-text-sm);
}
.assignment-view__facts {
  margin: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px 16px;
  font-size: var(--app-text-md);
}
.assignment-view__facts dt {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-sm);
}
.assignment-view__facts dd {
  margin: 0;
  word-break: break-word;
}
.assignment-view__num {
  font-variant-numeric: tabular-nums;
  font-weight: var(--app-weight-strong);
}
.assignment-view__rel {
  font-size: var(--app-text-xs);
  margin-top: 2px;
}
.assignment-view__links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
/* Two columns while the main one keeps 420 px or more beside the 300 px one. */
@container (max-width: 739px) {
  .assignment-view__layout {
    grid-template-columns: minmax(0, 1fr);
  }
  /* On a narrow screen the facts come first. */
  .assignment-view__side {
    order: -1;
  }
}
.assignment-view__gone-at {
  margin: 0 0 12px;
}
@media (max-width: 640px) {
  .app-card {
    padding: 14px;
  }
}
</style>
