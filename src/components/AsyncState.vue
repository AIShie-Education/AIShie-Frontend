<script setup lang="ts">
// Loading, error and empty states around content that comes from Core. What
// went wrong is said at the section's left, as its other text is, its title
// after a glyph of what it is in the refused colour (docs/CONVENTIONS.md,
// "Colour": refused, failed or missing in red), as an alert's icon is on its
// title's line, never Element Plus's large icon on a filled circle over it:
// a lock for a refusal (403), which is a lack of permission, not a failure;
// a warning for what is not there (404); a cross for a failure. A failure
// offers to try again: Retry, the indigo's words after the icon Refresh has,
// its icon in the column the title's glyph is in, never a second solid
// button beside the page's own. The words say which it is; the glyph and its
// red set it apart from nothing to show at a glance. Nothing to show is an
// AppEmpty: one line inside the section it is in, or, given `empty-page`, its
// words at the page's left where it fills the page.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CircleClose, Lock, Refresh, Warning } from '@element-plus/icons-vue'
import type { ApiError } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'
import AppEmpty from './AppEmpty.vue'

const props = defineProps<{
  loading?: boolean
  error?: ApiError | null
  empty?: boolean
  emptyText?: string
  /** Nothing to show fills the page (or a panel), not a card's line. */
  emptyPage?: boolean
  /** Keep showing the content while reloading, when there is some. */
  overlay?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()

const forbidden = computed(() => !!props.error && props.error.isForbidden)
const notFound = computed(() => !!props.error && props.error.isNotFound)
</script>

<template>
  <div class="async-state">
    <div v-if="loading && !overlay" class="async-state__loading" v-loading="true" />
    <el-result v-else-if="error && forbidden" class="async-state__result is-forbidden" :sub-title="error.message">
      <template #title>
        <p class="async-state__title">
          <el-icon class="async-state__glyph" aria-hidden="true"><Lock /></el-icon>
          <span>{{ t('common.errors.forbidden') }}</span>
        </p>
      </template>
    </el-result>
    <el-result v-else-if="error && notFound" class="async-state__result is-not-found" :sub-title="error.message">
      <template #title>
        <p class="async-state__title">
          <el-icon class="async-state__glyph" aria-hidden="true"><Warning /></el-icon>
          <span>{{ t('common.errors.notFound') }}</span>
        </p>
      </template>
    </el-result>
    <el-result v-else-if="error" class="async-state__result is-failed" :sub-title="errorMessage(error)">
      <template #title>
        <p class="async-state__title">
          <el-icon class="async-state__glyph" aria-hidden="true"><CircleClose /></el-icon>
          <span>{{ t('common.errors.title') }}</span>
        </p>
      </template>
      <template #extra>
        <el-button type="primary" text :icon="Refresh" class="async-state__retry" @click="emit('retry')">
          {{ t('common.actions.retry') }}
        </el-button>
      </template>
    </el-result>
    <AppEmpty v-else-if="empty && !loading" :text="emptyText ?? t('common.labels.empty')" :page="emptyPage">
      <template v-if="$slots.empty" #default><slot name="empty" /></template>
    </AppEmpty>
    <div v-else v-loading="!!(loading && overlay)">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.async-state__loading {
  min-height: 160px;
}
/* What went wrong: its title and its words at the left, 24 px of room above and below, and none of Element
   Plus's icon, a glyph on a filled circle over them: the glyph is on the title's line instead. */
.el-result.async-state__result {
  align-items: flex-start;
  padding: var(--app-space-xl) 0;
  text-align: start;
}
.async-state__result :deep(.el-result__icon) {
  display: none;
}
.async-state__result :deep(.el-result__title) {
  margin-top: 0;
}
.async-state__title {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
}
/* Its glyph, the title's size, in the refused colour, with no ground. */
.async-state__glyph {
  flex-shrink: 0;
  color: var(--app-danger-fg);
}
.async-state__result :deep(.el-result__extra) {
  margin-top: var(--app-space-lg);
}
/* Retry's icon in the column the title's glyph is in: the button's room at its left is taken back by as much
   outside it, so that only its hovered ground reaches past the column. */
.el-button.async-state__retry {
  padding-inline: var(--app-space-sm);
  margin-inline-start: calc(-1 * var(--app-space-sm));
}
</style>
