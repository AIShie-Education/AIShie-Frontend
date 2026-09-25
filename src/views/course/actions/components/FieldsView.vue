<script setup lang="ts">
// The fields of a payload or a result, each shown for what it is: a score as
// a score, feedback as text, a breakdown as a table, a member by name, an id
// as a link to what it names. Fields nobody has told this about are shown as
// they are.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import { formatDecimal, formatPercent, isUuid } from '@/utils/format'
import IdText from '@/components/IdText.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import MaybeLink from './MaybeLink.vue'
import { fieldLabel, isObject, routeFor } from './actionText'
import { useLookup, useSpecs } from './lookups'

const props = defineProps<{ courseId: string; value: unknown; exclude?: string[] }>()
const { t } = useI18n()
const course = useCourseStore()
const specs = useSpecs()
onMounted(() => void course.ensureAssignments())

const ORDER = [
  'decision',
  'outcome',
  'score',
  'allow_extra',
  'title',
  'name',
  'kind',
  'state',
  'student_member_id',
  'submission_id',
  'assignment_id',
  'component_id',
  'grade_id',
  'grade_ids',
  'document_id',
  'actor_id',
  'member_id',
  'action_id',
  'preset',
  'preset_id',
  'role',
  'perms',
  'student_scope',
  'listed_students',
  'assignment_scope',
  'listed_assignments',
  'expires_at',
  'due_at',
  'points_possible',
  'weight',
  'drop_lowest',
  'reason',
  'note',
  'feedback',
  'breakdown',
  'feedback_files',
  'body',
  'body_md',
  'description',
  'files',
]
const DECIMALS = new Set(['score', 'out_of', 'points_possible', 'weight'])
const TEXT = new Set(['feedback', 'body', 'body_md', 'description'])
const MEMBERS = new Set(['student_member_id', 'member_id', 'decided_by_member_id', 'reviewed_by_member_id'])
const TIMES = new Set(['due_at', 'expires_at', 'submitted_at', 'posted_at', 'created_at'])
const COMPONENTS = new Set(['component_id', 'parent_id', 'new_parent_id'])
const REVIEW_STATES = new Set(['none', 'pending', 'reviewed', 'escalated'])

const obj = computed<Record<string, unknown>>(() => (isObject(props.value) ? props.value : {}))
const fields = computed(() => {
  const skip = new Set(['course_id', ...(props.exclude ?? [])])
  // The score is shown with what it is out of.
  if (obj.value.score !== undefined && obj.value.out_of !== undefined) skip.add('out_of')
  const keys = Object.keys(obj.value).filter((k) => !skip.has(k) && obj.value[k] !== null && obj.value[k] !== undefined)
  return keys.sort((a, b) => {
    const ia = ORDER.indexOf(a)
    const ib = ORDER.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    return a.localeCompare(b)
  })
})

const comps = useLookup(() =>
  Object.keys(obj.value).some((k) => COMPONENTS.has(k)) ? specs.components(props.courseId) : null,
)
function componentName(id: unknown): string | undefined {
  return (comps.value?.value as { id: string; name: string }[] | undefined)?.find((c) => c.id === id)?.name
}

function kindOf(k: string, v: unknown): string {
  if (k === 'breakdown' && Array.isArray(v)) return 'breakdown'
  if (k === 'perms' && isObject(v)) return 'perms'
  if (k === 'feedback_files' && Array.isArray(v)) return 'feedbackFiles'
  if (k === 'listed_students' && Array.isArray(v)) return 'memberList'
  if (k === 'listed_assignments' && Array.isArray(v)) return 'assignmentList'
  if (DECIMALS.has(k) && (typeof v === 'number' || typeof v === 'string')) return 'decimal'
  if (TEXT.has(k) && typeof v === 'string') return 'markdown'
  if (MEMBERS.has(k) && typeof v === 'string') return 'member'
  if (TIMES.has(k) && typeof v === 'string') return 'time'
  if (k === 'assignment_id' && typeof v === 'string') return 'assignment'
  if (COMPONENTS.has(k) && typeof v === 'string') return 'component'
  if (k === 'decision' && typeof v === 'string') return 'decision'
  if (k === 'review_state' && typeof v === 'string') return 'reviewState'
  if (k === 'outcome' && typeof v === 'string') return REVIEW_STATES.has(v) ? 'reviewState' : 'actionStatus'
  if (k === 'state' && typeof v === 'string') return 'state'
  if (k === 'kind' && typeof v === 'string') return 'documentKind'
  if (k === 'role' && typeof v === 'string') return 'role'
  if ((k === 'student_scope' || k === 'assignment_scope') && typeof v === 'string') return 'scope'
  if (k === 'upload_token') return 'file'
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'string' && isUuid(v)) return 'id'
  if (Array.isArray(v) && v.every((x) => typeof x === 'string' && isUuid(x))) return 'idList'
  if (typeof v === 'string' || typeof v === 'number') return 'text'
  return 'json'
}

interface BreakdownRow {
  criterion?: string
  points?: number | string
  max?: number | string
  comment?: string | null
}
function breakdown(v: unknown): BreakdownRow[] {
  return Array.isArray(v) ? (v as BreakdownRow[]) : []
}
function breakdownTotal(v: unknown) {
  const rows = breakdown(v)
  const sum = (k: 'points' | 'max') => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
  return { points: sum('points'), max: sum('max') }
}
function perms(v: unknown): [string, string][] {
  return isObject(v) ? (Object.entries(v) as [string, string][]) : []
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}
function files(v: unknown): { title?: string }[] {
  return Array.isArray(v) ? (v as { title?: string }[]) : []
}
function json(v: unknown) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
</script>

<template>
  <dl v-if="fields.length" class="fields-view">
    <div v-for="k in fields" :key="k" class="fields-view__row" :class="`fields-view__row--${kindOf(k, obj[k])}`">
      <dt class="fields-view__label">{{ fieldLabel(k) }}</dt>
      <dd class="fields-view__value">
        <template v-if="kindOf(k, obj[k]) === 'decimal'">
          <span class="fields-view__score">
            {{ formatDecimal(obj[k] as number | string) }}
            <template v-if="k === 'score' && obj.out_of !== undefined && obj.out_of !== null">
              / {{ formatDecimal(obj.out_of as number | string) }}
              <span class="fields-view__muted">({{ formatPercent(obj.score as number | string, obj.out_of as number | string) }})</span>
            </template>
          </span>
        </template>
        <div v-else-if="kindOf(k, obj[k]) === 'markdown'" class="fields-view__text">
          <MarkdownView :source="obj[k] as string" />
        </div>
        <template v-else-if="kindOf(k, obj[k]) === 'breakdown'">
          <el-table :data="breakdown(obj[k])" size="small" class="fields-view__table" :border="false">
            <el-table-column :label="t('actions.fields.breakdown')" min-width="140">
              <template #default="{ row }">
                <div class="fields-view__criterion">{{ row.criterion }}</div>
                <div v-if="row.comment" class="fields-view__muted">{{ row.comment }}</div>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.labels.points')" width="110" align="right">
              <template #default="{ row }">
                <span class="fields-view__num">{{ formatDecimal(row.points) }} / {{ formatDecimal(row.max) }}</span>
              </template>
            </el-table-column>
          </el-table>
          <div class="fields-view__total fields-view__muted">
            {{ t('actions.fields.total') }} {{ formatDecimal(breakdownTotal(obj[k]).points) }} / {{ formatDecimal(breakdownTotal(obj[k]).max) }}
          </div>
        </template>
        <div v-else-if="kindOf(k, obj[k]) === 'perms'" class="fields-view__perms">
          <span v-for="[perm, level] in perms(obj[k])" :key="perm" class="fields-view__perm">
            <span>{{ t(`enums.perm.${perm}`) }}</span>
            <StatusTag vocab="level" :value="level" />
          </span>
        </div>
        <ul v-else-if="kindOf(k, obj[k]) === 'feedbackFiles'" class="fields-view__list">
          <li v-for="(f, i) in files(obj[k])" :key="i">
            <el-icon><Paperclip /></el-icon> {{ f.title }}
          </li>
        </ul>
        <span v-else-if="kindOf(k, obj[k]) === 'memberList'" class="fields-view__inline">
          <span v-if="!strings(obj[k]).length" class="fields-view__muted">{{ t('common.labels.none') }}</span>
          <MemberName v-for="id in strings(obj[k])" :key="id" :id="id" />
        </span>
        <span v-else-if="kindOf(k, obj[k]) === 'assignmentList'" class="fields-view__inline">
          <span v-if="!strings(obj[k]).length" class="fields-view__muted">{{ t('common.labels.none') }}</span>
          <MaybeLink v-for="id in strings(obj[k])" :key="id" :to="routeFor(courseId, 'assignment', id)">
            {{ course.assignmentTitle(id) ?? id.slice(0, 8) }}
          </MaybeLink>
        </span>
        <MaybeLink v-else-if="kindOf(k, obj[k]) === 'member'" :to="course.can('member_read') ? routeFor(courseId, 'member_id', obj[k] as string) : null">
          <MemberName :id="obj[k] as string" />
        </MaybeLink>
        <TimeText v-else-if="kindOf(k, obj[k]) === 'time'" :value="obj[k] as string" />
        <span v-else-if="kindOf(k, obj[k]) === 'assignment'" class="fields-view__inline">
          <MaybeLink :to="routeFor(courseId, 'assignment', obj[k] as string)">
            {{ course.assignmentTitle(obj[k] as string) ?? '' }}
          </MaybeLink>
          <IdText :id="obj[k] as string" />
        </span>
        <span v-else-if="kindOf(k, obj[k]) === 'component'" class="fields-view__inline">
          <MaybeLink :to="routeFor(courseId, 'component_id', obj[k] as string)">{{ componentName(obj[k]) ?? '' }}</MaybeLink>
          <IdText :id="obj[k] as string" />
        </span>
        <el-tag
          v-else-if="kindOf(k, obj[k]) === 'decision'"
          size="small"
          :type="obj[k] === 'approve' ? 'success' : 'danger'"
        >
          {{ obj[k] === 'approve' ? t('actions.decision.approveVerb') : obj[k] === 'reject' ? t('actions.decision.rejectVerb') : obj[k] }}
        </el-tag>
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'reviewState'" vocab="reviewState" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'actionStatus'" vocab="actionStatus" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'state'" vocab="submissionState" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'documentKind'" vocab="documentKind" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'role'" vocab="role" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'scope'" vocab="scope" :value="obj[k] as string" />
        <span v-else-if="kindOf(k, obj[k]) === 'file'" class="fields-view__inline">
          <el-icon><Paperclip /></el-icon>{{ t('common.labels.yes') }}
        </span>
        <span v-else-if="kindOf(k, obj[k]) === 'bool'">
          {{ obj[k] ? t('common.labels.yes') : t('common.labels.no') }}
        </span>
        <MaybeLink v-else-if="kindOf(k, obj[k]) === 'id'" :to="routeFor(courseId, k, obj[k] as string)">
          <IdText :id="obj[k] as string" />
        </MaybeLink>
        <span v-else-if="kindOf(k, obj[k]) === 'idList'" class="fields-view__inline">
          <span v-if="!strings(obj[k]).length" class="fields-view__muted">{{ t('common.labels.none') }}</span>
          <IdText v-for="id in strings(obj[k])" :key="id" :id="id" />
        </span>
        <span v-else-if="kindOf(k, obj[k]) === 'text'" class="fields-view__plain">{{ obj[k] }}</span>
        <code v-else class="fields-view__json">{{ json(obj[k]) }}</code>
      </dd>
    </div>
  </dl>
  <p v-else class="fields-view__muted">{{ t('common.labels.none') }}</p>
</template>

<style scoped>
.fields-view {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.fields-view__row {
  display: grid;
  grid-template-columns: minmax(96px, 30%) minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  align-items: baseline;
}
.fields-view__row:last-child {
  border-bottom: none;
}
.fields-view__label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.fields-view__value {
  margin: 0;
  min-width: 0;
  font-size: 14px;
  word-break: break-word;
}
.fields-view__score {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fields-view__muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: normal;
}
.fields-view__text {
  max-height: 360px;
  overflow: auto;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
}
.fields-view__text :deep(.markdown-body) {
  font-size: 14px;
}
.fields-view__table {
  width: 100%;
  max-width: 560px;
}
.fields-view__criterion {
  font-weight: 500;
}
.fields-view__num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.fields-view__total {
  max-width: 560px;
  text-align: right;
  padding: 4px 12px 0;
}
.fields-view__perms {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fields-view__perm {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.fields-view__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.fields-view__list li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.fields-view__inline {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.fields-view__plain {
  white-space: pre-wrap;
}
.fields-view__json {
  font-family: var(--app-font-mono);
  font-size: 12px;
  word-break: break-all;
}
@media (max-width: 600px) {
  .fields-view__row {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
