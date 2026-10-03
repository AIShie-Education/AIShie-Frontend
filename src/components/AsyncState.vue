<script setup lang="ts">
// Loading, error and empty states around content that comes from Core. A
// refusal (403) is shown as a lack of permission, not as a failure. Nothing
// to show is an AppEmpty: one line inside the card it is in, or, given
// `empty-page`, the line icon over the words where it fills the page.
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
      icon="warning"
      :title="t('common.errors.forbidden')"
      :sub-title="error.message"
    />
    <el-result v-else-if="error && notFound" icon="info" :title="t('common.errors.notFound')" :sub-title="error.message" />
    <el-result v-else-if="error" icon="error" :title="t('common.errors.title')" :sub-title="errorMessage(error)">
      <template #extra>
        <el-button type="primary" @click="emit('retry')">{{ t('common.actions.retry') }}</el-button>
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
</style>
