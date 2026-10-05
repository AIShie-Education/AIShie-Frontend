<script setup lang="ts">
// "Move to…": a menu of a set's groups, and no group, that moves the
// students it is for there. It is the keyboard's way to move students (a
// button: Enter, Space or the down arrow opens it, the arrows go through
// it, Enter chooses), as dragging one onto a group is the mouse's. On the
// toolbar it moves the students chosen; on a row, that one student, and
// names them ("Move Ana Lee to…").
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Group } from './groupModel'

const props = defineProps<{
  groups: Group[]
  /** The group the students are in, when they are all in one: it is not offered. */
  current?: string | null
  /** Whether any of them is in a group: "No group" is offered then. */
  anyPlaced?: boolean
  /** What the button says, or its name where it is an icon alone. */
  label: string
  iconOnly?: boolean
  disabled?: boolean
  size?: 'small' | 'default'
}>()
const emit = defineEmits<{ move: [groupId: string | null] }>()
const { t } = useI18n()

const NONE = '__none__'
const choices = computed(() => props.groups.filter((g) => !g.archived_at))
function sizeOf(g: Group): string {
  return g.capacity
    ? t('groups.card.sizeOf', { n: g.size, of: g.capacity })
    : t('groups.card.size', { n: g.size }, g.size)
}
function onCommand(c: string) {
  emit('move', c === NONE ? null : c)
}
</script>

<template>
  <el-dropdown trigger="click" :disabled="disabled" class="move-menu" @command="onCommand">
    <el-button
      :size="size"
      :disabled="disabled"
      :class="{ 'move-menu__icon': iconOnly }"
      :aria-label="iconOnly ? label : undefined"
      :title="iconOnly ? label : undefined"
    >
      <el-icon aria-hidden="true"><Switch /></el-icon>
      <span v-if="!iconOnly">{{ label }}</span>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu class="move-menu__list">
        <el-dropdown-item
          v-for="g in choices"
          :key="g.id"
          :command="g.id"
          :disabled="g.id === current"
          class="move-menu__item"
        >
          <span class="move-menu__name">{{ g.name }}</span>
          <span class="move-menu__size">{{ sizeOf(g) }}</span>
        </el-dropdown-item>
        <el-dropdown-item v-if="anyPlaced" :command="NONE" :divided="choices.length > 0" class="move-menu__item">
          <span class="move-menu__name">{{ t('groups.move.none') }}</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.move-menu__icon {
  padding-left: 8px;
  padding-right: 8px;
}
</style>

<!-- The menu is drawn in a popper outside the component. -->
<style>
.move-menu__list {
  max-height: min(60vh, 420px);
  overflow-y: auto;
}
.el-dropdown-menu__item.move-menu__item {
  display: flex;
  justify-content: space-between;
  gap: var(--app-space-lg);
  min-width: 200px;
}
.move-menu__name {
  overflow-wrap: anywhere;
}
.move-menu__size {
  color: var(--app-ink-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
