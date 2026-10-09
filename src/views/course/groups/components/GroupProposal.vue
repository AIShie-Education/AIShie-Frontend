<script setup lang="ts">
// What an action about groups does, in words, where it is decided or read
// (ActionView, and the approvals queue's ActionCard, `compact`, where
// ActionTarget names the set beside it): the set it is about, by name; a
// random split by size or by count, from whom, with the seed it was pinned
// to, so that approving it deals as proposed, and once made what it made,
// placed and left alone (its result); each student placed and where, and
// whether it moves students of a group with work; a student signing up,
// themselves or by their own agent, which only proposes it; the groups added
// or changed; a set made or changed, its sign-up opened or closed. Names come
// from the course's sets (groupNames.ts) and the member list, as far as the
// reader may see them.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import MemberName from '@/components/MemberName.vue'
import TimeText from '@/components/TimeText.vue'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatList } from '@/utils/format'
import { isObject, payloadOf, str, type ActionRow } from '@/views/course/actions/components/actionText'
import { groupIdsIn } from './groupFields'
import { SERVER_SPLIT_PREFIX } from './groupModel'
import { ensureGroupNames, groupName, groupSetName } from './groupNames'

const props = defineProps<{ action: ActionRow; courseId: string; compact?: boolean }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()

const type = computed(() => props.action.action_type)
const p = computed(() => payloadOf(props.action))
/** What it came to, once carried out. */
const result = computed(() =>
  props.action.status === 'executed' && isObject(props.action.result) ? props.action.result : null,
)
const proposed = computed(() => props.action.status === 'proposed')
const setId = computed(
  () =>
    str(p.value.set_id) ??
    (type.value.startsWith('group_set.') ? props.action.target_id : null) ??
    (type.value === 'group_set.create' ? str(result.value?.id) : null) ??
    null,
)
onMounted(() => {
  void ensureGroupNames(props.courseId, [
    setId.value,
    props.action.target_id,
    ...groupIdsIn(p.value),
    ...groupIdsIn(result.value),
  ])
  if (type.value === 'group.sign_up') void course.ensureMembers()
})

const setName = computed(() => groupSetName(setId.value) ?? str(p.value.name) ?? null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const nameOfGroup = (id: unknown) => (typeof id === 'string' && groupName(id)?.name) || t('groups.event.aGroup')

interface Placement {
  student: string
  group: string | null
}
const placements = computed<Placement[]>(() => {
  const list = Array.isArray(p.value.placements) ? p.value.placements : []
  return list
    .filter(
      (x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof x.student_member_id === 'string',
    )
    .map((x) => ({ student: x.student_member_id as string, group: str(x.group_id) ?? null }))
})
const newGroups = computed(() => {
  void ui.locale
  const list = Array.isArray(p.value.groups) ? p.value.groups : []
  return formatList(
    list
      .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object' && typeof g.name === 'string')
      .map((g) =>
        num(g.capacity)
          ? t('common.aside', { text: g.name as string, aside: t('groups.proposal.capacity', { n: num(g.capacity) }) })
          : (g.name as string),
      ),
  )
})

// --- A random split ------------------------------------------------------------
/**
 * The groups it makes: once made, those it made (none, where the set had
 * groups enough); before, how any it makes will be named, the prefix it
 * gives or, where it gives none (an agent's, say), the server's own.
 */
const madeNames = computed(() =>
  result.value && Array.isArray(result.value.created)
    ? result.value.created.filter(isObject).map((c) => String(c.name ?? ''))
    : null,
)
const splitMade = computed(() => {
  void ui.locale
  const made = madeNames.value
  if (made) return made.length ? formatList(made) : t('groups.proposal.noneMade')
  const prefix = typeof p.value.name_prefix === 'string' ? p.value.name_prefix : SERVER_SPLIT_PREFIX
  return t('groups.proposal.namedLikeIfAny', { example: `${prefix}1`.trim() })
})
/** What a split carried out came to: how many it placed, the groups it left alone, how many it took out to deal again. */
const splitDone = computed(() => {
  void ui.locale
  const r = result.value
  if (!r || type.value !== 'group.split') return null
  const placed = Array.isArray(r.placed) ? r.placed.length : 0
  const kept = Array.isArray(r.kept) ? r.kept.filter(isObject).map((k) => nameOfGroup(k.group_id)) : []
  return {
    placed: t('groups.proposal.students', { n: placed }, placed),
    kept: kept.length ? formatList(kept) : t('groups.proposal.noneKept'),
    emptied: num(r.emptied) ? t('groups.proposal.students', { n: num(r.emptied) }, num(r.emptied)!) : null,
  }
})

// --- Sign-up -------------------------------------------------------------------
/**
 * Whom a sign-up is for: the student it names; else the one who asked, a
 * student signing themselves up, or, where that was a student's own agent,
 * its student (its principal), as the member list says, or as the caller is
 * where the list is not theirs to read and the agent is theirs.
 */
const signer = computed<string | null>(() => {
  const named = str(p.value.student_member_id)
  if (named) return named
  const by = props.action.member_id ?? null
  if (!by) return null
  if (by === course.myMemberId) return course.principalMemberId ?? by
  const seat = course.members.get(by)
  if (seat) return seat.principal_member_id ?? by
  // A reader who may not read the member list is shown only their own actions and their own agents'.
  if (course.membersState === 'forbidden' && course.myMemberId) return course.myMemberId
  return by
})

/** What the queue's card says in one line. */
const line = computed(() => {
  void ui.locale
  switch (type.value) {
    case 'group.split':
      return t(p.value.by === 'count' ? 'groups.proposal.byCount' : 'groups.proposal.bySize', {
        n: num(p.value.n) ?? 0,
      })
    case 'group.set_members':
      return t('groups.proposal.placements', { n: placements.value.length }, placements.value.length)
    case 'group.create':
      return newGroups.value
    default:
      return null
  }
})
</script>

<template>
  <div v-if="!compact || line" class="group-proposal" :class="{ 'is-compact': compact }">
    <span v-if="compact" class="group-proposal__line">{{ line }}</span>
    <dl v-else class="group-proposal__facts">
      <div v-if="setId">
        <dt>{{ t('groups.proposal.set') }}</dt>
        <dd>
          <router-link :to="{ name: 'course-group-set', params: { courseId, setId } }">{{
            setName ?? t('groups.event.aSet')
          }}</router-link>
        </dd>
      </div>

      <template v-if="type === 'group.split'">
        <div>
          <dt>{{ t('groups.split.by') }}</dt>
          <dd>
            {{ t(p.by === 'count' ? 'groups.proposal.byCount' : 'groups.proposal.bySize', { n: num(p.n) ?? 0 }) }}
          </dd>
        </div>
        <div>
          <dt>{{ t('groups.split.from') }}</dt>
          <dd>{{ p.from === 'all' ? t('groups.split.fromAll') : t('groups.split.fromUnassigned') }}</dd>
        </div>
        <div v-if="str(p.seed) || str(result?.seed)">
          <dt>{{ t('groups.split.seed') }}</dt>
          <dd>
            <code class="group-proposal__seed">{{ str(result?.seed) ?? p.seed }}</code>
            <span v-if="proposed" class="group-proposal__hint">{{ t('groups.proposal.seedHint') }}</span>
          </dd>
        </div>
        <div>
          <dt>{{ t('groups.proposal.newGroups') }}</dt>
          <dd>
            {{ splitMade
            }}<template v-if="num(p.capacity) && madeNames?.length !== 0">{{
              t('common.bracketed', { text: t('groups.proposal.capacity', { n: num(p.capacity) }) })
            }}</template>
          </dd>
        </div>
        <template v-if="splitDone">
          <div>
            <dt>{{ t('actions.fields.placed') }}</dt>
            <dd>{{ splitDone.placed }}</dd>
          </div>
          <div v-if="splitDone.emptied">
            <dt>{{ t('actions.fields.emptied') }}</dt>
            <dd>{{ splitDone.emptied }}</dd>
          </div>
          <div>
            <dt>{{ t('actions.fields.kept') }}</dt>
            <dd>{{ splitDone.kept }}</dd>
          </div>
        </template>
      </template>

      <template v-else-if="type === 'group.set_members'">
        <div>
          <dt>{{ t('groups.proposal.placementsLabel') }}</dt>
          <dd>
            <ul class="group-proposal__list">
              <li v-for="x in placements" :key="x.student">
                <i18n-t
                  :keypath="x.group ? 'groups.proposal.placedIn' : 'groups.proposal.takenOut'"
                  tag="span"
                  scope="global"
                >
                  <template #student><MemberName :id="x.student" /></template>
                  <template #group>{{ nameOfGroup(x.group) }}</template>
                </i18n-t>
              </li>
            </ul>
          </dd>
        </div>
        <div v-if="p.affects_work">
          <dt>{{ t('groups.affects.title') }}</dt>
          <dd>{{ t('groups.proposal.affectsWork') }}</dd>
        </div>
      </template>

      <template v-else-if="type === 'group.sign_up'">
        <div>
          <dt>{{ t('groups.proposal.signUp') }}</dt>
          <dd>
            <i18n-t
              :keypath="str(p.group_id) ? 'groups.proposal.joins' : 'groups.proposal.leaves'"
              tag="span"
              scope="global"
            >
              <template #student><MemberName :id="signer" /></template>
              <template #group>{{ nameOfGroup(p.group_id) }}</template>
            </i18n-t>
          </dd>
        </div>
      </template>

      <template v-else-if="type === 'group.create'">
        <div>
          <dt>{{ t('groups.proposal.newGroups') }}</dt>
          <dd>{{ newGroups }}</dd>
        </div>
      </template>

      <template v-else-if="type === 'group.update'">
        <div>
          <dt>{{ t('groups.proposal.group') }}</dt>
          <dd>{{ nameOfGroup(action.target_id) }}</dd>
        </div>
        <div v-if="str(p.name)">
          <dt>{{ t('groups.edit.name') }}</dt>
          <dd>{{ p.name }}</dd>
        </div>
        <div v-if="num(p.capacity) || p.clear_capacity">
          <dt>{{ t('groups.add.capacity') }}</dt>
          <dd>{{ p.clear_capacity ? t('groups.add.noLimit') : num(p.capacity) }}</dd>
        </div>
        <div v-if="typeof p.archived === 'boolean'">
          <dt>{{ t('groups.proposal.archive') }}</dt>
          <dd>{{ p.archived ? t('groups.card.archive') : t('groups.card.restore') }}</dd>
        </div>
      </template>

      <template v-else-if="type === 'group_set.create' || type === 'group_set.update'">
        <div v-if="type === 'group_set.update' && str(p.name)">
          <dt>{{ t('groups.edit.name') }}</dt>
          <dd>{{ p.name }}</dd>
        </div>
        <div v-if="typeof p.signup_open === 'boolean'">
          <dt>{{ t('groups.signup.title') }}</dt>
          <dd>{{ p.signup_open ? t('groups.proposal.signupOn') : t('groups.proposal.signupOff') }}</dd>
        </div>
        <div v-if="str(p.signup_closes_at) || p.clear_signup_closes_at">
          <dt>{{ t('groups.setForm.deadline') }}</dt>
          <dd>
            <TimeText v-if="str(p.signup_closes_at)" :value="str(p.signup_closes_at)" cutoff />
            <span v-else>{{ t('groups.setForm.deadlinePlaceholder') }}</span>
          </dd>
        </div>
        <div v-if="typeof p.archived === 'boolean'">
          <dt>{{ t('groups.proposal.archive') }}</dt>
          <dd>{{ p.archived ? t('groups.set.archive') : t('groups.set.restore') }}</dd>
        </div>
      </template>
    </dl>
  </div>
</template>

<style scoped>
.group-proposal.is-compact {
  font-size: var(--app-text-sm);
}
.group-proposal__line {
  color: var(--app-ink-2);
}
.group-proposal__facts {
  display: grid;
  gap: var(--app-space-sm);
  margin: 0;
}
.group-proposal__facts dt {
  color: var(--app-ink-3);
  font-size: var(--app-text-xs);
}
.group-proposal__facts dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
}
.group-proposal__seed {
  font-family: var(--app-font-mono);
  margin-inline-end: var(--app-space-sm);
}
.group-proposal__hint {
  color: var(--app-ink-2);
  font-size: var(--app-text-sm);
}
.group-proposal__list {
  margin: 0;
  padding-inline-start: 1.25em;
}
</style>
