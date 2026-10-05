<script setup lang="ts">
// What an action about groups is about, in a line (ActionTarget: My actions,
// the approvals queue, an action's page): the set by name, a link to its
// page where asked for; for a change to one group, that group, of its set;
// for a sign-up, the group joined. A set or a group whose name the reader
// cannot be told is called just that, never by its id.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import MaybeLink from '@/views/course/actions/components/MaybeLink.vue'
import { isObject, payloadOf, routeFor, str, type ActionRow } from '@/views/course/actions/components/actionText'
import { ensureGroupNames, groupName, groupSetName } from './groupNames'

const props = defineProps<{ action: ActionRow; courseId: string; link?: boolean }>()
const { t } = useI18n()

const type = computed(() => props.action.action_type)
const p = computed(() => payloadOf(props.action))
const tid = computed(() => props.action.target_id ?? null)
/** The group it changes (group.update), or joins (group.sign_up). */
const groupId = computed(() =>
  type.value === 'group.update' ? tid.value : type.value === 'group.sign_up' ? (str(p.value.group_id) ?? null) : null,
)
const setId = computed(() => {
  if (props.action.target_type === 'group_set' && tid.value) return tid.value
  const r = props.action.result
  // What group_set.create made, once it has.
  if (type.value === 'group_set.create' && props.action.status === 'executed' && isObject(r)) return str(r.id) ?? null
  return str(p.value.set_id) ?? groupName(groupId.value)?.setId ?? null
})
onMounted(() => void ensureGroupNames(props.courseId, [setId.value, groupId.value]))

/** The set's name now; a set being made by the name it is given, one renamed by the name it has until then. */
const setName = computed(
  () => groupSetName(setId.value) ?? (type.value.startsWith('group_set.') ? str(p.value.name) : undefined) ?? null,
)
const group = computed(() => (groupId.value ? (groupName(groupId.value)?.name ?? t('groups.event.aGroup')) : null))
const to = computed(() => (props.link ? routeFor(props.courseId, 'set_id', setId.value) : null))
</script>

<template>
  <MaybeLink :to="to" class="group-target__name">
    <template v-if="group && type === 'group.update'">{{
      setName ? t('groups.event.groupOf', { group, set: setName }) : group
    }}</template>
    <template v-else>{{ setName ?? t('groups.event.aSet') }}</template>
  </MaybeLink>
  <span v-if="group && type === 'group.sign_up'" class="group-target__group">→ {{ group }}</span>
</template>

<style scoped>
.group-target__name {
  font-weight: 500;
  overflow-wrap: anywhere;
}
.group-target__group {
  color: var(--el-text-color-regular);
}
</style>
