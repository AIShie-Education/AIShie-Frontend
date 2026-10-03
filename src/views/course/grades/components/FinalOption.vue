<script setup lang="ts">
// treat_ungraded_as_zero, for posting and regrading: what it does, and that it
// cannot be taken back once a student's totals are written under it.
import { useI18n } from 'vue-i18n'

const model = defineModel<boolean>({ default: false })
defineProps<{ disabled?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <div class="final-option">
    <el-checkbox v-model="model" :disabled="disabled">
      <span class="final-option__label">{{ t('grades.final.label') }}</span>
    </el-checkbox>
    <p class="app-form-hint">{{ t('grades.final.help') }}</p>
    <el-alert v-if="model" type="warning" :closable="false" show-icon :title="t('grades.final.warningTitle')">
      <ul class="final-option__list">
        <li>{{ t('grades.final.warning1') }}</li>
        <li>{{ t('grades.final.warning2') }}</li>
        <li>{{ t('grades.final.warning3') }}</li>
      </ul>
    </el-alert>
  </div>
</template>

<style scoped>
.final-option {
  width: 100%;
}
.final-option__label {
  font-weight: 500;
  white-space: normal;
}
.final-option :deep(.el-checkbox) {
  height: auto;
  align-items: flex-start;
}
.final-option__list {
  margin: 4px 0 0;
  padding-left: 18px;
  line-height: var(--app-lh-text);
}
</style>
