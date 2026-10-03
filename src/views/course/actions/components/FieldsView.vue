<script setup lang="ts">
// The fields of a payload or a result, each shown for what it is: a score as
// a score (exactly as sent), feedback as text, a breakdown as a table, a
// member by name, a preset by name, a version by its number, an id as a link
// to what it names. Fields nobody has told this about are shown as they are.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { componentLabel } from '@/views/course/scheme/components/schemeModel'
import { PERMS, type Perm } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { formatDecimal, formatPercent, isUuid, shortId } from '@/utils/format'
import { presetLabel } from '@/views/course/members/components/seat'
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import IdText from '@/components/IdText.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import MaybeLink from './MaybeLink.vue'
import VersionRef from './VersionRef.vue'
import {
  decisionTag,
  exactDecimal,
  fieldLabel,
  isObject,
  payloadOf,
  presetOf,
  routeFor,
  str,
  typeLabel,
  type ActionRow,
} from './actionText'
import { useLookup, useSpecs } from './lookups'

const props = defineProps<{
  courseId: string
  value: unknown
  exclude?: string[]
  /** The action this is the payload of, where it is one: some fields mean more in its light. */
  action?: ActionRow
  /** The action this is the result of, where it is one: the seat it made is named as its proposal named it. */
  resultOf?: ActionRow
}>()
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
  'display_name',
  'agent_display_name',
  'owner_display_name',
  'conversation_id',
  'respondent_member_id',
  'in_reply_to_message_id',
  'message_id',
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
const MEMBERS = new Set([
  'student_member_id',
  'member_id',
  'decided_by_member_id',
  'reviewed_by_member_id',
  'respondent_member_id',
  'opener_member_id',
  'author_member_id',
  'principal_member_id',
])
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
  const c = (comps.value?.value as { id: string; name: string; parent_id?: string | null }[] | undefined)?.find(
    (x) => x.id === id,
  )
  return c ? componentLabel(c, t('scheme.rootName')) : undefined
}

const presets = useLookup(() => (obj.value.preset_id || obj.value.preset ? specs.presets(props.courseId) : null))
const preset = computed(() => presetOf(presets.value?.value, obj.value))
const actionType = computed(() => props.action?.action_type)
/** A proposal to publish a version, still to be decided: how it stands against what is read now matters. */
const checkVersion = computed(() => actionType.value === 'document.publish' && props.action?.status === 'proposed')

/**
 * The agent a member.add_delegate seated (its result's member_id), by the
 * name Core wrote into its proposal (agent_display_name), where the member
 * list cannot name it: a student's own agent, which the action's target names
 * the same.
 */
function seatedAgent(k: string): { name: string } | undefined {
  const a = props.resultOf
  if (k !== 'member_id' || a?.action_type !== 'member.add_delegate') return undefined
  const name = str(payloadOf(a).agent_display_name)
  return name ? { name } : undefined
}

function label(k: string): string {
  // member.add's permissions are changes laid over the preset, not the seat's whole grant.
  if (k === 'perms' && actionType.value === 'member.add') return t('actions.fields.permOverrides')
  // member.add_delegate's proposal carries the whole seat Core worked out, not changes.
  if (k === 'perms' && actionType.value === 'member.add_delegate') return t('actions.fields.permsSeat')
  if (k === 'role' && actionType.value === 'member.update_perms_bulk') return t('actions.fields.bulkRole')
  return fieldLabel(k)
}

function kindOf(k: string, v: unknown): string {
  if (k === 'breakdown' && Array.isArray(v)) return 'breakdown'
  if (k === 'perms' && isObject(v)) return 'perms'
  if (k === 'feedback_files' && Array.isArray(v)) return 'feedbackFiles'
  // A version's files, as a proposal keeps them: by name, never their upload tokens.
  if (k === 'files' && Array.isArray(v) && v.every((f) => isObject(f) && ('upload_token' in f || 'filename' in f)))
    return 'versionFiles'
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
  if (k === 'exclude_types' && Array.isArray(v)) return 'typeList'
  if ((k === 'preset_id' || k === 'preset') && typeof v === 'string') return 'preset'
  if (k === 'version_id' && typeof v === 'string' && typeof obj.value.document_id === 'string') return 'version'
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
  // A sum of binary fractions carries noise past the digits anyone typed.
  return { points: formatDecimal(sum('points'), 6), max: formatDecimal(sum('max'), 6) }
}
function perms(v: unknown): [string, string][] {
  if (!isObject(v)) return []
  // In the order permissions are always listed (Core's JSON has none); unknown ones last.
  const at = (k: string) => {
    const i = PERMS.indexOf(k as Perm)
    return i < 0 ? PERMS.length : i
  }
  return (Object.entries(v) as [string, string][]).sort((a, b) => at(a[0]) - at(b[0]))
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}
function files(v: unknown): { title?: string; filename?: string }[] {
  return Array.isArray(v) ? (v as { title?: string; filename?: string }[]) : []
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
      <dt class="fields-view__label">{{ label(k) }}</dt>
      <dd class="fields-view__value">
        <template v-if="kindOf(k, obj[k]) === 'decimal'">
          <span class="fields-view__score">
            {{ exactDecimal(obj[k] as number | string) }}
            <template v-if="k === 'score' && obj.out_of !== undefined && obj.out_of !== null">
              / {{ exactDecimal(obj.out_of as number | string) }}
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
                <span class="fields-view__num">{{ exactDecimal(row.points) }} / {{ exactDecimal(row.max) }}</span>
              </template>
            </el-table-column>
          </el-table>
          <div class="fields-view__total fields-view__muted">
            {{ t('actions.fields.total') }} {{ breakdownTotal(obj[k]).points }} / {{ breakdownTotal(obj[k]).max }}
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
            <span v-if="f.filename && f.filename !== f.title" class="fields-view__muted">({{ f.filename }})</span>
          </li>
        </ul>
        <ol v-else-if="kindOf(k, obj[k]) === 'versionFiles'" class="fields-view__list fields-view__files">
          <li v-for="(f, i) in files(obj[k])" :key="i">
            <el-icon><Paperclip /></el-icon> {{ f.filename || t('common.fileKind.other') }}
          </li>
        </ol>
        <span v-else-if="kindOf(k, obj[k]) === 'typeList'" class="fields-view__inline">
          <span v-for="x in strings(obj[k])" :key="x">{{ typeLabel(x) }}</span>
        </span>
        <span v-else-if="kindOf(k, obj[k]) === 'memberList'" class="fields-view__inline">
          <span v-if="!strings(obj[k]).length" class="fields-view__muted">{{ t('common.labels.none') }}</span>
          <MemberName v-for="id in strings(obj[k])" :key="id" :id="id" />
        </span>
        <span v-else-if="kindOf(k, obj[k]) === 'assignmentList'" class="fields-view__inline">
          <span v-if="!strings(obj[k]).length" class="fields-view__muted">{{ t('common.labels.none') }}</span>
          <MaybeLink v-for="id in strings(obj[k])" :key="id" :to="routeFor(courseId, 'assignment', id)">
            {{ course.assignmentTitle(id) ?? shortId(id) }}
          </MaybeLink>
        </span>
        <MaybeLink v-else-if="kindOf(k, obj[k]) === 'member'" :to="course.can('member_read') ? routeFor(courseId, 'member_id', obj[k] as string) : null">
          <MemberName :id="obj[k] as string" :agent="seatedAgent(k)" />
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
        <AppTag v-else-if="kindOf(k, obj[k]) === 'decision'" :tone="toneOf(decisionTag(obj[k]).type)">
          {{ decisionTag(obj[k]).label }}
        </AppTag>
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'reviewState'" vocab="reviewState" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'actionStatus'" vocab="actionStatus" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'state'" vocab="submissionState" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'documentKind'" vocab="documentKind" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'role'" vocab="role" :value="obj[k] as string" />
        <StatusTag v-else-if="kindOf(k, obj[k]) === 'scope'" vocab="scope" :value="obj[k] as string" />
        <span v-else-if="kindOf(k, obj[k]) === 'preset'" class="fields-view__inline">
          <template v-if="preset">
            <strong>{{ presetLabel(preset) }}</strong>
            <StatusTag v-if="preset.name !== preset.role" vocab="role" :value="preset.role" />
          </template>
          <span v-else-if="k === 'preset'">{{ obj[k] }}</span>
          <IdText v-if="k === 'preset_id'" :id="obj[k] as string" />
        </span>
        <VersionRef
          v-else-if="kindOf(k, obj[k]) === 'version'"
          :course-id="courseId"
          :document-id="str(obj.document_id)"
          :version-id="obj[k] as string"
          :check="checkVersion"
          explain
        />
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
  border-radius: var(--app-radius-control);
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
