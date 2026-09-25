<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { AUTONOMY_LEVELS, type AutonomyLevel } from '@/api/types'
const model = defineModel<AutonomyLevel | undefined>()
defineProps<{ disabled?: boolean; clearable?: boolean; placeholder?: string; size?: 'small' | 'default' | 'large' }>()
const { t } = useI18n()
</script>

<template>
  <el-select
    v-model="model"
    :disabled="disabled"
    :clearable="clearable"
    :placeholder="placeholder"
    :size="size"
    class="level-select"
  >
    <el-option v-for="l in AUTONOMY_LEVELS" :key="l" :value="l" :label="t(`enums.level.${l}`)">
      <div class="level-select__option">
        <span>{{ t(`enums.level.${l}`) }}</span>
        <span class="level-select__help">{{ t(`enums.levelHelp.${l}`) }}</span>
      </div>
    </el-option>
  </el-select>
</template>

<style scoped>
.level-select {
  min-width: 150px;
}
.level-select__option {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.level-select__help {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
