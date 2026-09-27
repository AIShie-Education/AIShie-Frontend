<script setup lang="ts">
// Every permission, each at a level on the one ladder. v-model is the
// map from permission to level; with `sparse`, a permission can be left unset
// (for "as the preset has it"), and only those set are in the map.
import { useI18n } from 'vue-i18n'
import { PERMS, SCOPED_PERMS, type AutonomyLevel, type Perm, type PermLevels } from '@/api/types'
import LevelSelect from './LevelSelect.vue'
import StatusTag from './StatusTag.vue'

const model = defineModel<PermLevels>({ default: () => ({}) })
const props = defineProps<{
  readonly?: boolean
  sparse?: boolean
  /** Shown beside each row for comparison, e.g. what the preset gives. */
  baseline?: PermLevels
  size?: 'small' | 'default'
  /** Rows to mark as changed, e.g. from what the seat holds now. */
  changed?: Perm[]
  /** A warning to show under a row, e.g. that it is above the granter's own level. */
  warn?: Partial<Record<Perm, string>>
}>()
const { t } = useI18n()

function set(p: Perm, v: AutonomyLevel | undefined) {
  const next: PermLevels = { ...model.value }
  if (v === undefined || v === null) delete next[p]
  else next[p] = v
  model.value = next
}
function value(p: Perm): AutonomyLevel | undefined {
  return model.value[p] ?? (props.sparse ? undefined : 'denied')
}
</script>

<template>
  <div class="perm-editor">
    <div
      v-for="p in PERMS"
      :key="p"
      class="perm-editor__row"
      :class="{ 'is-changed': changed?.includes(p), 'is-warned': !!warn?.[p] }"
    >
      <div class="perm-editor__label">
        <span class="perm-editor__name">
          {{ t(`enums.perm.${p}`) }}
          <el-tag
            v-if="SCOPED_PERMS.includes(p)"
            size="small"
            type="info"
            effect="plain"
            round
            :title="t('common.labels.scopedHelp')"
            >{{ t('common.labels.scoped') }}</el-tag
          >
          <el-tag v-if="changed?.includes(p)" size="small" type="warning" effect="light" round>{{
            t('common.labels.changed')
          }}</el-tag>
        </span>
        <span class="perm-editor__help">{{ t(`enums.permHelp.${p}`) }}</span>
        <code class="perm-editor__key">{{ p }}</code>
        <span v-if="warn?.[p]" class="perm-editor__warn">
          <el-icon><WarningFilled /></el-icon>
          {{ warn[p] }}
        </span>
      </div>
      <div class="perm-editor__value">
        <StatusTag v-if="readonly" vocab="level" :value="value(p) ?? 'denied'" />
        <LevelSelect
          v-else
          :model-value="value(p)"
          :clearable="sparse"
          :size="size ?? 'default'"
          :placeholder="baseline?.[p] ? t(`enums.level.${baseline[p]}`) : undefined"
          @update:model-value="(v) => set(p, v)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.perm-editor {
  display: flex;
  flex-direction: column;
}
.perm-editor__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.perm-editor__row:last-child {
  border-bottom: none;
}
.perm-editor__label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.perm-editor__name {
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}
.perm-editor__help {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.perm-editor__key {
  font-family: var(--app-font-mono);
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
.perm-editor__value {
  flex-shrink: 0;
}
.perm-editor__row.is-changed {
  background: var(--el-color-warning-light-9);
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
}
.perm-editor__warn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-color-danger);
  margin-top: 2px;
}
@media (max-width: 520px) {
  .perm-editor__row {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
}
</style>
