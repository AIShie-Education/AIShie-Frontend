<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppResult from '@/components/AppResult.vue'
const { t } = useI18n()
</script>

<template>
  <div class="not-found">
    <AppResult kind="missing" :title="t('layout.notFound')" :sub-title="t('common.errors.notFound')">
      <template #extra>
        <router-link :to="{ name: 'home' }">
          <el-button type="primary">{{ t('common.nav.home') }}</el-button>
        </router-link>
      </template>
    </AppResult>
  </div>
</template>

<style scoped>
/* What went wrong, at the page's top left, as a page's text starts: not centred in the window. */
.not-found {
  min-height: 100vh;
  padding: var(--app-space-2xl) var(--app-space-lg);
  max-width: calc(var(--app-measure) + 2 * var(--app-space-lg));
}
.not-found .el-result {
  padding: 0;
}
</style>
