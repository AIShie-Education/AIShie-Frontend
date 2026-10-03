<script setup lang="ts">
// Creating an assignment, or changing one (assignment.create / .update). Its
// instructions and rubric can be chosen from the course's documents or
// written here: a new one is created (document.create) and, if asked,
// published (document.publish) before the assignment is saved. A change of
// what it is worth after grades have been entered for it says what becomes
// of them (existing_grades), explained in the actual numbers.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { ElMessage, ElNotification, type FormInstance, type FormItemRule } from 'element-plus'
import AppNote from '@/components/AppNote.vue'
import StatusTag from '@/components/StatusTag.vue'
import type { ToolIn, WriteOutcome } from '@/api/http'
import type { Assignment, DocumentSummary } from '@/api/types'
import { notifyError } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { FILE_REFUSAL_SCOPE, uploadedPayload } from '@/utils/documentFiles'
import { formatList, isDecimal } from '@/utils/format'
import ExistingGradesChoice from '@/views/course/grades/components/ExistingGradesChoice.vue'
import { enteredScores, type ExistingGrades } from '@/views/course/grades/components/pointsChange'
import DocChoiceField from './DocChoiceField.vue'
import { allDocuments, useScheme } from './useAssignmentData'
import { emptyDocChoice, type DocChoice } from './types'

type DocKind = 'instructions' | 'rubric'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{ courseId: string; assignment?: Assignment | null }>()
const emit = defineEmits<{ saved: [result: { status: 'executed' | 'proposed'; id?: string }] }>()

const { t } = useI18n()
const course = useCourseStore()
// Loaded when the dialog opens (init), not while it sits closed.
const scheme = useScheme(() => props.courseId, { immediate: false })

const editing = computed(() => !!props.assignment)
const disabled = computed(() => !course.writable)

interface FormState {
  title: string
  points: string
  due: Date | null
  componentId: string
  instructions: DocChoice
  rubric: DocChoice
}
const form = reactive<FormState>({
  title: '',
  points: '',
  due: null,
  componentId: '',
  instructions: emptyDocChoice('instructions'),
  rubric: emptyDocChoice('rubric'),
})
const formRef = ref<FormInstance>()
/** Something the person should know about a document before saving again. */
const docNotice = ref<string | null>(null)

// --- What becomes of grades already entered when the points change -------------
/** The live entered scores on it, where the caller may read them; null while not known. */
const graded = ref<string[] | null>(null)
/** Core said grades have been entered (existing_grades_required) where they could not be read. */
const coreAsked = ref(false)
const existing = ref<ExistingGrades | ''>('')
let gradedFor = 0
async function loadGraded() {
  const n = ++gradedFor
  graded.value = null
  const a = props.assignment
  if (!a || !course.can('grade_read')) return
  try {
    const scores = await enteredScores(props.courseId, { assignmentId: a.id })
    if (n === gradedFor) graded.value = scores
  } catch {
    /* not readable: Core says so when saving, and the choice is asked for then */
  }
}
const pointsChanged = computed(
  () =>
    !!props.assignment && isDecimal(form.points) && !sameDecimal(form.points.trim(), props.assignment.points_possible),
)
const hasGrades = computed(() => (graded.value?.length ?? 0) > 0 || coreAsked.value)
/** Changing the points changes the grades too, which takes grading and posting as well. */
const pointsLocked = computed(() => hasGrades.value && !course.canAll(['grade_submit', 'grade_post']))
const askExisting = computed(() => pointsChanged.value && hasGrades.value && !pointsLocked.value)
watch(pointsLocked, (locked) => {
  if (locked && props.assignment) form.points = String(props.assignment.points_possible)
})
/** Saving was pressed without saying what becomes of the grades. */
const existingMissing = ref(false)
watch([() => form.points, existing], () => (existingMissing.value = false))

// --- The documents it can point at --------------------------------------------
const docs = reactive<Record<DocKind, DocumentSummary[]>>({ instructions: [], rubric: [] })
const docsError = reactive<Record<DocKind, boolean>>({ instructions: false, rubric: false })
const docsLoading = ref(false)

async function loadDocs() {
  docsLoading.value = true
  const kinds: DocKind[] = ['instructions', 'rubric']
  await Promise.all(
    kinds.map(async (k) => {
      docsError[k] = false
      if (k === 'rubric' && !course.can('rubric_read')) {
        docs[k] = []
        docsError[k] = true
        return
      }
      try {
        docs[k] = await allDocuments(props.courseId, k)
      } catch {
        docs[k] = []
        docsError[k] = true
      }
    }),
  )
  docsLoading.value = false
}

function currentDocId(kind: DocKind): string | null | undefined {
  return kind === 'instructions' ? props.assignment?.instructions_document_id : props.assignment?.rubric_document_id
}

function init() {
  const a = props.assignment
  form.title = a?.title ?? ''
  form.points = a ? String(a.points_possible) : ''
  form.due = a?.due_at ? new Date(a.due_at) : null
  form.componentId = a?.component_id ?? ''
  form.instructions = emptyDocChoice('instructions', a?.instructions_document_id)
  form.rubric = emptyDocChoice('rubric', a?.rubric_document_id)
  docNotice.value = null
  existing.value = ''
  coreAsked.value = false
  formRef.value?.clearValidate()
  void loadDocs()
  void scheme.reload()
  void loadGraded()
}
watch(visible, (v) => v && init(), { immediate: true })

// --- Where it counts -----------------------------------------------------------
const bucketOptions = computed(() => {
  const list = [...scheme.buckets.value]
  // A component it already hangs from stays choosable even if the scheme has
  // changed shape since.
  const cur = props.assignment?.component_id
  if (cur && !list.some((b) => b.id === cur)) {
    list.push({ id: cur, label: scheme.componentName(cur) ?? t('assignments.state.counts') })
  }
  return list
})

// --- Validation ------------------------------------------------------------------
const publishedAssignment = computed(() => !!props.assignment?.published_at)
/**
 * A published assignment's instructions must have a published version (Core
 * refuses anything else): only such a document can be chosen, and a new one
 * is published at once.
 */
const mustPublish = (kind: DocKind) => kind === 'instructions' && publishedAssignment.value
/** The chosen existing document is known to have no published version. */
function choiceUnpublished(kind: DocKind): boolean {
  const c = form[kind]
  if (c.mode !== 'existing' || !c.id) return false
  const d = docs[kind].find((x) => x.id === c.id)
  return !!d && !d.published_version_id
}

function docProblem(kind: DocKind): string | null {
  const c = form[kind]
  if (c.mode === 'existing' && !c.id) return t('assignments.form.doc.chooseRequired')
  if (mustPublish(kind) && choiceUnpublished(kind)) return t('assignments.form.doc.mustBePublished')
  if (c.mode === 'new') {
    if (!c.title.trim()) return t('common.errors.required')
    if (!c.body.trim() && !c.files.length) return t('assignments.form.doc.needContent')
  }
  return null
}
const docRule = (kind: DocKind): FormItemRule => ({
  validator: (_r, _v, cb) => {
    const p = docProblem(kind)
    return p ? cb(new Error(p)) : cb()
  },
  // Checked on saving only: switching to "write new" is not yet a mistake.
  trigger: 'submit',
})
// A document choice being changed clears what saving last said about it.
watch(
  () => form.instructions,
  () => formRef.value?.clearValidate(['instructions']),
)
watch(
  () => form.rubric,
  () => formRef.value?.clearValidate(['rubric']),
)
const rules = computed<Record<string, FormItemRule[]>>(() => ({
  title: [{ required: true, whitespace: true, message: t('common.errors.required'), trigger: 'blur' }],
  points: [
    { required: true, whitespace: true, message: t('common.errors.required'), trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => {
        if (!v || !v.trim()) return cb(new Error(t('common.errors.required')))
        if (!isDecimal(v) || Number(v) < 0) return cb(new Error(t('assignments.form.pointsInvalid')))
        cb()
      },
      trigger: 'blur',
    },
  ],
  instructions: [docRule('instructions')],
  rubric: [docRule('rubric')],
}))

// --- Saving ------------------------------------------------------------------------
const createDoc = useWrite('document.create')
const publishDoc = useWrite('document.publish')
const createAssignment = useWrite('assignment.create')
const updateAssignment = useWrite('assignment.update')
const busy = ref(false)
/** A new document's file is still uploading: saving now would go without it. */
const uploading = reactive<Record<DocKind, boolean>>({ instructions: false, rubric: false })
const anyUploading = computed(() => uploading.instructions || uploading.rubric)

/**
 * The document the choice names, creating it first if it is new (created
 * true). ok false: stop — it failed (already shown), or its creation waits
 * for approval and so has no id yet. Nothing is said about a document
 * created here: saving says it once, for the assignment and its documents.
 */
async function resolveDoc(kind: DocKind): Promise<{ ok: boolean; id?: string; created?: boolean }> {
  const c = form[kind]
  if (c.mode === 'none') return { ok: true }
  if (c.mode === 'existing') return { ok: true, id: c.id }
  const title = c.title.trim()
  const out = await createDoc.run(
    {
      course_id: props.courseId,
      kind,
      title,
      body_md: c.body.trim() ? c.body : undefined,
      // Its files, in the order listed, each named.
      ...(c.files.length ? { files: uploadedPayload(c.files) } : {}),
    },
    { success: false, reasons: [FILE_REFUSAL_SCOPE, 'materials.refusal'] },
  )
  if (!out) return { ok: false }
  if (out.status === 'proposed') {
    // No document yet, and none to point at. Put the choice back, so that
    // saving again does not propose the same document twice.
    form[kind] = emptyDocChoice(kind, currentDocId(kind))
    docNotice.value = t('assignments.form.docProposed', { title })
    return { ok: false }
  }
  const id = out.result.document_id
  // From here on it is an existing document: saving again (after a later
  // step failed) must not create it a second time.
  const entry: DocumentSummary = {
    id,
    kind,
    title,
    published_version_id: null,
    sort_order: 0,
    status: 'active',
    created_at: new Date().toISOString(),
  }
  docs[kind] = [...docs[kind], entry]
  form[kind] = emptyDocChoice(kind, id)
  createdTitles.value = [...createdTitles.value, title]
  let published = false
  if ((c.publish || mustPublish(kind)) && out.result.version_id) {
    const p = await publishDoc.run(
      { course_id: props.courseId, document_id: id, version_id: out.result.version_id },
      { success: false },
    )
    if (p?.status === 'executed') {
      published = true
      docs[kind] = docs[kind].map((d) => (d.id === id ? { ...d, published_version_id: p.result.version_id } : d))
    }
  }
  if (mustPublish(kind) && !published) {
    // Core would refuse the assignment for it: stop before asking.
    docNotice.value = t('assignments.form.docNotPublished', { title })
    return { ok: false }
  }
  return { ok: true, id, created: true }
}

/** Documents written in this form and created, while the assignment itself is not saved yet. */
const createdTitles = ref<string[]>([])
/** Which of its documents saving has just created. */
type Made = { instructions?: boolean; rubric?: boolean }

/**
 * What saving says, once: the assignment, and the documents written for it
 * on the way (each one otherwise its own message, stacked over the page).
 */
function savedMessage(verb: 'created' | 'saved', made: Made): string {
  const which =
    made.instructions && made.rubric ? 'both' : made.instructions ? 'instructions' : made.rubric ? 'rubric' : 'plain'
  return t(`assignments.form.${verb}.${which}`)
}

/**
 * Says once how saving the assignment went. On a proposal it also names the
 * documents written here, which exist already whatever becomes of it.
 */
function announceSaved(out: WriteOutcome<unknown>, verb: 'created' | 'saved', made: Made) {
  if (out.status === 'proposed' && createdTitles.value.length) {
    const titles = createdTitles.value.map((x) => t('assignments.form.quoted', { title: x }))
    ElNotification({
      type: 'info',
      title: t('common.outcome.proposedTitle'),
      message: t('assignments.form.proposedWithDocs', { titles: formatList(titles) }, titles.length),
      duration: 8000,
    })
    return
  }
  announce(out, { success: savedMessage(verb, made) })
}

/**
 * The assignment was not saved, although documents written for it were
 * created: say so, since they are now chosen as existing ones and saving
 * again does not make them twice.
 */
function noteCreatedDocs() {
  if (!createdTitles.value.length || docNotice.value) return
  const titles = createdTitles.value.map((x) => t('assignments.form.quoted', { title: x }))
  docNotice.value = t('assignments.form.docsKept', { titles: formatList(titles) }, titles.length)
}

function sameDecimal(a: string, b: string | number): boolean {
  const x = Number(a)
  const y = Number(b)
  if (Number.isFinite(x) && Number.isFinite(y)) return x === y
  return a.trim() === String(b).trim()
}

async function create(made: Made, instructionsId?: string, rubricId?: string) {
  const out = await createAssignment.run(
    {
      course_id: props.courseId,
      title: form.title.trim(),
      points_possible: form.points.trim(),
      due_at: form.due ? dayjs(form.due).toISOString() : undefined,
      component_id: form.componentId || undefined,
      instructions_document_id: instructionsId,
      rubric_document_id: rubricId,
    },
    { notify: false },
  )
  if (!out) {
    if (createAssignment.lastError.value) notifyError(createAssignment.lastError.value)
    return noteCreatedDocs()
  }
  announceSaved(out, 'created', made)
  course.invalidate('assignments')
  visible.value = false
  emit('saved', out.status === 'executed' ? { status: 'executed', id: out.result.id } : { status: 'proposed' })
}

async function update(a: Assignment, made: Made, instructionsId?: string, rubricId?: string) {
  const args: ToolIn<'assignment.update'> = { course_id: props.courseId, assignment_id: a.id }
  let changed = false
  const title = form.title.trim()
  if (title !== a.title) {
    args.title = title
    changed = true
  }
  const points = form.points.trim()
  if (!sameDecimal(points, a.points_possible)) {
    args.points_possible = points
    if (askExisting.value && existing.value) args.existing_grades = existing.value
    changed = true
  }
  const oldDue = a.due_at ? dayjs(a.due_at).valueOf() : null
  const newDue = form.due ? dayjs(form.due).valueOf() : null
  if (newDue === null && oldDue !== null) {
    args.clear_due_at = true
    changed = true
  } else if (newDue !== null && newDue !== oldDue) {
    args.due_at = dayjs(form.due).toISOString()
    changed = true
  }
  if (form.componentId !== (a.component_id ?? '')) {
    if (form.componentId) args.component_id = form.componentId
    else args.clear_component = true
    changed = true
  }
  if (instructionsId && instructionsId !== a.instructions_document_id) {
    args.instructions_document_id = instructionsId
    changed = true
  }
  if (rubricId && rubricId !== a.rubric_document_id) {
    args.rubric_document_id = rubricId
    changed = true
  }
  if (!changed) {
    ElMessage.info(t('assignments.form.nothingChanged'))
    visible.value = false
    return
  }
  const out = await updateAssignment.run(args, { notify: false })
  if (!out) {
    const err = updateAssignment.lastError.value
    // Grades were entered that the form could not see: ask what becomes of them.
    if (err?.details?.reason === 'existing_grades_required') {
      coreAsked.value = true
      if (course.can('grade_read')) void loadGraded()
    }
    if (err) notifyError(err, undefined, { reasons: 'grades.pointsChange.refusal' })
    return noteCreatedDocs()
  }
  if (out.status === 'executed' && (out.result.rescaled || out.result.snapshots) && !out.replayed) {
    ElMessage({
      type: 'success',
      message: out.result.rescaled
        ? t('grades.pointsChange.done', { r: out.result.rescaled, s: out.result.snapshots })
        : t('grades.pointsChange.doneTotals', { s: out.result.snapshots }),
    })
  } else {
    announceSaved(out, 'saved', made)
  }
  course.invalidate('assignments')
  visible.value = false
  emit('saved', { status: out.status, id: a.id })
}

async function submit() {
  if (!formRef.value || busy.value || anyUploading.value) return
  // A chosen document that was not published may have been since (a
  // publication that waited for approval, say): look again before refusing it.
  if ((['instructions', 'rubric'] as DocKind[]).some((k) => mustPublish(k) && choiceUnpublished(k))) await loadDocs()
  const valid = await formRef.value.validate().catch(() => false)
  // What becomes of the grades is asked for before anything is sent.
  existingMissing.value = askExisting.value && !existing.value
  if (!valid || existingMissing.value) return
  busy.value = true
  docNotice.value = null
  createdTitles.value = []
  try {
    const instructions = await resolveDoc('instructions')
    if (!instructions.ok) return noteCreatedDocs()
    const rubric = await resolveDoc('rubric')
    if (!rubric.ok) return noteCreatedDocs()
    const made: Made = { instructions: instructions.created, rubric: rubric.created }
    if (props.assignment) await update(props.assignment, made, instructions.id, rubric.id)
    else await create(made, instructions.id, rubric.id)
  } finally {
    busy.value = false
  }
}

const defaultDocTitle = (kind: DocKind) =>
  form.title.trim()
    ? t(kind === 'instructions' ? 'assignments.form.doc.defaultInstructions' : 'assignments.form.doc.defaultRubric', {
        title: form.title.trim(),
      })
    : ''
/** Saving writes a new document first, which takes document_write as well. */
const writesDocument = computed(() => form.instructions.mode === 'new' || form.rubric.mode === 'new')
const saveNeedsApproval = computed(() =>
  course.needsApprovalAll([
    'assignment_write',
    ...(writesDocument.value ? (['document_write'] as const) : []),
    ...(askExisting.value ? (['grade_submit', 'grade_post'] as const) : []),
  ]),
)
const defaultTime = new Date(2000, 0, 1, 23, 59, 0)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="editing ? t('assignments.form.editTitle') : t('assignments.form.createTitle')"
    width="560px"
    top="6vh"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <el-alert v-if="docNotice" type="warning" :closable="false" show-icon class="assignment-form__alert">
      {{ docNotice }}
    </el-alert>
    <AppNote v-else-if="!editing" class="assignment-form__alert">{{ t('assignments.form.unpublishedNote') }}</AppNote>
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      :disabled="disabled || busy"
      @submit.prevent="submit"
    >
      <el-form-item :label="t('assignments.form.title')" prop="title">
        <el-input v-model="form.title" maxlength="300" :placeholder="t('assignments.form.titlePlaceholder')" />
      </el-form-item>

      <div class="assignment-form__row">
        <el-form-item :label="t('assignments.form.points')" prop="points" class="assignment-form__points">
          <el-input v-model="form.points" inputmode="decimal" placeholder="10" :disabled="pointsLocked" />
          <div v-if="pointsLocked" class="app-form-hint assignment-form__lock">
            <el-icon><Lock /></el-icon>{{ t('grades.pointsChange.locked') }}
          </div>
          <div v-else-if="editing" class="app-form-hint">{{ t('assignments.form.pointsHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('assignments.form.due')" prop="due" class="assignment-form__due">
          <el-date-picker
            v-model="form.due"
            type="datetime"
            format="YYYY-MM-DD HH:mm"
            :default-time="defaultTime"
            :placeholder="t('assignments.form.duePlaceholder')"
            clearable
          />
          <div class="app-form-hint">{{ t('assignments.form.dueHint') }}</div>
        </el-form-item>
      </div>

      <el-form-item
        v-if="askExisting && assignment"
        class="assignment-form__existing"
        :error="existingMissing ? t('grades.pointsChange.required') : ''"
      >
        <ExistingGradesChoice
          v-model="existing"
          :scores="graded"
          :from="assignment.points_possible"
          :to="form.points.trim()"
          :needs-approval="course.needsApprovalAll(['assignment_write', 'grade_submit', 'grade_post'])"
          :disabled="disabled || busy"
        />
      </el-form-item>

      <el-form-item :label="t('assignments.form.component')" prop="componentId">
        <el-select
          v-model="form.componentId"
          clearable
          :loading="scheme.loading.value"
          :disabled="!scheme.readable.value && !scheme.loading.value"
          :placeholder="t('assignments.form.componentNone')"
        >
          <el-option v-for="b in bucketOptions" :key="b.id" :value="b.id" :label="b.label" />
        </el-select>
        <div class="app-form-hint">
          <template v-if="!scheme.readable.value && !scheme.loading.value">
            {{ t('assignments.form.componentUnreadable') }}
          </template>
          <template v-else-if="!scheme.loading.value && !bucketOptions.length">
            {{ t('assignments.form.componentEmpty') }}
          </template>
          <template v-else>{{ t('assignments.form.componentHint') }}</template>
        </div>
      </el-form-item>

      <el-form-item :label="t('assignments.form.instructions')" prop="instructions">
        <DocChoiceField
          v-model="form.instructions"
          v-model:uploading="uploading.instructions"
          :course-id="courseId"
          kind="instructions"
          :options="docs.instructions"
          :loading="docsLoading"
          :list-error="docsError.instructions"
          :allow-none="!assignment?.instructions_document_id"
          :can-create="course.can('document_write')"
          :default-title="defaultDocTitle('instructions')"
          :require-published="mustPublish('instructions')"
          :disabled="disabled || busy"
        />
        <div v-if="publishedAssignment" class="app-form-hint">
          {{ t('assignments.form.doc.instructionsPublishedHint') }}
        </div>
      </el-form-item>

      <el-form-item :label="t('assignments.form.rubric')" prop="rubric">
        <DocChoiceField
          v-model="form.rubric"
          v-model:uploading="uploading.rubric"
          :course-id="courseId"
          kind="rubric"
          :options="docs.rubric"
          :loading="docsLoading"
          :list-error="docsError.rubric"
          :allow-none="!assignment?.rubric_document_id"
          :can-create="course.can('document_write')"
          :default-title="defaultDocTitle('rubric')"
          :disabled="disabled || busy"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="assignment-form__footer">
        <StatusTag v-if="saveNeedsApproval" vocab="level" value="confirm_required" size="small" />
        <span class="app-toolbar__spacer" />
        <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="busy" :disabled="disabled || anyUploading" @click="submit">
          {{ editing ? t('common.actions.save') : t('common.actions.create') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.assignment-form__alert {
  margin-bottom: 16px;
}
.assignment-form__row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.assignment-form__points {
  flex: 1 1 120px;
}
.assignment-form__due {
  flex: 2 1 220px;
}
.assignment-form__due :deep(.el-date-editor) {
  width: 100%;
}
.assignment-form__lock {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  color: var(--el-color-warning-dark-2);
}
.assignment-form__lock .el-icon {
  margin-top: 2px;
  flex-shrink: 0;
}
.assignment-form__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
