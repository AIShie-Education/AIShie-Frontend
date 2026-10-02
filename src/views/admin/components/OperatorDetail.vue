<script setup lang="ts">
// What only the server's operator acts on (the setting or the command behind
// what the page says), kept out of the sentence people read: an ⓘ beside it
// whose tooltip names it (docs/CONVENTIONS.md, Text).
import { useI18n } from 'vue-i18n'

defineProps<{ text: string }>()
const { t } = useI18n()
</script>

<template>
  <el-tooltip :content="t('common.operatorDetail', { detail: text })" placement="top">
    <button type="button" class="operator-detail" :aria-label="t('common.operatorDetail', { detail: text })">
      <el-icon aria-hidden="true"><InfoFilled /></el-icon>
    </button>
  </el-tooltip>
</template>

<style scoped>
.operator-detail {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin-left: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-ink-3);
  cursor: help;
}
.operator-detail:hover,
.operator-detail:focus-visible {
  color: var(--el-color-primary);
}
</style>
