<script setup lang="ts">
// Where data leaves the site (docs/CONVENTIONS.md, "Notes and alerts"): to a
// model's provider, under the school's key or an owner's own, or into files
// someone downloads. The same to everyone it concerns, administrators
// offering a model, owners choosing one, and whoever asks in the chat: a
// shield before the words, on an outline in the indigo's line, never the
// amber of a warning nor the grey of an aside, so that it is read as what it
// is, a fact about where things go. A title, where it has one, is in the ink
// above, a heading of the level given (`heading`) where it heads a part of a
// page or a dialog. `compact` is the one line that says it under the chat's
// composer: the shield before words the size and colour of those around
// them, with no outline, so that it stays a line.
withDefaults(defineProps<{ title?: string; heading?: 'h2' | 'h3' | 'h4'; titleId?: string; compact?: boolean }>(), {
  title: undefined,
  heading: undefined,
  titleId: undefined,
  compact: false,
})
</script>

<template>
  <div class="data-flow" :class="{ 'is-compact': compact }" role="note">
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
      <component :is="heading ?? 'p'" v-if="title || $slots.title" :id="titleId" class="data-flow__title">
        <slot name="title">{{ title }}</slot>
      </component>
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
  font-size: var(--app-text-md);
  line-height: var(--app-lh-text);
  text-align: start;
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
  flex: 1;
  min-width: 0;
}
.data-flow__title {
  margin: 0;
  color: var(--app-ink);
  font-size: inherit;
  line-height: inherit;
  font-weight: var(--app-weight-strong);
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
/* A line among others: their size and colour, the shield the size of its words. */
.data-flow.is-compact {
  gap: 6px;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}
.data-flow.is-compact .data-flow__icon {
  width: 14px;
  height: 14px;
  margin-top: calc((1lh - 14px) / 2);
}
</style>
