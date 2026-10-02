<script setup lang="ts">
// One event of the course feed: what happened (its type, in words), when,
// what it is about with a link to it where there is a view for it, whose it
// is (the student and the assignment it belongs to), and the few small facts
// its payload carries. Events carry ids, never content: a document's title or
// a grade's score is fetched by the view the link opens, which decides
// whether the caller may see it. An event of the action log says who acted,
// under its title: who proposed or did the action it is about, then who
// decided or reviewed it (actors.ts reads them from the action; an agent
// with its avatar and "AI").
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { typeLabel } from '@/views/course/actions/components/actionText'
import { CORE_ROOT_NAME } from '@/views/course/scheme/components/schemeModel'
import { actionWho, ensureActionWho } from './actors'
import { componentName, documentTitle, ensureComponentNames, ensureDocumentTitles } from './names'
import {
  CATEGORY_ICON,
  categoryOf,
  isTotalEvent,
  payloadBool,
  payloadField,
  payloadNumber,
  payloadString,
  reachOf,
  subjectKind,
  subjectRoute,
  type CourseEvent,
} from './feed'

const props = defineProps<{
  event: CourseEvent
  courseId: string
  /** Fewer details, for a short list. */
  compact?: boolean
  /** Arrived since the list was opened. */
  fresh?: boolean
}>()
const { t, te } = useI18n()
const course = useCourseStore()

const category = computed(() => categoryOf(props.event.type))
const icon = computed(() => CATEGORY_ICON[category.value])

/** A key under a map whose own keys may contain dots (enums.event['grade.posted']). */
function mapKey(prefix: string, key: string): string {
  return `${prefix}['${key.replace(/[^a-zA-Z0-9_.-]/g, '')}']`
}
function label(prefix: string, key: string | undefined): string | undefined {
  if (!key) return undefined
  const k = mapKey(prefix, key)
  return te(k) ? t(k) : key
}

const title = computed(() => label('enums.event', props.event.type) ?? props.event.type)
const kind = computed(() => subjectKind(props.event))
const reach = computed(() => reachOf(course))
const subjectTo = computed(() => subjectRoute(props.event, props.courseId, reach.value))

/**
 * An assignment the caller's assignment list, once read, leaves out: one
 * unpublished since, for a student, whose feed still holds its publication
 * (and its unpublication). Its page would say it does not exist, so it is
 * named without a link. While the list is not read, the link stays.
 */
function unknownAssignment(id: string | null | undefined): boolean {
  return !!id && course.assignmentsState === 'loaded' && !course.assignments.has(id)
}
const subjectLink = computed(() =>
  kind.value === 'assignment' && unknownAssignment(props.event.subject_id) ? null : subjectTo.value,
)

/** The grading component the event names: its subject, or the total's component. */
const componentId = computed(() =>
  kind.value === 'component' ? props.event.subject_id : payloadString(props.event, 'component_id'),
)
/** What the action log's events say of who acted: the verb for its maker, and for whoever decided or reviewed it. */
const WHO: Record<string, { by: 'proposed' | 'did'; then?: 'approved' | 'rejected' | 'reviewed' | 'escalated' }> = {
  'action.proposed': { by: 'proposed' },
  'action.approved': { by: 'proposed', then: 'approved' },
  'action.rejected': { by: 'proposed', then: 'rejected' },
  'action.cancelled': { by: 'proposed' },
  'action.reviewed': { by: 'did', then: 'reviewed' },
  'action.escalated': { by: 'did', then: 'escalated' },
}
const whoWords = computed(() => (props.compact || kind.value !== 'action' ? undefined : WHO[props.event.type]))
const who = computed(() => {
  const words = whoWords.value
  const w = words ? actionWho(props.courseId, props.event.subject_id) : undefined
  if (!words || !w) return []
  const out: { id: string; key: string }[] = []
  if (w.by) out.push({ id: w.by, key: `activity.who.${words.by}` })
  const then = words.then === 'reviewed' || words.then === 'escalated' ? w.reviewedBy : w.decidedBy
  if (words.then && then) out.push({ id: then, key: `activity.who.${words.then}` })
  return out
})

onMounted(() => {
  if (kind.value === 'material') void ensureDocumentTitles(props.courseId)
  if (componentId.value) void ensureComponentNames(props.courseId)
  if (whoWords.value) ensureActionWho(props.courseId, props.event.subject_id, !!whoWords.value.then)
})
const component = computed(() => componentName(componentId.value))

const kindLabel = computed(() => {
  const k = payloadString(props.event, 'kind')
  return k && te(`enums.documentKind.${k}`) ? t(`enums.documentKind.${k}`) : undefined
})

const assignmentTitle = computed(() => course.assignmentTitle(props.event.assignment_id))
const assignmentTo = computed<RouteLocationRaw | null>(() =>
  props.event.assignment_id && !unknownAssignment(props.event.assignment_id)
    ? { name: 'course-assignment', params: { courseId: props.courseId, assignmentId: props.event.assignment_id } }
    : null,
)

/** The words for the subject, when it is not a person (a person is shown by name). */
const subjectText = computed(() => {
  const e = props.event
  switch (kind.value) {
    case 'assignment':
      return course.assignmentTitle(e.subject_id) ?? t('activity.subject.assignment')
    case 'submission':
      return t('activity.subject.submission')
    case 'gradebook':
      return t('activity.subject.gradebook')
    case 'grade':
      if (isTotalEvent(e.type)) {
        const c = component.value
        if (!c) return t('activity.subject.total')
        return c.root ? t('activity.subject.courseTotal') : t('activity.subject.componentTotal', { name: c.name })
      }
      return t('activity.subject.grade')
    case 'material':
      return documentTitle(e.subject_id) ?? kindLabel.value ?? t('activity.subject.document')
    case 'submissionFile':
      return t('activity.subject.submissionFile')
    case 'feedbackFile':
      return t('activity.subject.feedbackFile')
    case 'action': {
      const type = payloadString(e, 'action_type')
      return type ? typeLabel(type) : t('activity.subject.action')
    }
    case 'component': {
      const c = component.value
      if (!c) return t('activity.subject.component')
      // The root, still under the name Core gave it, in the reader's words.
      return c.root && c.name === CORE_ROOT_NAME ? t('activity.subject.courseTotal') : c.name
    }
    case 'course':
      return ''
  }
  return e.subject_type
})

// The assignment is shown on its own only when it is not the subject itself.
const showAssignment = computed(() => !!props.event.assignment_id && kind.value !== 'assignment')
// Likewise the student, when the subject is not that member.
const showStudent = computed(
  () =>
    !!props.event.student_member_id &&
    !(kind.value === 'member' && props.event.subject_id === props.event.student_member_id),
)

type Fact =
  | { kind: 'tag'; vocab: 'actionStatus' | 'role' | 'submissionState'; value: string }
  | { kind: 'text'; text: string; tone?: 'danger' | 'warning' | 'success' | 'info'; tip?: string }
  | { kind: 'link'; text: string; to: RouteLocationRaw; id: string }

// Core's error codes (apperr), by the words common.errors has for them.
const ERROR_KEYS: Record<string, string> = {
  invalid_argument: 'common.errors.invalid',
  unauthenticated: 'common.errors.unauthenticated',
  forbidden: 'common.errors.forbiddenAction',
  not_found: 'common.errors.notFound',
  conflict: 'common.errors.conflict',
  idempotency_conflict: 'common.errors.idempotency',
  failed_precondition: 'common.errors.precondition',
  rate_limited: 'common.errors.rateLimited',
  internal: 'common.errors.internal',
}
function errorText(code: string): string {
  const key = ERROR_KEYS[code]
  return key ? t(key) : code
}

/** What the action named by an action event's by_action_id is, by event type. */
const BY_ACTION: Record<string, 'byDecision' | 'byReview' | 'byCancel'> = {
  'action.approved': 'byDecision',
  'action.rejected': 'byDecision',
  'action.reviewed': 'byReview',
  'action.escalated': 'byReview',
  'action.cancelled': 'byCancel',
}

/** A document, or a submitted or feedback file, renamed or moved in its list (document.update). */
const RENAMED = /^(document\.updated|submission\.file_updated|grade\.feedback_updated)/

// What the payload says, by event type. Payloads were read off Core's emit
// sites; anything not recognised here is simply not shown.
const facts = computed<Fact[]>(() => {
  const e = props.event
  const out: Fact[] = []
  const type = e.type
  if (type.startsWith('action.')) {
    const outcome = payloadString(e, 'outcome')
    if (type === 'action.approved' && outcome) out.push({ kind: 'tag', vocab: 'actionStatus', value: outcome })
    const error = payloadString(e, 'error')
    if (error) out.push({ kind: 'text', text: errorText(error), tone: 'danger' })
    const reason = payloadString(e, 'reason')
    // The owner of the agent that made it decided, reviewed or took it back,
    // as their own doing (by_owner).
    const byOwner = payloadBool(e, 'by_owner') === true
    if (reason === 'withdrawn' && byOwner)
      out.push({ kind: 'text', text: t('activity.fact.withdrawnByOwner'), tone: 'info' })
    else if (reason) out.push({ kind: 'text', text: label('activity.cancelReason', reason) ?? reason, tone: 'info' })
    if (byOwner && BY_ACTION[type] === 'byDecision')
      out.push({ kind: 'text', text: t('activity.fact.decidedByOwner'), tone: 'success' })
    if (byOwner && BY_ACTION[type] === 'byReview')
      out.push({ kind: 'text', text: t('activity.fact.reviewedByOwner'), tone: 'success' })
    const target = payloadString(e, 'target_type')
    if (type === 'action.proposed' && target) {
      out.push({
        kind: 'text',
        text: t('activity.fact.onTarget', { target: label('activity.target', target) ?? target }),
      })
    }
    // The action this event records (the decision or review, with its
    // reason or note; or what cancelled a proposal). It is someone else's,
    // so only a seat that reads the action log can open it.
    const by = payloadString(e, 'by_action_id')
    const byKey = BY_ACTION[type]
    if (by && byKey && reach.value.decides && !props.compact) {
      out.push({
        kind: 'link',
        text: t(`activity.fact.${byKey}`),
        id: by,
        to: { name: 'course-action', params: { courseId: props.courseId, actionId: by } },
      })
    }
  }
  if (type === 'assignment.updated' && payloadBool(e, 'due_at_changed')) {
    out.push({ kind: 'text', text: t('activity.fact.dueChanged'), tone: 'warning' })
  }
  if (type === 'assignment.updated' && payloadBool(e, 'component_changed')) {
    out.push({ kind: 'text', text: t('activity.fact.componentChanged'), tone: 'warning' })
  }
  // What the work is worth changed after grades were entered for it, and what
  // became of them (existing_grades, and how many were written again).
  if ((type === 'assignment.updated' || type === 'component.updated') && payloadBool(e, 'points_changed')) {
    out.push({ kind: 'text', text: t('activity.fact.pointsChanged'), tone: 'warning' })
    const how = payloadString(e, 'existing_grades')
    if (how === 'rescale') {
      out.push({
        kind: 'text',
        text: t('activity.fact.existingGrades.rescale', { n: payloadNumber(e, 'rescaled') ?? 0 }),
      })
    } else if (how === 'keep_scores') {
      out.push({ kind: 'text', text: t('activity.fact.existingGrades.keep_scores') })
    }
  }
  if (type === 'member.role_changed') {
    const from = payloadString(e, 'from')
    const to = payloadString(e, 'to')
    if (from && to) {
      out.push({
        kind: 'text',
        text: t('activity.fact.roleChanged', { from: label('enums.role', from), to: label('enums.role', to) }),
      })
    }
  }
  if (type === 'member.password_reset') {
    const n = payloadNumber(e, 'sessions_ended')
    if (n !== undefined) out.push({ kind: 'text', text: t('activity.fact.sessionsEnded', { n }, n), tone: 'info' })
  }
  if (type === 'course.updated') {
    const fields = payloadField(e, 'fields')
    for (const f of Array.isArray(fields) ? fields : []) {
      if (f === 'title' || f === 'description') out.push({ kind: 'text', text: t(`activity.fact.courseFields.${f}`) })
    }
  }
  // A document, or a file of a submission or a grade, renamed or moved in its list.
  if (RENAMED.test(type)) {
    if (payloadBool(e, 'title_changed')) out.push({ kind: 'text', text: t('activity.fact.renamed') })
    if (payloadBool(e, 'sort_order_changed')) out.push({ kind: 'text', text: t('activity.fact.reordered') })
  }
  if (type.startsWith('document.purged')) {
    const n = payloadNumber(e, 'versions') ?? 0
    out.push(
      payloadString(e, 'version_id')
        ? { kind: 'text', text: t('activity.fact.purgedVersion'), tone: 'danger' }
        : { kind: 'text', text: t('activity.fact.purgedWhole', { n }, n), tone: 'danger' },
    )
  }
  // A grade written again in a new number of points (existing_grades rescale).
  if ((type === 'grade.regraded' || type === 'grade.created') && payloadBool(e, 'rescaled')) {
    out.push({ kind: 'text', text: t('activity.fact.rescaled'), tone: 'info' })
  }
  if (type.startsWith('document.')) {
    // Named by its title where known; its kind then goes beside it.
    if (kind.value === 'material' && kindLabel.value && documentTitle(e.subject_id)) {
      out.push({ kind: 'text', text: kindLabel.value })
    }
    const seq = payloadNumber(e, 'seq')
    if (seq !== undefined) out.push({ kind: 'text', text: t('activity.fact.version', { n: seq }) })
    // A new version: how many files it holds (none: it is text alone).
    if (type.startsWith('document.version_added')) {
      const n = payloadNumber(e, 'files')
      if (n !== undefined) {
        out.push({ kind: 'text', text: n ? t('activity.fact.versionFiles', { n }, n) : t('activity.fact.textOnly') })
      }
    }
    // Filed under its unreleased name because no published assignment used
    // the document then. It keeps that name, so only members who see
    // unpublished assignments are shown this entry. Who reads the document
    // once an assignment using it is published depends on its kind.
    if (type.endsWith('_unreleased')) {
      const k = type === 'document.rubric_published_unreleased' ? 'rubric' : payloadString(e, 'kind')
      const tip =
        k === 'rubric'
          ? t('activity.fact.unreleasedTip.rubric')
          : k === 'instructions'
            ? t('activity.fact.unreleasedTip.instructions')
            : t('activity.fact.unreleasedTip.other')
      out.push({ kind: 'text', text: t('activity.fact.unreleased'), tone: 'info', tip })
    }
  }
  if (type === 'member.added') {
    const role = payloadString(e, 'role')
    if (role) out.push({ kind: 'tag', vocab: 'role', value: role })
    // A person who took their seat through an invite link.
    if (payloadString(e, 'via') === 'join_link') out.push({ kind: 'text', text: t('join.via') })
  }
  if (type === 'member.removed') {
    const reason = payloadString(e, 'reason')
    if (reason) out.push({ kind: 'text', text: label('activity.removeReason', reason) ?? reason, tone: 'info' })
  }
  if (type === 'submission.submitted' || type === 'submission.lateness_changed') {
    const state = payloadString(e, 'state')
    if (state) out.push({ kind: 'tag', vocab: 'submissionState', value: state })
    const attempt = payloadNumber(e, 'attempt')
    if (attempt !== undefined) out.push({ kind: 'text', text: t('activity.fact.attempt', { n: attempt }) })
  }
  // A message that carries files: how many, and their names on hover (never a key or a URL).
  if (type === 'conversation.message_posted') {
    const files = payloadField(e, 'attachments')
    if (Array.isArray(files) && files.length) {
      const names = files
        .map((f) => (f && typeof f === 'object' ? (f as { filename?: unknown }).filename : undefined))
        .filter((n): n is string => typeof n === 'string' && !!n)
      out.push({
        kind: 'text',
        text: t('activity.fact.files', { n: files.length }, files.length),
        tone: 'info',
        tip: names.length ? names.join(', ') : undefined,
      })
    }
  }
  if (type === 'grade.regraded') {
    // The grade it replaces is superseded now, and a superseded grade is
    // for those who grade (grade_submit or grade_post) to read.
    const old = payloadString(e, 'replaces')
    if (old && (course.can('grade_submit') || course.can('grade_post'))) {
      out.push({
        kind: 'link',
        text: t('activity.fact.replaces'),
        id: old,
        to: { name: 'course-grade', params: { courseId: props.courseId, gradeId: old } },
      })
    } else if (old) {
      out.push({ kind: 'text', text: t('activity.fact.replacesEarlier') })
    }
  }
  if (type === 'grade.total_updated') {
    const complete = payloadBool(e, 'complete')
    if (complete !== undefined) {
      out.push({
        kind: 'text',
        text: complete ? t('activity.fact.complete') : t('activity.fact.incomplete'),
        tone: complete ? 'success' : 'warning',
      })
    }
  }
  return out
})

// The action behind the event, for those who may open the action log.
const actionTo = computed<RouteLocationRaw | null>(() => {
  const id = props.event.action_id
  if (!id || props.compact || kind.value === 'action' || !reach.value.decides) return null
  return { name: 'course-action', params: { courseId: props.courseId, actionId: id } }
})
</script>

<template>
  <div class="event-item" :class="[`is-${category}`, { 'is-fresh': fresh, 'is-compact': compact }]">
    <span class="event-item__icon" aria-hidden="true">
      <el-icon><component :is="icon" /></el-icon>
    </span>
    <div class="event-item__body">
      <div class="event-item__head">
        <span class="event-item__title">{{ title }}</span>
        <el-tag v-if="fresh" size="small" type="primary" effect="dark" round disable-transitions>
          {{ t('activity.fresh') }}
        </el-tag>
        <span class="event-item__time">
          <el-tooltip v-if="actionTo" :content="t('activity.viaAction')" placement="top">
            <router-link :to="actionTo" class="event-item__action" :aria-label="t('activity.viaAction')">
              <el-icon><Stamp /></el-icon>
            </router-link>
          </el-tooltip>
          <TimeText :value="event.occurred_at" relative />
        </span>
      </div>

      <!-- Who acted: who proposed or did it, then who decided or reviewed it. -->
      <div v-if="who.length" class="event-item__who" :aria-label="t('activity.who.label')">
        <template v-for="(w, i) in who" :key="w.key">
          <span v-if="i" class="event-item__who-then" aria-hidden="true">→</span>
          <i18n-t :keypath="w.key" tag="span" scope="global" class="event-item__who-part">
            <template #who><MemberName :id="w.id" show-kind class="event-item__who-name" /></template>
          </i18n-t>
        </template>
      </div>

      <div class="event-item__line">
        <template v-if="kind === 'member' && event.subject_id">
          <router-link v-if="subjectTo" :to="subjectTo" class="event-item__subject">
            <MemberName :id="event.subject_id" show-kind />
          </router-link>
          <span v-else class="event-item__subject"><MemberName :id="event.subject_id" show-kind /></span>
        </template>
        <template v-else-if="subjectText">
          <router-link v-if="subjectLink" :to="subjectLink" class="event-item__subject">{{ subjectText }}</router-link>
          <span v-else class="event-item__subject">{{ subjectText }}</span>
        </template>

        <span v-if="showStudent" class="event-item__ctx">
          <el-icon><User /></el-icon>
          <MemberName :id="event.student_member_id" show-kind />
        </span>
        <span v-if="showAssignment" class="event-item__ctx">
          <el-icon><EditPen /></el-icon>
          <router-link v-if="assignmentTo" :to="assignmentTo" class="event-item__ctx-link">
            {{ assignmentTitle ?? t('activity.subject.assignment') }}
          </router-link>
          <span v-else>{{ assignmentTitle ?? t('activity.subject.assignment') }}</span>
        </span>
      </div>

      <div v-if="facts.length" class="event-item__facts">
        <template v-for="(f, i) in facts" :key="i">
          <StatusTag v-if="f.kind === 'tag'" :vocab="f.vocab" :value="f.value" />
          <el-tooltip v-else-if="f.kind === 'text' && f.tip" :content="f.tip" placement="top">
            <el-tag :type="f.tone ?? 'info'" size="small" effect="plain" disable-transitions tabindex="0">
              {{ f.text }}
            </el-tag>
          </el-tooltip>
          <el-tag
            v-else-if="f.kind === 'text'"
            :type="f.tone ?? 'info'"
            size="small"
            effect="plain"
            disable-transitions
          >
            {{ f.text }}
          </el-tag>
          <span v-else-if="f.kind === 'link'" class="event-item__fact-link">
            <router-link :to="f.to">{{ f.text }}</router-link>
            <IdText :id="f.id" />
          </span>
        </template>
      </div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.event-item {
  --event-accent: var(--el-color-info);
  display: flex;
  gap: 12px;
  padding: 12px 12px 12px 10px;
  border-radius: var(--app-radius-item);
  border-left: 3px solid transparent;
  min-width: 0;
}
.event-item.is-grades {
  --event-accent: var(--el-color-success);
}
.event-item.is-submissions {
  --event-accent: var(--el-color-primary);
}
.event-item.is-assignments {
  --event-accent: var(--el-color-warning);
}
.event-item.is-documents {
  --event-accent: var(--el-color-primary);
}
.event-item.is-members {
  --event-accent: var(--el-color-info);
}
.event-item.is-actions {
  --event-accent: var(--el-color-danger);
}
.event-item.is-course {
  --event-accent: var(--el-color-info);
}
.event-item.is-fresh {
  background: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
}
.event-item.is-compact {
  padding: 8px 4px;
  gap: 10px;
}
.event-item__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--event-accent);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  font-size: 15px;
}
.event-item.is-compact .event-item__icon {
  width: 28px;
  height: 28px;
  font-size: 14px;
}
.event-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.event-item__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.event-item__title {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
}
.event-item__time {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.event-item__who {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 13px;
  color: var(--app-ink-2);
  min-width: 0;
}
.event-item__who-part {
  min-width: 0;
}
.event-item__who-name {
  vertical-align: middle;
  color: var(--app-ink);
}
/* In Chinese the verb has no space before it: the name stands a little apart by itself. */
:lang(zh) .event-item__who-name {
  margin-inline-end: 0.25em;
}
.event-item__who-then {
  color: var(--app-ink-3);
}
.event-item__line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  min-width: 0;
}
.event-item__subject {
  font-weight: 500;
  min-width: 0;
  overflow-wrap: anywhere;
}
.event-item__ctx {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
  min-width: 0;
  overflow-wrap: anywhere;
}
.event-item__ctx-link {
  color: inherit;
}
.event-item__ctx-link:hover {
  color: var(--el-color-primary);
}
.event-item__facts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.event-item__fact-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.event-item__action {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-decoration: none;
}
.event-item__action:hover {
  color: var(--el-color-primary);
}
</style>
