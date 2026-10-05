<script setup lang="ts">
// One field of an action about groups, in words (FieldsView, as
// groupFieldKind says it is): a set by name, a link to its page; a group by
// name; who goes where; the groups a split made, filled or left alone; how
// it split and whom it dealt; the work a refusal names. A set or a group the
// reader cannot be told the name of is called just that, never by its id.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useCourseStore } from '@/stores/course'
import { formatList } from '@/utils/format'
import MaybeLink from '@/views/course/actions/components/MaybeLink.vue'
import { isObject, routeFor } from '@/views/course/actions/components/actionText'
import type { GroupFieldKind } from './groupFields'
import { groupIdsIn } from './groupFields'
import { ensureGroupNames, groupName, groupSetName } from './groupNames'

const props = defineProps<{ courseId: string; kind: GroupFieldKind; field: string; value: unknown }>()
const { t } = useI18n()
const course = useCourseStore()
onMounted(() => {
  void ensureGroupNames(props.courseId, groupIdsIn({ [props.field]: props.value }))
  if (props.kind === 'work') void course.ensureAssignments()
})

const id = computed(() => (typeof props.value === 'string' ? props.value : null))
const rows = computed(() => (Array.isArray(props.value) ? props.value.filter(isObject) : []))
const ids = computed(() =>
  Array.isArray(props.value) ? props.value.filter((x): x is string => typeof x === 'string') : [],
)
const group = (gid: unknown) => (typeof gid === 'string' && groupName(gid)?.name) || t('groups.event.aGroup')
const groupList = (list: unknown[]) => formatList(list.map(group))
const setRoute = (sid: string | null) => routeFor(props.courseId, 'set_id', sid)
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
</script>

<template>
  <MaybeLink v-if="kind === 'set'" :to="setRoute(id)">{{ groupSetName(id) ?? t('groups.event.aSet') }}</MaybeLink>
  <span v-else-if="kind === 'group'">{{ group(id) }}</span>
  <span v-else-if="kind === 'groups' || kind === 'made'">{{
    kind === 'made' ? formatList(rows.map((r) => String(r.name))) : groupList(ids)
  }}</span>
  <ul v-else-if="kind === 'newGroups'" class="group-field__list">
    <li v-for="(g, i) in rows" :key="i">
      {{
        num(g.capacity)
          ? t('common.aside', { text: String(g.name), aside: t('groups.proposal.capacity', { n: num(g.capacity) }) })
          : String(g.name)
      }}
    </li>
  </ul>
  <ul v-else-if="kind === 'placements'" class="group-field__list">
    <li v-for="(x, i) in rows" :key="i">
      <i18n-t
        :keypath="str(x.group_id) ? 'groups.proposal.placedIn' : 'groups.proposal.takenOut'"
        tag="span"
        scope="global"
      >
        <template #student><MemberName :id="str(x.student_member_id)" /></template>
        <template #group>{{ group(x.group_id) }}</template>
      </i18n-t>
    </li>
  </ul>
  <ul v-else-if="kind === 'moves'" class="group-field__list">
    <li v-for="(x, i) in rows" :key="i">
      <i18n-t
        :keypath="
          str(x.group_id)
            ? str(x.from_group_id)
              ? 'groups.fields.movedFrom'
              : 'groups.proposal.placedIn'
            : 'groups.fields.movedOut'
        "
        tag="span"
        scope="global"
      >
        <template #student><MemberName :id="str(x.student_member_id)" /></template>
        <template #group>{{ group(x.group_id) }}</template>
        <template #from>{{ group(x.from_group_id) }}</template>
      </i18n-t>
    </li>
  </ul>
  <span v-else-if="kind === 'kept'">{{
    t('groups.fields.kept', { names: groupList(rows.map((r) => r.group_id)) }, rows.length)
  }}</span>
  <span v-else-if="kind === 'splitBy'">{{
    id === 'count' ? t('groups.split.byCount') : id === 'size' ? t('groups.split.bySize') : id
  }}</span>
  <span v-else-if="kind === 'splitFrom'">{{
    id === 'all' ? t('groups.split.fromAll') : id === 'unassigned' ? t('groups.split.fromUnassigned') : id
  }}</span>
  <ul v-else-if="kind === 'work'" class="group-field__list">
    <li v-for="(w, i) in rows" :key="i" class="group-field__work">
      <span>{{
        t('groups.fields.workOf', {
          group: group(w.group_id),
          assignment: course.assignmentTitle(str(w.assignment_id)) ?? t('groups.affects.anAssignment'),
        })
      }}</span>
      <StatusTag v-if="str(w.state)" vocab="submissionState" :value="str(w.state)" />
    </li>
  </ul>
</template>

<style scoped>
.group-field__list {
  margin: 0;
  padding-inline-start: 1.25em;
}
.group-field__work {
  display: list-item;
}
.group-field__work > * + * {
  margin-inline-start: var(--app-space-sm);
}
</style>
