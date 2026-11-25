<script setup lang="ts">
// A strip at the top of the page column, under the header, that says a
// newer version of the app has been deployed since this tab loaded it
// (useNewVersion), with Reload, which loads it, and Later, which puts it
// away: words, the first in the indigo, neither of them solid, for the page
// under it may have its own one primary button. It lies in the page's flow,
// ruled below, and floats over nothing; it takes no focus: the page is never
// reloaded without the person's say.
import { useI18n } from 'vue-i18n'
import { useNewVersion, type NewVersionOptions } from '@/composables/useNewVersion'

const props = defineProps<{ options?: NewVersionOptions }>()
const { t } = useI18n()
const { available, dismiss, reload } = useNewVersion(props.options)
</script>

<template>
  <div v-if="available" class="new-version" role="status">
    <el-icon class="new-version__icon" aria-hidden="true"><Refresh /></el-icon>
    <span class="new-version__text">{{ t('layout.newVersion.available') }}</span>
    <el-button text type="primary" size="small" class="new-version__reload" @click="reload">
      {{ t('layout.newVersion.reload') }}
    </el-button>
    <el-button text size="small" class="new-version__later" @click="dismiss">
      {{ t('layout.newVersion.later') }}
    </el-button>
  </div>
</template>

<style scoped>
/* The page column's width, under the header: the ground's second shade, ruled below, its words at the page's
   left gutter. */
.new-version {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-xs) var(--app-space-sm);
  min-height: 44px;
  padding: var(--app-space-xs) var(--app-space-xl);
  border-bottom: var(--app-rule);
  background: var(--app-ground-2);
  color: var(--app-ink);
  font-size: var(--app-text-md);
}
@media (max-width: 600px) {
  .new-version {
    padding: var(--app-space-xs) var(--app-space-lg);
  }
}
.new-version__icon {
  color: var(--app-indigo);
}
.new-version__text {
  margin-right: var(--app-space-xs);
  font-weight: var(--app-weight-strong);
}
.new-version .el-button + .el-button {
  margin-left: 0;
}
@media print {
  .new-version {
    display: none;
  }
}
</style>
