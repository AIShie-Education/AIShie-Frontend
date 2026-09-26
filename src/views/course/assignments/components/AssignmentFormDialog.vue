<script setup lang="ts">
// Creating an assignment, or changing one (assignment.create / .update). Its
// instructions and rubric can be chosen from the course's documents or
// written here: a new one is created (document.create) and, if asked,
// published (document.publish) before the assignment is saved.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { ElMessage, type FormInstance, type FormItemRule } from 'element-plus'
import type { ToolIn } from '@/api/http'
import type { Assignment, DocumentSummary } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { isDecimal } from '@/utils/format'
import DocChoiceField from './DocChoiceField.vue'
import { allDocuments, useScheme } from './useAssignmentData'
import { emptyDocChoice, type DocChoice } from './types'

type DocKind = 'instructions' | 'rubric'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{ courseId: string; assignment?: Assignment | null }>()
const emit = defineEmits<{ saved: [result: { status: 'executed' | 'proposed'; id?: string }] }>()

const { t, locale } = useI18n()
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
  formRef.value?.clearValidate()
  void loadDocs()
  void scheme.reload()
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
      upload_token: c.files[0]?.uploadToken,
    },
    { success: false },
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
 * The assignment was not saved, although documents written for it were
 * created: say so, since they are now chosen as existing ones and saving
 * again does not make them twice.
 */
function noteCreatedDocs() {
  if (!createdTitles.value.length || docNotice.value) return
  const titles = createdTitles.value.map((x) => t('assignments.form.quoted', { title: x }))
  docNotice.value = t('assignments.form.docsKept', { titles: listFormat(titles) }, titles.length)
}
function listFormat(items: string[]): string {
  try {
    return new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(items)
  } catch {
    return items.join(', ')
  }
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
    { success: savedMessage('created', made) },
  )
  if (!out) return noteCreatedDocs()
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
  const out = await updateAssignment.run(args, { success: savedMessage('saved', made) })
  if (!out) return noteCreatedDocs()
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
  if (!valid) return
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
  course.needsApprovalAll(writesDocument.value ? ['assignment_write', 'document_write'] : ['assignment_write']),
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
    <el-alert
      v-else-if="!editing"
      type="info"
      :closable="false"
      show-icon
      class="assignment-form__alert"
      :title="t('assignments.form.unpublishedNote')"
    />
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
          <el-input v-model="form.points" inputmode="decimal" placeholder="10" />
          <div v-if="editing" class="app-form-hint">{{ t('assignments.form.pointsHint') }}</div>
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
        <el-tag v-if="saveNeedsApproval" type="warning" size="small" disable-transitions>
          {{ t('enums.level.confirm_required') }}
        </el-tag>
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
.assignment-form__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
