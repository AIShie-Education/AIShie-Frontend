<script setup lang="ts">
// Loading, error and absent states around a section the runtime answers for,
// as AsyncState is around what comes from Core. A runtime from before the
// section's routes (404) says quietly that it does not offer it yet; a
// refusal because the caller is not one of the runtime's administrators says
// so; anything else is an error in the runtime's words, with a retry.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminErrorText, isNotAdmin, isNotOffered } from './runtimeAdmin'

const props = defineProps<{ loading?: boolean; error?: unknown }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()

const notOffered = computed(() => !!props.error && isNotOffered(props.error))
const notAdmin = computed(() => !!props.error && isNotAdmin(props.error))
</script>

<template>
  <div class="runtime-async">
    <div v-if="loading" v-loading="true" class="runtime-async__loading" />
    <p v-else-if="notOffered" class="runtime-async__not-offered" role="status">
      <el-icon aria-hidden="true"><InfoFilled /></el-icon>
      <span>{{ t('runtimeAdmin.state.notOffered') }}</span>
    </p>
    <el-result
      v-else-if="notAdmin"
      icon="warning"
      :title="t('runtimeAdmin.state.notAdminTitle')"
      :sub-title="t('runtimeAdmin.state.notAdmin')"
      class="runtime-async__not-admin"
    />
    <el-alert
      v-else-if="error"
      type="error"
      :closable="false"
      show-icon
      :title="adminErrorText(error, t)"
      class="runtime-async__error"
    >
      <el-button size="small" @click="emit('retry')">{{ t('common.actions.retry') }}</el-button>
    </el-alert>
    <slot v-else />
  </div>
</template>

<style scoped>
.runtime-async__loading {
  min-height: 120px;
}
.runtime-async__not-offered {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.runtime-async__not-offered .el-icon {
  flex-shrink: 0;
  margin-top: 3px;
}
.runtime-async__error :deep(.el-alert__description) {
  margin-top: 8px;
}
</style>
