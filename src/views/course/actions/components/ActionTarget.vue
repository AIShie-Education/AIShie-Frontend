<script setup lang="ts">
// What an action is about, in a line: for a grade the score and whose work,
// for a hand-in the student and assignment, for a new member who and as what,
// for publishing which version, for a decision the proposal it decides.
// Names are looked up where the caller's seat can read them; otherwise the id
// is shown.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatList } from '@/utils/format'
import { componentLabel } from '@/views/course/scheme/components/schemeModel'
import { useCourseStore } from '@/stores/course'
import { presetLabel } from '@/views/course/members/components/seat'
import { seatPurpose } from '@/utils/agents'
import AgentBadge from '@/components/AgentBadge.vue'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import ActionActor from './ActionActor.vue'
import ActionTarget from './ActionTarget.vue'
import MaybeLink from './MaybeLink.vue'
import VersionRef from './VersionRef.vue'
import {
  decisionTag,
  exactDecimal,
  excerpt,
  isObject,
  payloadOf,
  presetOf,
  routeFor,
  str,
  targetTypeLabel,
  typeLabel,
  type ActionRow,
} from './actionText'
import { useLookup, useSpecs } from './lookups'

const props = withDefaults(
  defineProps<{
    action: ActionRow
    courseId: string
    /** How deep in a chain of decisions this is; a decision's own target is shown once. */
    depth?: number
    /** Make the thing it is about a link. */
    link?: boolean
    /** Quote the start of a message written with it (off where the message is shown whole). */
    quote?: boolean
  }>(),
  { depth: 0, link: false, quote: true },
)
const { t } = useI18n()
const course = useCourseStore()
const specs = useSpecs()
onMounted(() => void course.ensureAssignments())

const p = computed(() => payloadOf(props.action))
const type = computed(() => props.action.action_type)
const tt = computed(() => props.action.target_type)
const tid = computed(() => props.action.target_id ?? undefined)
const group = computed(() => type.value.split('.')[0])

const sub = useLookup(() => (tt.value === 'submission' ? specs.submission(props.courseId, tid.value) : null))
const grade = useLookup(() => (tt.value === 'grade' ? specs.grade(props.courseId, tid.value) : null))
const doc = useLookup(() => (tt.value === 'document' && tid.value ? specs.document(props.courseId, tid.value) : null))
const about = useLookup(() =>
  tt.value === 'action' && props.depth < 1 ? specs.action(props.courseId, tid.value) : null,
)
/** The conversation a chat action is about: its title, where the caller may read it. */
const conversationId = computed(() => {
  if (group.value !== 'conversation') return undefined
  const r = props.action.result
  return (
    (tt.value === 'conversation' ? tid.value : undefined) ??
    str(p.value.conversation_id) ??
    // conversation.open names the one it made in its result.
    (isObject(r) ? str(r.conversation_id) : undefined)
  )
})
const conversation = useLookup(() =>
  conversationId.value && props.depth < 1 ? specs.conversation(props.courseId, conversationId.value) : null,
)
const conversationTitle = computed(() => conversation.value?.value?.title ?? undefined)
/**
 * The names of the files the action writes: those a message carries
 * (attachments), or a document version's (files), each an upload token and
 * a name.
 */
const messageFiles = computed<string[]>(() => {
  const list =
    group.value === 'conversation' ? p.value.attachments : group.value === 'document' ? p.value.files : undefined
  if (!Array.isArray(list)) return []
  return list
    .map((f) => (f && typeof f === 'object' ? (f as { filename?: unknown }).filename : undefined))
    .filter((n): n is string => typeof n === 'string' && !!n)
})
const needsComponents = computed(
  () => tt.value === 'grade_component' || !!str(p.value.component_id) || group.value === 'component',
)
const comps = useLookup(() => (needsComponents.value ? specs.components(props.courseId) : null))
/** The seat a member.add made, once it has been carried out. */
const seatedId = computed(() => {
  const r = props.action.result
  return props.action.status === 'executed' && isObject(r) ? str(r.member_id) : undefined
})

const actor = useLookup(() =>
  type.value === 'member.add' && !seatedId.value ? specs.actor(str(p.value.actor_id)) : null,
)

const studentId = computed(
  () =>
    sub.value?.value?.student_member_id ??
    grade.value?.value?.student_member_id ??
    str(p.value.student_member_id) ??
    (type.value === 'submission.create' ? (props.action.member_id ?? undefined) : undefined),
)
const assignmentId = computed(
  () =>
    sub.value?.value?.assignment_id ??
    grade.value?.value?.assignment_id ??
    str(p.value.assignment_id) ??
    (tt.value === 'assignment' ? tid.value : undefined),
)
const assignmentTitle = computed(() => course.assignmentTitle(assignmentId.value))
const componentId = computed(
  () => (tt.value === 'grade_component' ? tid.value : undefined) ?? str(p.value.component_id) ?? grade.value?.value?.component_id ?? undefined,
)
const componentName = computed(() => {
  const id = componentId.value
  if (!id) return undefined
  const c = (comps.value?.value as { id: string; name: string; parent_id?: string | null }[] | undefined)?.find(
    (x) => x.id === id,
  )
  return c ? componentLabel(c, t('scheme.rootName')) : undefined
})

const score = computed(() => {
  const s = p.value.score as number | string | undefined
  if (s === undefined || s === null) return null
  const of = p.value.out_of as number | string | undefined
  return of !== undefined && of !== null
    ? t('actions.summary.outOf', { score: exactDecimal(s), of: exactDecimal(of) })
    : exactDecimal(s)
})

const docTitle = computed(() => str(p.value.title) ?? doc.value?.value?.title)
const docKind = computed(() => str(p.value.kind) ?? doc.value?.value?.kind)

// A new member's seat is the preset's, as Core finds it, with any role set in
// the proposal over it.
const presets = useLookup(() =>
  type.value === 'member.add' || type.value === 'member.add_delegate' ? specs.presets(props.courseId) : null,
)
const preset = computed(() => presetOf(presets.value?.value, p.value))
/** Permissions it sets; for a new member, those set differently from the preset, once that is known. */
const permChanges = computed(() => {
  const perms = p.value.perms
  if (!isObject(perms)) return []
  const base = type.value === 'member.add' ? preset.value?.perms : undefined
  return (Object.entries(perms) as [string, string][]).filter(([k, v]) => !base || v !== (base[k] ?? 'denied'))
})
const newMemberAs = computed(() => {
  const as = preset.value ? presetLabel(preset.value) : str(p.value.preset)
  const role = str(p.value.role)
  const roleDiffers = !!role && role !== preset.value?.role
  if (as && roleDiffers) return t('actions.summary.newMemberRole', { what: as, role: t(`enums.role.${role}`) })
  if (as) return t('actions.summary.newMember', { what: as })
  if (role) return t('actions.summary.newMember', { what: t(`enums.role.${role}`) })
  return null
})

// An agent brought in as someone's delegate: its name and its owner's are
// fixed in a proposal (Core writes them in when it is made), and so is whom
// it answers (answers_course); a proposal from before Core recorded that is
// told by the built-in preset it names.
const agentName = computed(() => str(p.value.agent_display_name))
const ownerName = computed(() => str(p.value.owner_display_name))
const purpose = computed(() =>
  seatPurpose({
    answers_course: typeof p.value.answers_course === 'boolean' ? p.value.answers_course : null,
    preset: preset.value ? (preset.value.dept_id ? null : preset.value.name) : str(p.value.preset),
  }),
)
const everyRole = computed(() => {
  const role = str(p.value.role)
  return role ? t('actions.summary.everyRole', { role: t(`enums.role.${role}`) }) : null
})

const targetRoute = computed(() => (props.link ? routeFor(props.courseId, tt.value, tid.value) : null))
const aboutAction = computed(() => about.value?.value as ActionRow | undefined)
</script>

<template>
  <span class="action-target">
    <!-- Grades -->
    <template v-if="type === 'grade.submit' || type === 'grade.regrade'">
      <span v-if="score" class="action-target__score">{{ score }}</span>
      <span v-if="studentId" class="action-target__part"><MemberName :id="studentId" /></span>
      <MaybeLink v-if="assignmentTitle || componentName" :to="targetRoute" class="action-target__part action-target__name">
        {{ assignmentTitle ?? componentName }}
      </MaybeLink>
      <span v-else-if="!studentId && (tid || str(p.submission_id))" class="action-target__part">
        {{ targetTypeLabel(tid ? tt : 'submission') }} <IdText :id="tid ?? str(p.submission_id)" />
      </span>
    </template>

    <template v-else-if="type === 'grade.post'">
      <span v-if="assignmentTitle" class="action-target__part action-target__name">{{ assignmentTitle }}</span>
      <span v-else-if="Array.isArray(p.grade_ids)" class="action-target__part">
        {{ t('actions.summary.grades', { n: (p.grade_ids as unknown[]).length }, (p.grade_ids as unknown[]).length) }}
      </span>
      <el-tag v-if="p.treat_ungraded_as_zero" size="small" type="warning" effect="plain">
        {{ t('actions.summary.ungradedZero') }}
      </el-tag>
    </template>

    <!-- Submissions -->
    <template v-else-if="group === 'submission'">
      <span v-if="studentId" class="action-target__part"><MemberName :id="studentId" /></span>
      <MaybeLink v-if="assignmentTitle" :to="targetRoute" class="action-target__part action-target__name">
        {{ assignmentTitle }}
      </MaybeLink>
      <span v-else-if="tid" class="action-target__part">{{ targetTypeLabel(tt) }} <IdText :id="tid" /></span>
      <StatusTag v-if="type === 'submission.set_lateness'" vocab="submissionState" :value="str(p.state)" />
      <span v-if="Array.isArray(p.files) && p.files.length" class="action-target__muted">
        {{ t('actions.summary.files', { n: p.files.length }, p.files.length) }}
      </span>
    </template>

    <!-- Members -->
    <template v-else-if="type === 'member.add'">
      <MaybeLink v-if="seatedId" :to="link ? routeFor(courseId, 'member_id', seatedId) : null" class="action-target__part">
        <MemberName :id="seatedId" />
      </MaybeLink>
      <span v-else class="action-target__part action-target__name">
        <template v-if="actor?.value">{{ actor.value.display_name }}</template>
        <IdText v-else :id="str(p.actor_id)" />
      </span>
      <span v-if="newMemberAs" class="action-target__as">{{ newMemberAs }}</span>
      <IdText v-else-if="str(p.preset_id)" :id="str(p.preset_id)" />
      <span v-for="[perm, level] in permChanges.slice(0, 3)" :key="perm" class="action-target__perm">
        {{ t(`enums.perm.${perm}`) }} → <StatusTag vocab="level" :value="level" />
      </span>
      <span v-if="permChanges.length > 3" class="action-target__muted">+{{ permChanges.length - 3 }}</span>
    </template>
    <template v-else-if="type === 'member.add_delegate'">
      <MaybeLink v-if="seatedId" :to="link ? routeFor(courseId, 'member_id', seatedId) : null" class="action-target__part">
        <MemberName :id="seatedId" />
      </MaybeLink>
      <span v-else class="action-target__part action-target__name">
        <template v-if="agentName">{{ agentName }}</template>
        <IdText v-else :id="str(p.actor_id) ?? tid" />
      </span>
      <AgentBadge :owner-name="ownerName" />
      <StatusTag v-if="purpose" vocab="seatPurpose" :value="purpose" />
      <span v-else-if="preset" class="action-target__as">{{ t('actions.summary.newMember', { what: presetLabel(preset) }) }}</span>
    </template>
    <template v-else-if="type === 'member.update_perms_bulk'">
      <span v-if="everyRole" class="action-target__part action-target__name">{{ everyRole }}</span>
      <span v-for="[perm, level] in permChanges.slice(0, 3)" :key="perm" class="action-target__perm">
        {{ t(`enums.perm.${perm}`) }} → <StatusTag vocab="level" :value="level" />
      </span>
      <span v-if="permChanges.length > 3" class="action-target__muted">+{{ permChanges.length - 3 }}</span>
    </template>
    <template v-else-if="group === 'member' || (group === 'agent' && tt === 'course_member')">
      <MaybeLink :to="targetRoute" class="action-target__part">
        <MemberName :id="tid" />
      </MaybeLink>
      <span v-for="[perm, level] in permChanges.slice(0, 3)" :key="perm" class="action-target__perm">
        {{ t(`enums.perm.${perm}`) }} → <StatusTag vocab="level" :value="level" />
      </span>
      <span v-if="permChanges.length > 3" class="action-target__muted">+{{ permChanges.length - 3 }}</span>
    </template>

    <!-- Documents -->
    <template v-else-if="group === 'document'">
      <MaybeLink v-if="docTitle" :to="targetRoute" class="action-target__part action-target__name">
        {{ docTitle }}
      </MaybeLink>
      <span v-else-if="tid" class="action-target__part">{{ targetTypeLabel(tt) }} <IdText :id="tid" /></span>
      <StatusTag v-if="docKind" vocab="documentKind" :value="docKind" />
      <VersionRef
        v-if="type === 'document.publish' && str(p.version_id)"
        :course-id="courseId"
        :document-id="str(p.document_id) ?? tid"
        :version-id="str(p.version_id)!"
        :check="action.status === 'proposed'"
      />
      <!-- The files a version holds: how many, their names on hover (never their upload tokens). -->
      <span v-if="messageFiles.length" class="action-target__muted" :title="formatList(messageFiles)">
        {{ t('actions.summary.files', { n: messageFiles.length }, messageFiles.length) }}
      </span>
    </template>

    <!-- Assignments -->
    <template v-else-if="group === 'assignment'">
      <MaybeLink v-if="str(p.title) || assignmentTitle" :to="targetRoute" class="action-target__part action-target__name">
        {{ str(p.title) ?? assignmentTitle }}
      </MaybeLink>
      <span v-else-if="tid" class="action-target__part">{{ targetTypeLabel(tt) }} <IdText :id="tid" /></span>
    </template>

    <!-- Grading scheme -->
    <template v-else-if="group === 'component'">
      <span v-if="str(p.name) || componentName" class="action-target__part action-target__name">
        {{ str(p.name) ?? componentName }}
      </span>
      <span v-else-if="tid" class="action-target__part">{{ targetTypeLabel(tt) }} <IdText :id="tid" /></span>
    </template>

    <!-- Conversations -->
    <template v-else-if="group === 'conversation'">
      <MaybeLink
        v-if="conversationId"
        :to="link ? routeFor(courseId, 'conversation', conversationId) : null"
        class="action-target__part action-target__name"
      >
        <template v-if="conversationTitle">{{ conversationTitle }}</template>
        <template v-else-if="str(p.title)">{{ str(p.title) }}</template>
        <template v-else>{{ targetTypeLabel('conversation') }} <IdText :id="conversationId" /></template>
      </MaybeLink>
      <span v-else-if="tid" class="action-target__part">{{ targetTypeLabel(tt) }} <IdText :id="tid" /></span>
      <span v-if="str(p.respondent_member_id)" class="action-target__part">
        → <MemberName :id="str(p.respondent_member_id)" />
      </span>
      <span v-if="quote && excerpt(p.body)" class="action-target__quote">“{{ excerpt(p.body) }}”</span>
      <span v-else-if="quote && type === 'conversation.close' && str(p.reason)" class="action-target__quote">
        “{{ excerpt(p.reason) }}”
      </span>
      <!-- The files a question or an answer carries: how many, their names on hover (never their upload tokens). -->
      <span v-if="messageFiles.length" class="action-target__muted" :title="formatList(messageFiles)">
        {{ t('actions.summary.files', { n: messageFiles.length }, messageFiles.length) }}
      </span>
    </template>

    <template v-else-if="group === 'course'">
      <span class="action-target__part action-target__name">{{ course.course?.title ?? targetTypeLabel(tt) }}</span>
    </template>

    <!-- A decision or review about another action -->
    <template v-else-if="type === 'action.decide' || type === 'action.review' || type === 'action.withdraw'">
      <el-tag v-if="type === 'action.withdraw'" size="small" type="info" effect="plain">
        {{ t('actions.summary.withdrawn') }}
      </el-tag>
      <el-tag v-else-if="type === 'action.decide'" size="small" :type="decisionTag(p.decision).type" effect="plain">
        {{ decisionTag(p.decision).label }}
      </el-tag>
      <StatusTag v-else vocab="reviewState" :value="str(p.outcome)" />
      <template v-if="aboutAction">
        <i18n-t keypath="actions.summary.by" tag="span" scope="global" class="action-target__by">
          <template #what>
            <MaybeLink :to="link ? routeFor(courseId, 'action', aboutAction.id) : null" class="action-target__name">
              {{ typeLabel(aboutAction.action_type) }}
            </MaybeLink>
          </template>
          <template #who>
            <ActionActor :member-id="aboutAction.member_id" :actor-id="aboutAction.actor_id" />
          </template>
        </i18n-t>
        <span class="action-target__nested">
          <ActionTarget :action="aboutAction" :course-id="courseId" :depth="depth + 1" />
        </span>
      </template>
      <span v-else class="action-target__part">{{ targetTypeLabel('action') }} <IdText :id="tid" /></span>
    </template>

    <template v-else>
      <span class="action-target__part">{{ targetTypeLabel(tt) }} <IdText v-if="tid" :id="tid" /></span>
    </template>
  </span>
</template>

<style scoped>
.action-target {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.6;
}
.action-target__part {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  word-break: break-word;
}
.action-target__name {
  font-weight: 500;
}
.action-target__score {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color);
  border-radius: 4px;
  padding: 0 6px;
}
.action-target__muted {
  color: var(--el-text-color-secondary);
}
.action-target__as {
  color: var(--el-text-color-regular);
}
.action-target__by {
  color: var(--el-text-color-secondary);
}
.action-target__by :deep(.action-actor) {
  color: var(--el-text-color-regular);
  vertical-align: middle;
}
.action-target__by span.action-target__name {
  color: var(--el-text-color-primary);
}
.action-target__quote {
  color: var(--el-text-color-secondary);
  font-style: italic;
  min-width: 0;
  overflow-wrap: anywhere;
}
.action-target__perm {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-regular);
}
.action-target__nested {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 8px;
  border-left: 2px solid var(--el-border-color);
}
</style>
