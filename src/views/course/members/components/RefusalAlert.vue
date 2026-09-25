<script setup lang="ts">
// Core's refusal of a change to a seat, shown where the change was being
// made: what it means in the reader's words, then Core's own words, then the
// action it was recorded as.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ApiError } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'
import { explainRefusal } from './seat'

const props = defineProps<{ error: ApiError | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const explained = computed(() => (props.error ? explainRefusal(props.error) : null))
const title = computed(() => {
  if (!props.error) return ''
  return explained.value ?? errorMessage(props.error)
})
const raw = computed(() => (props.error && explained.value ? props.error.message : ''))
</script>

<template>
  <el-alert
    v-if="error"
    :type="error.isForbidden ? 'warning' : 'error'"
    show-icon
    class="refusal"
    @close="emit('close')"
  >
    <template #title>
      <span class="refusal__title">{{ title }}</span>
    </template>
    <div class="refusal__body">
      <div v-if="raw" class="refusal__core">
        <span class="refusal__label">{{ t('members.refusal.coreSaid') }}</span>
        <code>{{ raw }}</code>
      </div>
      <div v-if="error.actionId" class="refusal__recorded">
        {{ t('common.errors.recordedAs', { id: error.actionId.slice(0, 8) }) }}
      </div>
    </div>
  </el-alert>
</template>

<style scoped>
.refusal {
  margin-bottom: 16px;
  align-items: flex-start;
}
.refusal :deep(.el-alert__title) {
  font-size: 14px;
}
.refusal__title {
  font-weight: 500;
  line-height: 1.5;
  white-space: normal;
}
.refusal__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}
.refusal__core {
  font-size: 12px;
  word-break: break-word;
}
.refusal__core code {
  font-family: var(--app-font-mono);
}
.refusal__label {
  margin-right: 4px;
}
.refusal__recorded {
  font-size: 12px;
  opacity: 0.8;
}
</style>
