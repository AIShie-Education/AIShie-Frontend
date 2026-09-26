<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div class="not-found">
    <el-result icon="warning" :title="t('layout.notFound')" :sub-title="t('common.errors.notFound')">
      <template #extra>
        <router-link :to="{ name: 'home' }">
          <el-button type="primary">{{ t('common.nav.home') }}</el-button>
        </router-link>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
