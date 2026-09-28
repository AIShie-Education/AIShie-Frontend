<script setup lang="ts">
import { Comment, Fragment, Text, type VNode } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ title: string; subtitle?: string; back?: string | object }>()
const { t } = useI18n()

/**
 * Whether what a slot gave holds anything to show. A slot passed with every
 * child v-if'd away still exists, and would leave an empty row behind.
 */
function filled(nodes: VNode[] | undefined): boolean {
  return !!nodes?.some((n) => {
    if (n.type === Comment) return false
    if (n.type === Text) return typeof n.children === 'string' && n.children.trim() !== ''
    if (n.type === Fragment) return Array.isArray(n.children) && filled(n.children as VNode[])
    return true
  })
}
</script>

<template>
  <div class="page-header">
    <div class="page-header__main">
      <router-link
        v-if="back"
        :to="back"
        class="page-header__back"
        :aria-label="t('common.actions.back')"
        :title="t('common.actions.back')"
      >
        <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
      </router-link>
      <div class="page-header__text">
        <h1 class="page-header__title">
          {{ title }}
          <slot name="tags" />
        </h1>
        <p v-if="subtitle || filled($slots.subtitle?.())" class="page-header__subtitle">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
    </div>
    <div v-if="filled($slots.default?.())" class="page-header__actions">
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
  border-radius: var(--app-radius-control);
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}
.page-header__back:hover {
  background: var(--app-ground-2);
}
.page-header__title {
  margin: 0;
  font-size: 24px;
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
