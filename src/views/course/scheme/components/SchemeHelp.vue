<script setup lang="ts">
// The scheme's rules in plain words (Core's docs/schema.md §2.3 and
// internal/gradecalc). Whether it is folded away is remembered per browser.
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const KEY = 'aishiteru.scheme.helpOpen'

function saved(): string[] {
  try {
    return localStorage.getItem(KEY) === '0' ? [] : ['rules']
  } catch {
    return ['rules']
  }
}
const open = ref<string[]>(saved())
watch(open, (v) => {
  try {
    localStorage.setItem(KEY, v.includes('rules') ? '1' : '0')
  } catch {
    /* not remembered: it opens again next time */
  }
})

const items: { key: string; icon: string }[] = [
  { key: 'tree', icon: 'Share' },
  { key: 'bucket', icon: 'Collection' },
  { key: 'group', icon: 'FolderOpened' },
  { key: 'direct', icon: 'EditPen' },
  { key: 'drop', icon: 'Bottom' },
  { key: 'ungraded', icon: 'Clock' },
  { key: 'graded', icon: 'Warning' },
  { key: 'posted', icon: 'View' },
]
</script>

<template>
  <section class="app-card scheme-help">
    <el-collapse v-model="open">
      <el-collapse-item name="rules">
        <template #title>
          <span class="scheme-help__title">
            <el-icon><QuestionFilled /></el-icon>
            {{ t('scheme.help.title') }}
          </span>
        </template>
        <ul class="scheme-help__list">
          <li v-for="it in items" :key="it.key">
            <el-icon class="scheme-help__icon"><component :is="it.icon" /></el-icon>
            <span>{{ t(`scheme.help.${it.key}`) }}</span>
          </li>
        </ul>
      </el-collapse-item>
    </el-collapse>
  </section>
</template>

<style scoped>
.scheme-help {
  padding-top: 4px;
  padding-bottom: 4px;
}
.scheme-help :deep(.el-collapse) {
  border: none;
}
.scheme-help :deep(.el-collapse-item__header),
.scheme-help :deep(.el-collapse-item__wrap) {
  border-bottom: none;
  background: transparent;
}
.scheme-help__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}
.scheme-help__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 12px 24px;
}
.scheme-help__list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.scheme-help__icon {
  flex-shrink: 0;
  margin-top: 4px;
  color: var(--el-color-primary);
}
</style>
