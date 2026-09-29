<script setup lang="ts">
// A small notice that a newer version of the app has been deployed since this
// tab loaded it (useNewVersion), with a button that loads it, and Later,
// which puts it away. It covers nothing that matters and takes no focus:
// the page is never reloaded without the person's say.
import { useI18n } from 'vue-i18n'
import { useNewVersion, type NewVersionOptions } from '@/composables/useNewVersion'

const props = defineProps<{ options?: NewVersionOptions }>()
const { t } = useI18n()
const { available, dismiss, reload } = useNewVersion(props.options)
</script>

<template>
  <Transition name="new-version">
    <div v-if="available" class="new-version" role="status">
      <el-icon class="new-version__icon" aria-hidden="true"><Refresh /></el-icon>
      <span class="new-version__text">{{ t('layout.newVersion.available') }}</span>
      <el-button type="primary" size="small" class="new-version__reload" @click="reload">
        {{ t('layout.newVersion.reload') }}
      </el-button>
      <el-button text size="small" class="new-version__later" @click="dismiss">
        {{ t('layout.newVersion.later') }}
      </el-button>
    </div>
  </Transition>
</template>

<style scoped>
/* At the bottom left, beside the activity bar, over the page and under everything Element Plus lays over it. */
.new-version {
  position: fixed;
  left: 60px;
  bottom: 16px;
  z-index: calc(var(--app-z-sheet) + 1);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 32px);
  padding: 8px 8px 8px 12px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-item);
  background: var(--app-overlay);
  box-shadow: var(--app-shadow-pop);
  color: var(--app-ink);
  font-size: 14px;
}
.new-version__icon {
  color: var(--app-indigo);
}
.new-version__text {
  font-weight: 600;
  white-space: nowrap;
}
.new-version .el-button + .el-button {
  margin-left: 0;
}
/* On a phone, at the top, clear of the chat's button and its sheet's box. */
@media (max-width: 899px) {
  .new-version {
    left: 50%;
    bottom: auto;
    top: calc(8px + env(safe-area-inset-top, 0px));
    transform: translateX(-50%);
  }
}
.new-version-enter-active,
.new-version-leave-active {
  transition:
    opacity 0.2s,
    translate 0.2s;
}
.new-version-enter-from,
.new-version-leave-to {
  opacity: 0;
  translate: 0 8px;
}
@media (prefers-reduced-motion: reduce) {
  .new-version-enter-active,
  .new-version-leave-active {
    transition: none;
  }
}
@media print {
  .new-version {
    display: none;
  }
}
</style>
