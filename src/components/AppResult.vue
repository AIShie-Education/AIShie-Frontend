<script setup lang="ts">
// What went wrong, where it fills a section, a page or the chat (docs/CONVENTIONS.md, "Empty places"): its title
// after a glyph of what it is, on the title's line as an alert's icon is, its words under it, and what to do
// about it under them, all at the left of where it is, as the rest of its text is. Never Element Plus's large icon
// on a filled circle over a centred title (element.css draws every el-result so; lint refuses one written
// anywhere but here). The glyph says which it is at a glance, and its colour the outcome's: a lock for a refusal,
// a warning for what is not there or no longer valid, a cross for a failure, in the refused colour; a clock for
// what waits on someone, in the wait colour; a tick for what was done, in green. A title that wraps keeps its
// glyph on its first line.
import { computed, type Component } from 'vue'
import { CircleCheck, CircleClose, Clock, Lock, Warning } from '@element-plus/icons-vue'

export type ResultKind = 'forbidden' | 'missing' | 'failed' | 'waiting' | 'done'

const props = defineProps<{ kind: ResultKind; title: string; subTitle?: string }>()

const GLYPHS: Record<ResultKind, Component> = {
  forbidden: Lock,
  missing: Warning,
  failed: CircleClose,
  waiting: Clock,
  done: CircleCheck,
}
const glyph = computed(() => GLYPHS[props.kind])
</script>

<template>
  <el-result class="app-result" :class="`app-result--${kind}`" :sub-title="subTitle">
    <template #title>
      <p class="app-result__title">
        <el-icon class="app-result__glyph" aria-hidden="true"><component :is="glyph" /></el-icon>
        <span>{{ title }}</span>
      </p>
    </template>
    <template v-if="$slots['sub-title']" #sub-title><slot name="sub-title" /></template>
    <template v-if="$slots.extra" #extra><slot name="extra" /></template>
  </el-result>
</template>

<style scoped>
/* The glyph on the title's first line, however many it takes: as tall as a line of the title, its icon at the
   middle of that line, not of the whole title. */
.app-result__title {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-sm);
}
.app-result__glyph {
  flex-shrink: 0;
  height: 1lh;
  line-height: inherit;
  color: var(--app-danger-fg);
}
.app-result--waiting .app-result__glyph {
  color: var(--app-wait-fg);
}
.app-result--done .app-result__glyph {
  color: var(--app-done-fg);
}
</style>
