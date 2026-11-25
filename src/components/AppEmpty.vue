<script setup lang="ts">
// What a place with nothing in it says (docs/CONVENTIONS.md, "Empty places"),
// instead of Element Plus's grey box: inside a section, one line in the second
// ink, with what to do about it (an action, a hint) after it in the slot;
// filling a page or a panel (`page`), its title, where one is given, in the
// ink over the words, at the page's left as the rest of its text is, and no
// picture: an illustration over an empty place is a template's, and the
// amber light is the wordmark's alone.
withDefaults(defineProps<{ text: string; page?: boolean; title?: string }>(), { page: false, title: undefined })
</script>

<template>
  <div class="app-empty" :class="page ? 'app-empty--page' : 'app-empty--inline'">
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
  font-size: var(--app-text-md);
}
.app-empty__text {
  margin: 0;
  line-height: var(--app-lh-ui);
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
/* Filling a page: left-aligned, as the page's text is, 24 px of room above and below, the words at the measure. */
.app-empty--page {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--app-space-sm);
  max-width: var(--app-measure);
  padding: var(--app-space-xl) 0;
  text-align: start;
}
.app-empty--page .app-empty__text {
  line-height: var(--app-lh-text);
}
.app-empty__title {
  margin: 0;
  color: var(--app-ink);
  font-weight: var(--app-weight-strong);
  line-height: var(--app-lh-ui);
}
.app-empty--page .app-empty__title + .app-empty__text {
  margin-top: calc(-1 * var(--app-space-xs));
}
.app-empty--page .app-empty__more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: var(--app-space-xs);
}
</style>

<!-- What the slot holds is the caller's: its first button is reached here, by the slot's own class. -->
<style>
/* What to do about it, after the words: a button of words (a text button, in the ink or the indigo, not a link)
   that starts the slot's line takes back its room at its left by as much outside it, so that its words start
   where the words over it do, and only its hovered ground reaches past them. A solid button keeps its edge at
   their left. */
.app-empty__more > .el-button:first-child:is(.is-text, :not(.el-button--primary, .el-button--danger)):not(.is-link),
.app-empty__more > a:first-child > .el-button:is(.is-text, :not(.el-button--primary, .el-button--danger)):not(.is-link) {
  padding-inline: var(--app-space-sm);
  margin-inline-start: calc(-1 * var(--app-space-sm));
}
</style>
