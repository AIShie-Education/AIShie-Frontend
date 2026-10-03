<script setup lang="ts">
// Adds a component under a parent (component.create) or edits one
// (component.update). Only what changed is sent on an edit. The rules Core
// refuses by are shown here before the person tries, where the grades read so
// far tell: a directly graded component that cannot go back, a former parent
// that cannot become directly graded. A change of the points of one graded
// already says what becomes of its grades (existing_grades), explained in the
// actual numbers.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import type { ToolIn } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { isDecimal } from '@/utils/format'
import ExistingGradesChoice from '@/views/course/grades/components/ExistingGradesChoice.vue'
import { compareDecimals } from '@/views/course/grades/components/grading'
import { enteredScores, type ExistingGrades } from '@/views/course/grades/components/pointsChange'
import {
  childBlock,
  clearFrozen,
  directBlocked,
  gradedOn,
  namedByCore,
  nodeName,
  pct,
  shareWith,
  type GradeFacts,
  type Scheme,
  type SchemeNode,
} from './schemeModel'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  mode: 'create' | 'edit'
  courseId: string
  scheme: Scheme
  /** create: the parent to put it under; edit: the component. */
  target: SchemeNode | null
  facts: GradeFacts | null
  needsApproval: boolean
}>()
const emit = defineEmits<{
  done: [status: 'executed' | 'proposed']
  /** Core refused by a rule: what the page knows may be out of date. */
  refused: []
}>()
const { t } = useI18n()
const course = useCourseStore()
/** A node's name as shown: the root still named by Core, in the reader's words. */
const nameOf = (n: SchemeNode) => nodeName(n, t('scheme.rootName'))

const create = useWrite('component.create')
const update = useWrite('component.update')
const pending = computed(() => create.pending.value || update.pending.value)

interface FormState {
  parentId: string
  name: string
  type: 'rolled' | 'direct'
  points: string
  weight: string
  dropLowest: number
  sortOrder: number
}
const form = reactive<FormState>({
  parentId: '',
  name: '',
  type: 'rolled',
  points: '',
  weight: '1',
  dropLowest: 0,
  sortOrder: 0,
})
const formRef = ref<FormInstance>()
const sortTouched = ref(false)

const editing = computed(() => (props.mode === 'edit' ? props.target : null))
const isRoot = computed(() => !!editing.value?.isRoot)
const wasDirect = computed(() => editing.value?.kind === 'direct')

/** Why a node cannot be the parent, or null. */
function blockText(n: SchemeNode): string | null {
  const b = childBlock(n)
  return b ? t(`scheme.reasons.${b}`, { name: nameOf(n) }) : null
}
/** Offered as a parent, but it may hold assignments the caller cannot see, and then Core refuses. */
function cautionText(n: SchemeNode): string | null {
  return n.kind === 'unseen' ? t('scheme.reasons.unseen', { name: nameOf(n) }) : null
}
const parentOptions = computed(() =>
  props.scheme.nodes.map((n) => {
    const block = blockText(n)
    return { node: n, disabled: !!block, why: block ?? cautionText(n) ?? '' }
  }),
)

const parent = computed<SchemeNode | null>(() => {
  if (props.mode === 'create') return props.scheme.byId.get(form.parentId) ?? null
  const p = editing.value?.parentId
  return p ? (props.scheme.byId.get(p) ?? null) : null
})
const parentCaution = computed(() => (props.mode === 'create' && parent.value ? cautionText(parent.value) : null))

function nextSortOrder(p: SchemeNode | null): number {
  if (!p || !p.children.length) return 1
  return Math.max(...p.children.map((c) => c.c.sort_order)) + 1
}

watch(visible, (open) => {
  if (!open) return
  sortTouched.value = false
  if (props.mode === 'create') {
    const preferred = props.target && !childBlock(props.target) ? props.target : null
    const first = preferred ?? props.scheme.nodes.find((n) => !childBlock(n)) ?? null
    Object.assign(form, {
      parentId: first?.id ?? '',
      name: '',
      type: 'rolled',
      points: '',
      weight: '1',
      dropLowest: 0,
      sortOrder: nextSortOrder(first),
    })
  } else if (props.target) {
    const c = props.target.c
    Object.assign(form, {
      parentId: props.target.parentId ?? '',
      name: c.name,
      type: props.target.kind === 'direct' ? 'direct' : 'rolled',
      points: c.points_possible === null || c.points_possible === undefined ? '' : String(c.points_possible),
      weight: String(c.weight),
      dropLowest: c.drop_lowest,
      sortOrder: c.sort_order,
    })
  }
  existing.value = ''
  coreAsked.value = false
  formRef.value?.clearValidate()
  void loadGraded()
})

watch(
  () => form.parentId,
  () => {
    if (props.mode === 'create' && !sortTouched.value) form.sortOrder = nextSortOrder(parent.value)
  },
)

// Which way of grading can be chosen, and why not.
const typeChoosable = computed(() => {
  if (props.mode === 'create') return true
  const n = editing.value
  return !!n && !n.isRoot && (n.kind === 'direct' || n.kind === 'empty' || n.kind === 'unseen')
})
/** Graded directly is offered on an 'unseen' leaf, but Core refuses it if the leaf holds assignments. */
const directCaution = computed(() => editing.value?.kind === 'unseen' && form.type === 'direct')
const rolledBlocked = computed(() => !!editing.value && clearFrozen(editing.value, props.facts))
const directBlockedNow = computed(() => !!editing.value && directBlocked(editing.value, props.facts))
// --- What becomes of grades already entered when the points change -------------
/** The live entered scores on it, where the caller may read them; null while not known. */
const graded = ref<string[] | null>(null)
/** Core said grades have been entered (existing_grades_required) where the page could not see them. */
const coreAsked = ref(false)
const existing = ref<ExistingGrades | ''>('')
let gradedFor = 0
async function loadGraded() {
  const n = ++gradedFor
  graded.value = null
  const node = editing.value
  if (!node || !wasDirect.value || !course.can('grade_read')) return
  try {
    const scores = await enteredScores(props.courseId, { componentId: node.id })
    if (n === gradedFor) graded.value = scores
  } catch {
    /* not readable: the page's facts, or Core when saving, say whether there are grades */
  }
}
const oldPoints = computed(() => {
  const p = editing.value?.c.points_possible
  return p === null || p === undefined ? null : p
})
const pointsChanged = computed(
  () =>
    !!editing.value &&
    wasDirect.value &&
    form.type === 'direct' &&
    oldPoints.value !== null &&
    isDecimal(form.points) &&
    compareDecimals(form.points.trim(), oldPoints.value) !== 0,
)
const hasGrades = computed(
  () => (graded.value?.length ?? 0) > 0 || coreAsked.value || (!!editing.value && gradedOn(editing.value, props.facts)),
)
/** Changing the points of graded work changes its grades too, which takes grading and posting as well. */
const pointsLocked = computed(
  () =>
    !!editing.value &&
    wasDirect.value &&
    form.type === 'direct' &&
    hasGrades.value &&
    !course.canAll(['grade_submit', 'grade_post']),
)
const askExisting = computed(() => pointsChanged.value && hasGrades.value && !pointsLocked.value)
/** Saving was pressed without saying what becomes of the grades. */
const existingMissing = ref(false)
watch([() => form.points, existing], () => (existingMissing.value = false))
// Found locked after the dialog opened: show what the points are, not what was typed.
watch(pointsLocked, (locked) => {
  if (locked && oldPoints.value !== null) form.points = String(oldPoints.value)
})
watch(rolledBlocked, (blocked) => {
  if (blocked && wasDirect.value) form.type = 'direct'
})
watch(directBlockedNow, (blocked) => {
  if (blocked && !wasDirect.value) form.type = 'rolled'
})

const rolledNote = computed(() => {
  const n = editing.value
  if (!n || typeChoosable.value || n.isRoot) return null
  return n.kind === 'group' ? t('scheme.form.rolledGroup') : n.kind === 'bucket' ? t('scheme.form.rolledBucket') : null
})

const showWeight = computed(() => !isRoot.value)
const showDrop = computed(() => form.type === 'rolled')

const sharePreview = computed(() => {
  const p = parent.value
  if (!p || !showWeight.value || !isDecimal(form.weight)) return null
  const share = shareWith(p.children, editing.value?.id ?? null, Number(form.weight))
  return share === null
    ? t('scheme.form.shareNone')
    : t('scheme.form.sharePreview', { share: pct(share), parent: nameOf(p) })
})

function decimalRule(required: () => boolean) {
  return {
    required: required(),
    validator: (_: unknown, v: string, cb: (e?: Error) => void) => {
      if (!required()) return cb()
      const s = (v ?? '').trim()
      if (!s) return cb(new Error(t('common.errors.required')))
      if (!isDecimal(s)) return cb(new Error(t('common.errors.invalidDecimal')))
      if (Number(s) < 0) return cb(new Error(t('scheme.form.negative')))
      cb()
    },
    trigger: 'blur',
  }
}
const rules = computed<FormRules>(() => ({
  parentId: [
    {
      required: props.mode === 'create',
      validator: (_: unknown, v: string, cb: (e?: Error) => void) => {
        if (props.mode !== 'create') return cb()
        // The assignments may have been read after it was chosen.
        const p = props.scheme.byId.get(v)
        if (!p) return cb(new Error(t('common.errors.required')))
        const block = blockText(p)
        cb(block ? new Error(block) : undefined)
      },
      trigger: 'change',
    },
  ],
  name: [
    {
      required: true,
      validator: (_: unknown, v: string, cb: (e?: Error) => void) =>
        (v ?? '').trim() ? cb() : cb(new Error(t('common.errors.required'))),
      trigger: 'blur',
    },
  ],
  weight: [decimalRule(() => showWeight.value)],
  points: [decimalRule(() => form.type === 'direct' && !pointsLocked.value)],
}))

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  // What becomes of the grades is asked for before anything is sent.
  existingMissing.value = askExisting.value && !existing.value
  if (!ok || existingMissing.value) return
  const out = props.mode === 'create' ? await submitCreate() : await submitUpdate()
  if (out === 'unchanged') {
    ElMessage({ type: 'info', message: t('scheme.form.nothingChanged') })
    visible.value = false
    return
  }
  if (!out) {
    const err = props.mode === 'create' ? create.lastError.value : update.lastError.value
    // Grades were entered that the page could not see: ask what becomes of them.
    if (err?.details?.reason === 'existing_grades_required') {
      coreAsked.value = true
      void loadGraded()
    }
    if (err && (err.code === 'failed_precondition' || err.code === 'conflict')) emit('refused')
    return
  }
  visible.value = false
  emit('done', out)
}

async function submitCreate(): Promise<'executed' | 'proposed' | null> {
  const direct = form.type === 'direct'
  const args: ToolIn<'component.create'> = {
    course_id: props.courseId,
    parent_id: form.parentId,
    name: form.name.trim(),
    weight: form.weight.trim(),
    sort_order: form.sortOrder,
    drop_lowest: direct ? undefined : form.dropLowest,
    points_possible: direct ? form.points.trim() : undefined,
  }
  const out = await create.run(args, { success: t('scheme.outcome.created') })
  return out?.status ?? null
}

async function submitUpdate(): Promise<'executed' | 'proposed' | 'unchanged' | null> {
  const n = editing.value
  if (!n) return null
  const c = n.c
  const args: ToolIn<'component.update'> = { course_id: props.courseId, component_id: n.id }
  let changed = false
  const name = form.name.trim()
  if (name !== c.name) {
    args.name = name
    changed = true
  }
  if (showWeight.value && Number(form.weight) !== Number(c.weight)) {
    args.weight = form.weight.trim()
    changed = true
  }
  if (showDrop.value && form.dropLowest !== c.drop_lowest) {
    args.drop_lowest = form.dropLowest
    changed = true
  }
  if (!n.isRoot && form.sortOrder !== c.sort_order) {
    args.sort_order = form.sortOrder
    changed = true
  }
  if (wasDirect.value && form.type === 'rolled') {
    args.clear_points_possible = true
    changed = true
  } else if (form.type === 'direct' && !pointsLocked.value) {
    if (!wasDirect.value || Number(form.points) !== Number(c.points_possible)) {
      args.points_possible = form.points.trim()
      if (askExisting.value && existing.value) args.existing_grades = existing.value
      changed = true
    }
  }
  if (!changed) return 'unchanged'
  const out = await update.run(args, { success: false, reasons: 'grades.pointsChange.refusal' })
  if (out?.status === 'executed' && !out.replayed) {
    const { rescaled, snapshots } = out.result
    ElMessage({
      type: 'success',
      message: rescaled
        ? t('scheme.outcome.updatedRescaled', { r: rescaled, n: snapshots })
        : snapshots
          ? t('scheme.outcome.updatedTotals', { n: snapshots })
          : t('scheme.outcome.updated'),
    })
  }
  return out?.status ?? null
}

const title = computed(() =>
  props.mode === 'create'
    ? t('scheme.form.createTitle')
    : t('scheme.form.editTitle', { name: props.target ? nameOf(props.target) : '' }),
)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
    append-to-body
  >
    <el-alert
      v-if="needsApproval"
      type="warning"
      :closable="false"
      show-icon
      :title="t('scheme.form.needsApproval')"
      class="cd-alert"
    />
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      :validate-on-rule-change="false"
      label-position="top"
      :disabled="pending"
      @submit.prevent="submit"
    >
      <el-form-item v-if="mode === 'create'" :label="t('scheme.form.parent')" prop="parentId">
        <el-select v-model="form.parentId" filterable :placeholder="t('common.actions.select')">
          <el-option
            v-for="o in parentOptions"
            :key="o.node.id"
            :value="o.node.id"
            :label="nameOf(o.node)"
            :disabled="o.disabled"
            class="cd-item"
          >
            <div class="cd-option" :style="{ paddingLeft: `${o.node.depth * 14}px` }">
              <span class="cd-option__name">{{ nameOf(o.node) }}</span>
              <span v-if="o.why" class="cd-option__why">{{ o.why }}</span>
            </div>
          </el-option>
        </el-select>
        <div v-if="parentCaution" class="app-form-hint cd-caution">
          <el-icon><Warning /></el-icon>{{ parentCaution }}
        </div>
      </el-form-item>

      <el-form-item :label="t('scheme.form.name')" prop="name">
        <el-input v-model="form.name" :placeholder="t('scheme.form.namePlaceholder')" maxlength="200" />
        <div v-if="editing && namedByCore(editing)" class="app-form-hint">
          {{ t('scheme.form.rootNameHint', { shown: t('scheme.rootName') }) }}
        </div>
      </el-form-item>

      <el-form-item v-if="typeChoosable" :label="t('scheme.form.type')">
        <el-radio-group v-model="form.type" class="cd-type">
          <el-radio value="rolled" :disabled="rolledBlocked" class="cd-type__option">
            <span class="cd-type__label">{{ t('scheme.form.typeRolled') }}</span>
            <span class="cd-type__help">{{ t('scheme.form.typeRolledHelp') }}</span>
          </el-radio>
          <el-radio value="direct" :disabled="directBlockedNow" class="cd-type__option">
            <span class="cd-type__label">{{ t('scheme.form.typeDirect') }}</span>
            <span class="cd-type__help">{{ t('scheme.form.typeDirectHelp') }}</span>
          </el-radio>
        </el-radio-group>
        <div v-if="rolledBlocked" class="app-form-hint cd-lock">
          <el-icon><Lock /></el-icon>{{ t('scheme.form.clearFrozen') }}
        </div>
        <div v-if="directBlockedNow" class="app-form-hint cd-lock">
          <el-icon><Lock /></el-icon>{{ t('scheme.form.directBlocked') }}
        </div>
        <div v-if="directCaution" class="app-form-hint cd-caution">
          <el-icon><Warning /></el-icon>{{ t('scheme.form.directUnseen') }}
        </div>
      </el-form-item>
      <p v-else-if="isRoot" class="app-form-hint cd-note">{{ t('scheme.form.rootNote') }}</p>
      <p v-else-if="rolledNote" class="app-form-hint cd-note">{{ rolledNote }}</p>

      <el-form-item v-if="form.type === 'direct'" :label="t('scheme.form.points')" prop="points">
        <el-input v-model="form.points" inputmode="decimal" :disabled="pointsLocked" class="cd-short" />
        <div v-if="pointsLocked" class="app-form-hint cd-lock">
          <el-icon><Lock /></el-icon>{{ t('grades.pointsChange.locked') }}
        </div>
      </el-form-item>

      <el-form-item
        v-if="askExisting && oldPoints !== null"
        :error="existingMissing ? t('grades.pointsChange.required') : ''"
      >
        <ExistingGradesChoice
          v-model="existing"
          :scores="graded"
          :from="oldPoints"
          :to="form.points.trim()"
          :needs-approval="course.needsApprovalAll(['assignment_write', 'grade_submit', 'grade_post'])"
          :disabled="pending"
        />
      </el-form-item>

      <el-form-item v-if="showWeight" :label="t('scheme.form.weight')" prop="weight">
        <el-input v-model="form.weight" inputmode="decimal" class="cd-short" />
        <div class="app-form-hint cd-hint">
          {{ t('scheme.form.weightHelp') }}
          <strong v-if="sharePreview" class="cd-preview">{{ sharePreview }}</strong>
        </div>
      </el-form-item>

      <div v-if="showDrop || !isRoot" class="cd-row">
        <el-form-item v-if="showDrop" :label="t('scheme.form.dropLowest')" class="cd-row__item">
          <el-input-number v-model="form.dropLowest" :min="0" :max="1000" :step="1" :precision="0" step-strictly />
          <div class="app-form-hint cd-hint">{{ t('scheme.form.dropLowestHelp') }}</div>
        </el-form-item>
        <el-form-item v-if="!isRoot" :label="t('scheme.form.sortOrder')" class="cd-row__item">
          <el-input-number
            v-model="form.sortOrder"
            :min="-100000"
            :max="100000"
            :step="1"
            :precision="0"
            step-strictly
            @change="sortTouched = true"
          />
          <div class="app-form-hint cd-hint">{{ t('scheme.form.sortOrderHelp') }}</div>
        </el-form-item>
      </div>

      <el-alert
        v-if="mode === 'edit' && !askExisting"
        type="info"
        :closable="false"
        :title="t('scheme.form.notRewritten')"
        class="cd-alert cd-alert--bottom"
      />
    </el-form>
    <template #footer>
      <el-button :disabled="pending" @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">
        {{ mode === 'create' ? t('common.actions.create') : t('common.actions.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.cd-item {
  height: auto;
  min-height: 34px;
  line-height: 1.3;
}
.cd-alert {
  margin-bottom: 16px;
}
.cd-alert--bottom {
  margin: 16px 0 0;
}
.cd-option {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  padding-top: 4px;
  padding-bottom: 4px;
}
.cd-option__why {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  white-space: normal;
}
.cd-type {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.cd-type__option {
  height: auto;
  margin-right: 0;
  align-items: flex-start;
  white-space: normal;
}
.cd-type__option :deep(.el-radio__label) {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}
.cd-type__option :deep(.el-radio__input) {
  margin-top: 3px;
}
.cd-type__label {
  font-weight: 500;
}
.cd-type__help {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  font-weight: 400;
}
.cd-lock {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-warning);
}
.cd-caution {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.cd-caution .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--el-color-warning);
}
.cd-note {
  margin: -4px 0 16px;
}
.cd-short {
  max-width: 180px;
}
.cd-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}
.cd-row__item {
  flex: 1 1 200px;
  min-width: 0;
}
.cd-hint {
  flex-basis: 100%;
}
.cd-preview {
  display: block;
  margin-top: 2px;
  color: var(--el-text-color-regular);
  font-weight: 500;
}
</style>
