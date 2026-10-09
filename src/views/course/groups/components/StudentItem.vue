<script setup lang="ts">
// A student in a set's page, in a group or among those in none: their name
// (a box to choose them by, for "Move to…", where the reader forms groups),
// whether they signed themselves up, and their own "Move to…". Where the reader
// forms groups, the row can also be dragged onto a group; the box and the
// menu are the keyboard's way to do the same.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MoveMenu from './MoveMenu.vue'
import { nameOf, type Group, type GroupMember } from './groupModel'

const props = defineProps<{
  member: GroupMember
  groups: Group[]
  /** The group they are in; null for none. */
  groupId: string | null
  /** The reader forms groups here: the row can be chosen and moved. */
  movable: boolean
  selected?: boolean
}>()
const emit = defineEmits<{ toggle: []; move: [groupId: string | null]; dragstart: [event: DragEvent] }>()
const { t } = useI18n()

const name = computed(() => nameOf(props.member, t('common.labels.someMember')))
/** That they signed themselves up, which is worth saying beside their name; how else they came is in the history. */
const how = computed(() => (props.member.joined_how === 'signup' ? t('groups.card.signedUp') : null))
</script>

<template>
  <li
    class="student-item"
    :class="{ 'is-selected': selected, 'is-movable': movable }"
    :draggable="movable ? 'true' : undefined"
    :data-member="member.member_id"
    @dragstart="emit('dragstart', $event)"
  >
    <el-checkbox
      v-if="movable"
      :model-value="!!selected"
      class="student-item__check"
      @update:model-value="emit('toggle')"
    >
      <span class="student-item__name">{{ name }}</span>
    </el-checkbox>
    <span v-else class="student-item__name">{{ name }}</span>
    <span v-if="how" class="student-item__how">{{ how }}</span>
    <MoveMenu
      v-if="movable"
      class="student-item__move"
      :groups="groups"
      :current="groupId"
      :any-placed="!!groupId"
      :label="t('groups.move.one', { name })"
      icon-only
      size="small"
      @move="emit('move', $event)"
    />
  </li>
</template>

<style scoped>
.student-item {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
  min-height: 32px;
  padding: 2px var(--app-space-xs);
  border-radius: 6px;
}
.student-item.is-movable {
  cursor: grab;
}
.student-item.is-selected {
  background: var(--app-indigo-tint);
}
.student-item__check {
  min-width: 0;
  flex: 1 1 auto;
  height: auto;
  margin-right: 0;
}
.student-item__check :deep(.el-checkbox__label) {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.student-item__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
span.student-item__name {
  flex: 1 1 auto;
}
.student-item__how {
  flex-shrink: 0;
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
}
.student-item__move {
  flex-shrink: 0;
}
</style>
