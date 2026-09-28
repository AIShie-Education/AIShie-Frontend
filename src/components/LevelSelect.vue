<script setup lang="ts">
// One level on the ladder. With a ceiling (the most the seat may hold, as
// Core says it), the levels above it are offered greyed out, each saying why
// (`ceilingNote`); a permission capped at denied is locked altogether.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AUTONOMY_LEVELS, type AutonomyLevel } from '@/api/types'
const model = defineModel<AutonomyLevel | undefined>()
const props = defineProps<{
  disabled?: boolean
  clearable?: boolean
  placeholder?: string
  size?: 'small' | 'default' | 'large'
  /** The most that may be chosen; the levels above it are greyed out. */
  ceiling?: AutonomyLevel | null
  /** Why, in the reader's words: shown on each level greyed out. */
  ceilingNote?: string | null
}>()
const { t } = useI18n()

function above(l: AutonomyLevel): boolean {
  return !!props.ceiling && AUTONOMY_LEVELS.indexOf(l) > AUTONOMY_LEVELS.indexOf(props.ceiling)
}
/** Capped at denied: nothing but denied may be held, so there is nothing to choose. */
const locked = computed(() => props.ceiling === 'denied')
</script>

<template>
  <el-tooltip
    :disabled="!locked || !ceilingNote"
    :content="ceilingNote ?? ''"
    placement="top"
    popper-class="app-tip-wrap"
  >
    <el-select
      v-model="model"
      :disabled="disabled || locked"
      :clearable="clearable && !locked"
      :placeholder="placeholder"
      :size="size"
      class="level-select"
      :class="{ 'is-locked': locked }"
    >
      <template v-if="locked" #prefix>
        <el-icon class="level-select__lock"><Lock /></el-icon>
      </template>
      <el-option
        v-for="l in AUTONOMY_LEVELS"
        :key="l"
        :value="l"
        :label="t(`enums.level.${l}`)"
        :disabled="above(l)"
        :class="{ 'level-select__above': above(l) }"
      >
        <el-tooltip
          :disabled="!above(l) || !ceilingNote"
          :content="ceilingNote ?? ''"
          placement="left"
          popper-class="app-tip-wrap"
          :show-after="150"
        >
          <div class="level-select__option">
            <span>
              <el-icon v-if="above(l)" class="level-select__lock"><Lock /></el-icon>
              {{ t(`enums.level.${l}`) }}
            </span>
            <span class="level-select__help">{{ t(`enums.levelHelp.${l}`) }}</span>
          </div>
        </el-tooltip>
      </el-option>
    </el-select>
  </el-tooltip>
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
.level-select__lock {
  vertical-align: -2px;
  margin-right: 2px;
}
</style>
