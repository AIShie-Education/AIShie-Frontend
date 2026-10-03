<script setup lang="ts">
// A note that explains (docs/CONVENTIONS.md, "Notes and alerts"): what a page,
// a card or a dialog does, what will happen, what waits for approval. It is
// quieter than what it explains: no icon, a 3 px indigo line at its left, the
// indigo's tint at half strength under it (`plain`: no ground, in a dense
// place), and its words in the second ink. A title, where it has one, is in
// the ink above them. What goes wrong or needs care is an el-alert, a warning
// or an error, never this.
import { useI18n } from 'vue-i18n'
import { Close } from '@element-plus/icons-vue'

withDefaults(defineProps<{ title?: string; plain?: boolean; closable?: boolean }>(), {
  title: undefined,
  plain: false,
  closable: false,
})
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="app-note" :class="{ 'is-plain': plain, 'is-closable': closable }" role="note">
    <p v-if="title || $slots.title" class="app-note__title">
      <slot name="title">{{ title }}</slot>
    </p>
    <div v-if="$slots.default" class="app-note__body"><slot /></div>
    <button
      v-if="closable"
      type="button"
      class="app-note__close"
      :aria-label="t('common.actions.close')"
      @click="emit('close')"
    >
      <el-icon aria-hidden="true"><Close /></el-icon>
    </button>
  </div>
</template>

<style scoped>
.app-note {
  position: relative;
  padding: 10px 14px;
  border-left: 3px solid var(--app-indigo-line);
  border-radius: 0 var(--app-radius-control) var(--app-radius-control) 0;
  background: color-mix(in srgb, var(--app-indigo-tint) 50%, transparent);
  color: var(--app-ink-2);
  font-size: var(--app-text-md);
  line-height: var(--app-line-height);
}
.app-note.is-plain {
  background: transparent;
  padding-top: 2px;
  padding-bottom: 2px;
}
.app-note.is-closable {
  padding-right: 40px;
}
.app-note__title {
  margin: 0;
  color: var(--app-ink);
  font-weight: var(--app-weight-strong);
}
.app-note__title + .app-note__body {
  margin-top: 2px;
}
.app-note__body > :deep(:first-child) {
  margin-top: 0;
}
.app-note__body > :deep(:last-child) {
  margin-bottom: 0;
}
.app-note__close {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--app-radius-control);
  background: transparent;
  color: var(--app-ink-3);
  cursor: pointer;
}
.app-note__close:hover {
  background: var(--app-indigo-tint);
  color: var(--app-ink);
}
@media (pointer: coarse) {
  .app-note.is-closable {
    padding-right: 52px;
  }
  .app-note__close {
    top: 0;
    right: 0;
    width: 44px;
    height: 44px;
  }
}
</style>
