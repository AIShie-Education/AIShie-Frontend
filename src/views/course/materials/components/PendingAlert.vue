<script setup lang="ts">
// What became of a write that is now a proposal: nothing has happened yet, and
// there is nothing to show but the proposal itself, which the person follows
// in "My actions".
import { useI18n } from 'vue-i18n'

defineProps<{ courseId: string; message: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <el-alert
    type="warning"
    show-icon
    :title="t('common.outcome.proposedTitle')"
    class="pending-alert"
    @close="emit('close')"
  >
    <p class="pending-alert__text">{{ message }}</p>
    <router-link :to="{ name: 'course-my-actions', params: { courseId } }" class="pending-alert__link">
      {{ t('materials.pendingLink') }}
    </router-link>
  </el-alert>
</template>

<style scoped>
.pending-alert {
  margin-bottom: 16px;
}
.pending-alert__text {
  margin: 2px 0 4px;
  line-height: 1.5;
}
.pending-alert__link {
  font-weight: 500;
}
</style>
