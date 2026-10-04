<script setup lang="ts">
// An assignment's ⋯ menu, for those who write assignments: on its page, at
// the far end of the header's actions, and at the end of its row in the
// list. What cannot be taken back is not put beside what is done every day
// (docs/CONVENTIONS.md, Buttons): deleting it for good is here, in the
// danger's colour, and opens DeleteAssignmentDialog, which asks first. Where
// it cannot be asked for now (an archived course, a deletion of it already
// waiting for approval), the item is off and says why.
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    title: string
    /** Why it cannot be deleted from here now; the item is off while there is a reason. */
    why?: string | null
    size?: 'small' | 'default'
  }>(),
  { why: null, size: 'default' },
)
const emit = defineEmits<{ delete: [] }>()
const { t } = useI18n()
</script>

<template>
  <el-dropdown trigger="click" placement="bottom-end" class="assignment-more" @command="emit('delete')">
    <el-button :size="size" class="assignment-more__button" :aria-label="t('assignments.delete.more', { title })">
      <el-icon aria-hidden="true"><MoreFilled /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="delete" :disabled="!!why" class="assignment-more__delete">
          <el-icon aria-hidden="true"><Delete /></el-icon>
          <span class="assignment-more__text">
            <span>{{ t('assignments.delete.menu') }}</span>
            <span v-if="why" class="assignment-more__why">{{ why }}</span>
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.assignment-more__button {
  padding-left: 9px;
  padding-right: 9px;
}
</style>

<!-- The menu is drawn in a popper outside the component: its item's colours are set where it is. -->
<style>
.el-dropdown-menu__item.assignment-more__delete:not(.is-disabled) {
  color: var(--el-color-danger);
}
.el-dropdown-menu__item.assignment-more__delete:not(.is-disabled):hover,
.el-dropdown-menu__item.assignment-more__delete:not(.is-disabled):focus {
  color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
}
.assignment-more__text {
  display: flex;
  flex-direction: column;
}
.assignment-more__why {
  max-width: 280px;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  white-space: normal;
}
</style>
