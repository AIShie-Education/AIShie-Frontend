<script setup lang="ts">
// Loading, error and absent states around a section the runtime answers for,
// as AsyncState is around what comes from Core. A runtime from before the
// section's routes (404) says quietly that it does not offer it yet; a
// refusal because the caller is not one of the runtime's administrators says
// so; anything else is an error in the runtime's words, with a retry.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppResult from '@/components/AppResult.vue'
import AppNote from '@/components/AppNote.vue'
import OperatorDetail from '../components/OperatorDetail.vue'
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
    <AppNote v-else-if="notOffered" plain class="runtime-async__not-offered">
      {{ t('runtimeAdmin.state.notOffered') }}
    </AppNote>
    <AppResult
      v-else-if="notAdmin"
      kind="forbidden"
      :title="t('runtimeAdmin.state.notAdminTitle')"
      :sub-title="t('runtimeAdmin.state.notAdmin')"
      class="runtime-async__not-admin"
    >
      <template #extra><OperatorDetail :text="t('runtimeAdmin.flags.adminActorIds')" /></template>
    </AppResult>
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
  margin: 0;
}
.runtime-async__error :deep(.el-alert__description) {
  margin-top: 8px;
}
</style>
