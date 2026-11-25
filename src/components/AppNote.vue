<script setup lang="ts">
// A note that explains (docs/CONVENTIONS.md, "Notes and alerts"): what a page,
// a section or a dialog does, what will happen, what waits for approval. It
// is quieter than what it explains, as the site's notes are: no icon, no
// ground and no corners, a 2 px rule in the indigo's line at its left, and
// its words in the second ink, at a paragraph's leading, stopping at the
// measure. A title, where it has one, is in the ink above them. `plain` was
// a note without its ground; every note is one now, and it is kept for the
// places that ask for it. What goes wrong or needs care is an el-alert, a
// warning or an error, never this.
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
  max-width: var(--app-measure);
  padding: 2px 0 2px var(--app-space-lg);
  border-left: 2px solid var(--app-indigo-line);
  color: var(--app-ink-2);
  font-size: var(--app-text-md);
  line-height: var(--app-lh-text);
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
/* A square of 28 px at its top right, 44 px on a touch screen, which does not push its words down. */
.app-note__close {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--app-radius);
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
    top: -8px;
    width: 44px;
    height: 44px;
  }
}
</style>
