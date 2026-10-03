<script setup lang="ts">
// Where data leaves the site (docs/CONVENTIONS.md, "Notes and alerts"): to a
// model's provider, under the school's key or an owner's own, or into files
// someone downloads. The same to everyone it concerns, administrators
// offering a model, owners choosing one, and whoever asks: a shield before
// the words, on an outline in the indigo's line, never the amber of a
// warning nor the grey of an aside, so that it is read as what it is, a fact
// about where things go. A title, where it has one, is in the ink above.
defineProps<{ title?: string }>()
</script>

<template>
  <div class="data-flow" role="note">
    <svg
      class="data-flow__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3 5 6v5.2c0 4.3 2.9 7.9 7 9.8 4.1-1.9 7-5.5 7-9.8V6l-7-3Z" />
      <path d="M9 12h6" />
      <path d="m13 9.5 2.5 2.5-2.5 2.5" />
    </svg>
    <div class="data-flow__content">
      <p v-if="title || $slots.title" class="data-flow__title">
        <slot name="title">{{ title }}</slot>
      </p>
      <div v-if="$slots.default" class="data-flow__body"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.data-flow {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--app-indigo-line);
  border-radius: var(--app-radius-item);
  background: transparent;
  color: var(--app-ink-2);
  font-size: var(--app-text-md, 14px);
  line-height: var(--app-line-height);
}
.data-flow__icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  /* On the first line of the words. */
  margin-top: calc((1lh - 18px) / 2);
  color: var(--app-indigo);
}
.data-flow__content {
  min-width: 0;
}
.data-flow__title {
  margin: 0;
  color: var(--app-ink);
  font-weight: var(--app-weight-strong, 600);
}
.data-flow__title + .data-flow__body {
  margin-top: 2px;
}
.data-flow__body > :deep(:first-child) {
  margin-top: 0;
}
.data-flow__body > :deep(:last-child) {
  margin-bottom: 0;
}
</style>
