<script setup lang="ts">
// The scheme's rules in plain words (Core's docs/schema.md §2.3 and
// internal/gradecalc). Whether it is folded away is remembered per browser.
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const KEY = 'aishie.scheme.helpOpen'

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

/** The rules, in the order they are read: words alone, a rule between them, no icon beside each. */
const items = ['tree', 'bucket', 'group', 'direct', 'drop', 'ungraded', 'graded', 'posted'] as const
</script>

<template>
  <section class="app-card scheme-help">
    <el-collapse v-model="open">
      <el-collapse-item name="rules">
        <template #title>
          <span class="scheme-help__title">{{ t('scheme.help.title') }}</span>
        </template>
        <ul class="scheme-help__list">
          <li v-for="key in items" :key="key">
            <span class="scheme-help__text">{{ t(`scheme.help.${key}`) }}</span>
          </li>
        </ul>
      </el-collapse-item>
    </el-collapse>
  </section>
</template>

<style scoped>
.scheme-help :deep(.el-collapse) {
  border: none;
}
.scheme-help :deep(.el-collapse-item__header),
.scheme-help :deep(.el-collapse-item__wrap) {
  border-bottom: none;
  background: transparent;
}
.scheme-help__title {
  font-size: var(--app-text-lg);
  font-weight: var(--app-heading-weight);
}
/* The rules as rows between rules, each a sentence at the measure. */
.scheme-help__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: var(--app-rule);
}
.scheme-help__list li {
  padding: var(--app-space-sm) 0;
  border-bottom: var(--app-rule);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--app-ink-2);
}
.scheme-help__text {
  display: block;
  max-width: var(--app-measure);
}
</style>
