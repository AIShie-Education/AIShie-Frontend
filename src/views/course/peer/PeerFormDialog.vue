<script setup lang="ts">
// Setting up or changing a group assignment's peer evaluation
// (peer_form.set), for whoever writes assignments: what members do (split
// 100 points among each other, or rate each other on criteria on a scale),
// whether they evaluate themselves too, when it opens (for each group once
// it hands its work in, or at a set time) and closes, how much it counts in
// each member's grade (0: for reference only), and whether a student sees
// their own average once it closes. What each reader sees is said under it.
//
// The change is made over the version read: one made elsewhere meanwhile
// (version_mismatch) has the page read the form again, and the dialog keeps
// what was typed over it, saying so. Once an evaluation has been written,
// what is evaluated (kind, criteria, scale, self-evaluation) no longer
// changes, and its controls are off; the dates, weight and sharing still do.
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import { ApiError } from '@/api/http'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatPct, timeZoneName } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import StatusTag from '@/components/StatusTag.vue'
import {
  MAX_CRITERIA,
  MAX_DESCRIPTION,
  MAX_LABEL,
  SCALE_MAX,
  blankCriterion,
  draftFrom,
  formProblems,
  newDraft,
  setArgs,
  shapeChanged,
  whoSees,
  type CriterionDraft,
  type FormField,
  type PeerFormDraft,
} from './peerForm'
import { peerScore, type PeerFormView } from './peer'

const props = defineProps<{
  courseId: string
  assignmentId: string
  /** The assignment's due date, which a new form's closing time follows. */
  dueAt?: string | null
  /** The form as read; null for none yet. */
  form: PeerFormView | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{
  saved: [outcome: { status: 'executed' | 'proposed' }]
  /** The form changed elsewhere since it was read: read it again. */
  stale: []
}>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()

const starters = (): CriterionDraft[] =>
  (['contribution', 'teamwork', 'reliability'] as const).map((k) => ({
    key: k,
    label: t(`peer.form.starters.${k}`),
    description: '',
    weight: '',
  }))

const draft = reactive<PeerFormDraft>(newDraft({ starters: [] }))
/** Problems are shown once saving has been tried. */
const tried = ref(false)
/** The form was changed elsewhere and read again: what is typed here is kept over it. */
const readAgain = ref(false)

function fill() {
  const d = props.form ? draftFrom(props.form, starters()) : newDraft({ dueAt: props.dueAt, starters: starters() })
  Object.assign(draft, d)
  tried.value = false
  readAgain.value = false
}
watch(visible, (open) => open && fill(), { immediate: true })

const editing = computed(() => !!props.form)
const inUse = computed(() => !!props.form?.in_use)
const problems = computed(() => formProblems(draft))
function problemOf(field: FormField, index?: number): string {
  if (!tried.value) return ''
  const p = problems.value.find((x) => x.field === field && (index === undefined || x.index === index))
  return p
    ? t(`peer.form.problem.${p.key}`, { max: field === 'description' ? MAX_DESCRIPTION : MAX_LABEL, n: MAX_CRITERIA })
    : ''
}
const criteriaProblem = computed(() => problemOf('criteria'))

// --- Dates, as the date pickers take them -------------------------------------------
function dateModel(key: 'opensAt' | 'closesAt') {
  return computed<Date | null>({
    get: () => (draft[key] ? new Date(draft[key]) : null),
    set: (v) => (draft[key] = v ? dayjs(v).toISOString() : ''),
  })
}
const opensAt = dateModel('opensAt')
const closesAt = dateModel('closesAt')
const defaultTime = new Date(2000, 0, 1, 23, 59, 0)
const zone = computed(() => (ui.locale, timeZoneName(draft.closesAt || new Date().toISOString())))
const closesPast = computed(() => !!draft.closesAt && dayjs(draft.closesAt).isBefore(dayjs()))

// --- Criteria ----------------------------------------------------------------------------
function addCriterion() {
  if (draft.criteria.length < MAX_CRITERIA) draft.criteria.push(blankCriterion())
}
function removeCriterion(i: number) {
  draft.criteria.splice(i, 1)
}
const scaleMaxOptions = computed(() =>
  Array.from({ length: SCALE_MAX - draft.scaleMin }, (_, i) => draft.scaleMin + 1 + i),
)
watch(
  () => draft.scaleMin,
  (min) => {
    if (draft.scaleMax <= min) draft.scaleMax = min + 1
  },
)

// --- The weight, explained with figures ------------------------------------------------
const example = computed(() => {
  const w = draft.weight
  const g = 80
  return (
    ui.locale,
    t('peer.form.weightExample', {
      weight: formatPct(w / 100, 0),
      group: g,
      more: formatPct(1.2, 0),
      less: formatPct(0.8, 0),
      high: formatDecimal(peerScore(g, w, 1.2, 100)),
      low: formatDecimal(peerScore(g, w, 0.8, 100)),
    })
  )
})

const sees = computed(() => whoSees(draft))

// --- Saving -------------------------------------------------------------------------------
const setW = useWrite('peer_form.set')
const needsApproval = computed(() => course.needsApproval('assignment_write'))
const shapeLocked = computed(() => inUse.value && !!props.form && shapeChanged(props.form, draft))

async function save() {
  tried.value = true
  if (problems.value.length || shapeLocked.value) return
  const args = setArgs(props.courseId, props.assignmentId, draft, props.form?.version ?? 0)
  const out = await setW.run(args, {
    success: t('peer.form.saved'),
    reasons: 'peer.refusal',
  })
  if (out) {
    visible.value = false
    emit('saved', { status: out.status })
    return
  }
  const e = setW.lastError.value
  if (e instanceof ApiError && (e.details?.reason === 'version_mismatch' || e.details?.reason === 'form_in_use')) {
    readAgain.value = e.details?.reason === 'version_mismatch'
    emit('stale')
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="editing ? t('peer.form.titleEdit') : t('peer.form.titleNew')"
    width="560px"
    top="6vh"
    destroy-on-close
    :close-on-click-modal="false"
    class="peer-form"
  >
    <el-alert v-if="readAgain" type="warning" :closable="false" show-icon class="peer-form__alert">
      {{ t('peer.form.changedElsewhere') }}
    </el-alert>
    <AppNote v-if="!editing" class="peer-form__alert">{{ t('peer.form.intro') }}</AppNote>

    <el-form label-position="top" :disabled="!course.writable || setW.pending.value" @submit.prevent="save">
      <el-form-item v-if="editing">
        <el-switch v-model="draft.enabled" :active-text="t('peer.form.enabled')" />
        <div class="app-form-hint">{{ t('peer.form.enabledHint') }}</div>
      </el-form-item>

      <AppNote v-if="inUse" class="peer-form__alert">{{ t('peer.form.inUse') }}</AppNote>

      <el-form-item :label="t('peer.form.kind')">
        <el-radio-group v-model="draft.kind" :disabled="inUse" class="peer-form__kinds">
          <el-radio value="share" class="peer-form__kind">
            <span class="peer-form__kind-name">{{ t('peer.kind.share') }}</span>
            <span class="peer-form__kind-hint">{{ t('peer.kind.shareHint') }}</span>
          </el-radio>
          <el-radio value="rating" class="peer-form__kind">
            <span class="peer-form__kind-name">{{ t('peer.kind.rating') }}</span>
            <span class="peer-form__kind-hint">{{ t('peer.kind.ratingHint') }}</span>
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <template v-if="draft.kind === 'rating'">
        <el-form-item :label="t('peer.form.criteria')" :error="criteriaProblem">
          <ol class="peer-form__criteria">
            <li v-for="(c, i) in draft.criteria" :key="i" class="peer-form__criterion">
              <div class="peer-form__criterion-head">
                <span class="peer-form__criterion-n">{{ t('peer.form.criterionN', { n: i + 1 }) }}</span>
                <el-button
                  link
                  :disabled="inUse || draft.criteria.length <= 1"
                  :aria-label="t('peer.form.removeCriterion', { n: i + 1 })"
                  @click="removeCriterion(i)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
              <el-form-item :error="problemOf('label', i)" class="peer-form__nested">
                <el-input
                  v-model="c.label"
                  :maxlength="MAX_LABEL"
                  :disabled="inUse"
                  :aria-label="t('peer.form.criterionLabel', { n: i + 1 })"
                  :placeholder="t('peer.form.criterionPlaceholder')"
                />
              </el-form-item>
              <div class="peer-form__criterion-more">
                <el-form-item :error="problemOf('description', i)" class="peer-form__nested peer-form__describe">
                  <el-input
                    v-model="c.description"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 4 }"
                    :maxlength="MAX_DESCRIPTION"
                    :disabled="inUse"
                    :aria-label="t('peer.form.criterionDescription', { n: i + 1 })"
                    :placeholder="t('peer.form.descriptionPlaceholder')"
                  />
                </el-form-item>
                <el-form-item :error="problemOf('criterionWeight', i)" class="peer-form__nested peer-form__cweight">
                  <el-input
                    v-model="c.weight"
                    inputmode="decimal"
                    :disabled="inUse"
                    placeholder="1"
                    :aria-label="t('peer.form.criterionWeight', { n: i + 1 })"
                  >
                    <template #prepend>{{ t('peer.form.weightShort') }}</template>
                  </el-input>
                </el-form-item>
              </div>
            </li>
          </ol>
          <div class="peer-form__criteria-foot">
            <el-button :disabled="inUse || draft.criteria.length >= MAX_CRITERIA" @click="addCriterion">
              <el-icon><Plus /></el-icon>
              <span>{{ t('peer.form.addCriterion') }}</span>
            </el-button>
            <span class="app-form-hint">{{ t('peer.form.criterionWeightHint') }}</span>
          </div>
        </el-form-item>

        <el-form-item :label="t('peer.form.scale')" :error="problemOf('scale')">
          <div class="peer-form__scale">
            <el-select v-model="draft.scaleMin" :disabled="inUse" :aria-label="t('peer.form.scaleFrom')">
              <el-option v-for="n in [0, 1]" :key="n" :value="n" :label="String(n)" />
            </el-select>
            <span class="app-muted">{{ t('peer.form.scaleTo') }}</span>
            <el-select v-model="draft.scaleMax" :disabled="inUse" :aria-label="t('peer.form.scaleToLabel')">
              <el-option v-for="n in scaleMaxOptions" :key="n" :value="n" :label="String(n)" />
            </el-select>
          </div>
          <div class="app-form-hint">{{ t('peer.form.scaleHint') }}</div>
        </el-form-item>
      </template>

      <el-form-item>
        <el-checkbox v-model="draft.selfEvaluation" :disabled="inUse">{{ t('peer.form.self') }}</el-checkbox>
        <div class="app-form-hint">{{ t('peer.form.selfHint') }}</div>
      </el-form-item>

      <el-form-item :label="t('peer.form.opens')">
        <el-radio-group v-model="draft.opens" class="peer-form__opens">
          <el-radio value="on_hand_in">{{ t('peer.form.opensOnHandIn') }}</el-radio>
          <el-radio value="at">{{ t('peer.form.opensAt') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <div class="peer-form__dates">
        <el-form-item v-if="draft.opens === 'at'" :label="t('peer.form.opensAtLabel')" :error="problemOf('opensAt')">
          <el-date-picker v-model="opensAt" type="datetime" format="YYYY-MM-DD HH:mm" :default-time="defaultTime" />
        </el-form-item>
        <el-form-item :label="t('peer.form.closesAt')" :error="problemOf('closesAt')">
          <el-date-picker v-model="closesAt" type="datetime" format="YYYY-MM-DD HH:mm" :default-time="defaultTime" />
        </el-form-item>
      </div>
      <div class="app-form-hint peer-form__zone">{{ t('peer.form.timeHint', { zone }) }}</div>
      <el-alert v-if="closesPast" type="warning" :closable="false" show-icon class="peer-form__alert">
        {{ t('peer.form.closesPast') }}
      </el-alert>

      <el-form-item :label="t('peer.form.weight')" :error="problemOf('weight')">
        <div class="peer-form__weight">
          <el-input-number
            v-model="draft.weight"
            :min="0"
            :max="100"
            :step="5"
            :precision="0"
            controls-position="right"
            :aria-label="t('peer.form.weight')"
          />
          <span class="peer-form__weight-pct">{{
            draft.weight > 0
              ? t('peer.summary.weightCounts', { pct: formatPct(draft.weight / 100, 0) })
              : t('peer.summary.weightReference')
          }}</span>
        </div>
        <div class="app-form-hint">{{ t('peer.form.weightHint') }}</div>
        <div v-if="draft.weight > 0" class="app-form-hint">{{ example }}</div>
      </el-form-item>

      <el-form-item>
        <el-checkbox
          :model-value="draft.shareWithStudents === 'own_average'"
          @update:model-value="(v: unknown) => (draft.shareWithStudents = v ? 'own_average' : 'none')"
        >
          {{ t('peer.form.share') }}
        </el-checkbox>
        <div class="app-form-hint">{{ t('peer.form.shareHint') }}</div>
      </el-form-item>
    </el-form>

    <AppNote :title="t('peer.sees.title')" class="peer-form__sees">
      <ul class="peer-form__sees-list">
        <li v-for="s in sees.staff" :key="s">{{ t(`peer.sees.${s}`) }}</li>
        <li v-for="s in sees.students" :key="s">{{ t(`peer.sees.${s}`) }}</li>
      </ul>
    </AppNote>

    <el-alert v-if="tried && shapeLocked" type="warning" :closable="false" show-icon class="peer-form__alert">
      {{ t('peer.refusal.form_in_use') }}
    </el-alert>

    <template #footer>
      <div class="peer-form__footer">
        <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
        <span class="app-toolbar__spacer" />
        <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="setW.pending.value" :disabled="!course.writable" @click="save">
          {{ t('common.actions.save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.peer-form__alert {
  margin-bottom: 16px;
}
.peer-form__kinds {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.peer-form__kind {
  height: auto;
  margin-right: 0;
  align-items: flex-start;
  white-space: normal;
}
.peer-form__kind :deep(.el-radio__input) {
  margin-top: 3px;
}
.peer-form__kind :deep(.el-radio__label) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.peer-form__kind-name {
  font-weight: var(--app-weight-strong);
  color: var(--app-ink);
}
.peer-form__kind-hint {
  color: var(--app-ink-2);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-ui);
}
.peer-form__criteria {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
}
.peer-form__criterion {
  padding: 8px 0 4px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.peer-form__criterion:first-child {
  border-top: 0;
  padding-top: 0;
}
.peer-form__criterion-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.peer-form__criterion-n {
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
}
.peer-form__nested {
  margin-bottom: 8px;
}
.peer-form__criterion-more {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.peer-form__describe {
  flex: 3 1 240px;
}
.peer-form__cweight {
  flex: 1 1 120px;
}
.peer-form__criteria-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.peer-form__criteria-foot .app-form-hint {
  margin-top: 0;
}
.peer-form__scale {
  display: flex;
  align-items: center;
  gap: 8px;
}
.peer-form__scale .el-select {
  width: 88px;
}
.peer-form__opens {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.peer-form__dates {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.peer-form__dates > .el-form-item {
  flex: 1 1 220px;
  margin-bottom: 4px;
}
.peer-form__dates :deep(.el-date-editor) {
  width: 100%;
}
.peer-form__zone {
  margin: 0 0 16px;
}
.peer-form__weight {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.peer-form__weight-pct {
  color: var(--app-ink-2);
  font-size: var(--app-text-sm);
}
.peer-form__sees-list {
  margin: 0;
  padding-left: 1.25em;
}
.peer-form__sees-list li + li {
  margin-top: 4px;
}
.peer-form__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
