<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; back?: string | object }>()
</script>

<template>
  <div class="page-header">
    <div class="page-header__main">
      <router-link v-if="back" :to="back" class="page-header__back">
        <el-icon><ArrowLeft /></el-icon>
      </router-link>
      <div class="page-header__text">
        <h1 class="page-header__title">
          {{ title }}
          <slot name="tags" />
        </h1>
        <p v-if="subtitle || $slots.subtitle" class="page-header__subtitle">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
    </div>
    <div v-if="$slots.default" class="page-header__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.page-header__main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.page-header__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}
.page-header__back:hover {
  background: var(--el-fill-color-light);
}
.page-header__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  word-break: break-word;
}
.page-header__subtitle {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.page-header__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
