<script setup lang="ts">
// Loading, error and empty states around content that comes from Core. A
// refusal (403) is shown as a lack of permission, not as a failure; either
// is said in words at the section's left, as its other text is, with no icon
// on a filled circle over them, and a failure offers to try again as a text
// button, never a second solid one beside the page's own. Nothing to show is an AppEmpty: one line inside the
// section it is in, or, given `empty-page`, its words at the page's left
// where it fills the page.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
    <el-result
      v-else-if="error && forbidden"
      class="async-state__result"
      :title="t('common.errors.forbidden')"
      :sub-title="error.message"
    />
    <el-result
      v-else-if="error && notFound"
      class="async-state__result"
      :title="t('common.errors.notFound')"
      :sub-title="error.message"
    />
    <el-result
      v-else-if="error"
      class="async-state__result"
      :title="t('common.errors.title')"
      :sub-title="errorMessage(error)"
    >
      <template #extra>
        <el-button class="async-state__retry" @click="emit('retry')">{{ t('common.actions.retry') }}</el-button>
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
   Plus's icon, a glyph on a filled circle (the words say which it is). */
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
.async-state__result :deep(.el-result__extra) {
  margin-top: var(--app-space-lg);
}
</style>
