<script setup lang="ts">
// The caller's own name, as MemberName shows it, without asking for the
// member list: a student may not read it, and would only be refused.
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { t } = useI18n()
</script>

<template>
  <span class="own-name">
    {{ session.me?.display_name ?? t('common.labels.you') }}
    <span v-if="session.me?.display_name" class="own-name__me">({{ t('common.labels.you') }})</span>
  </span>
</template>

<style scoped>
.own-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.own-name__me {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
