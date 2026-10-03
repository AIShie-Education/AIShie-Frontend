<script setup lang="ts">
// What a place with nothing in it says (docs/CONVENTIONS.md, "Empty places"),
// instead of Element Plus's grey box: inside a card, one line in the second
// ink, with what to do about it (an action, a hint) after it in the slot;
// filling a page or a panel (`page`), the brand's line icon above the words,
// an open book with the light over it (48 px, stroke 1.75, as aishie.app
// draws its icons), centred, under a title where one is given.
withDefaults(defineProps<{ text: string; page?: boolean; title?: string }>(), { page: false, title: undefined })
</script>

<template>
  <div class="app-empty" :class="page ? 'app-empty--page' : 'app-empty--inline'">
    <svg
      v-if="page"
      class="app-empty__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 8.5c-2.6-1.6-5.6-2-9-1.2v11.4c3.4-.8 6.4-.4 9 1.2 2.6-1.6 5.6-2 9-1.2V7.3c-3.4-.8-6.4-.4-9 1.2Z" />
      <path d="M12 8.5v11.4" />
      <circle class="app-empty__light" cx="12" cy="3.6" r="1.4" />
    </svg>
    <p v-if="page && title" class="app-empty__title">{{ title }}</p>
    <p class="app-empty__text">{{ text }}</p>
    <div v-if="$slots.default" class="app-empty__more">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.app-empty {
  color: var(--app-ink-2);
}
.app-empty__text {
  margin: 0;
  line-height: var(--app-line-height);
}
.app-empty--inline {
  padding: 8px 0;
}
.app-empty--inline .app-empty__more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 10px;
}
.app-empty--page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 16px;
  text-align: center;
}
.app-empty__icon {
  width: 48px;
  height: 48px;
  color: var(--app-ink-3);
}
.app-empty__light {
  fill: var(--app-light);
  stroke: none;
}
.app-empty__title {
  margin: 0;
  color: var(--app-ink);
  font-weight: var(--app-weight-strong, 600);
}
.app-empty--page .app-empty__text {
  max-width: 36em;
}
.app-empty--page .app-empty__title + .app-empty__text {
  margin-top: -8px;
}
.app-empty--page .app-empty__more {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
</style>
