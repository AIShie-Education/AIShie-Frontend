<script setup lang="ts">
// The app's one tag (docs/CONVENTIONS.md, "Tags"). Element Plus's el-tag is
// drawn by what the tag says, never by an effect chosen page by page:
// - `pill` (the default), a state: a tinted solid pill in the pills' colours
//   of its tone (styles/tokens.css): done green, danger red, wait amber,
//   neutral, or indigo for what is new or the reader's to decide.
// - `outline`, an identity or an attribute (a kind, a role, how something
//   runs, "this browser"): ink on an outline and no ground, with its icon,
//   its corners square (radius 4) as AgentBadge's owner is, so that it is
//   never read as a state. It has no tone: an attribute is not an outcome.
// - `count`, a count badge: solid, the only dark tag.
// - `quiet`, the usual state of a row (published, submitted, posted,
//   active): plain text in the third ink, no pill, so that only what departs
//   from it is coloured.
import type { Component } from 'vue'
import type { TagTone, TagVariant } from './tags'

const props = withDefaults(
  defineProps<{
    tone?: TagTone
    variant?: TagVariant
    size?: 'small' | 'default' | 'large'
    /** An outline's icon (one of @element-plus/icons-vue, or the app's own). */
    icon?: Component
    closable?: boolean
  }>(),
  { tone: 'neutral', variant: 'pill', size: 'small', icon: undefined },
)
const emit = defineEmits<{ close: [event: MouseEvent] }>()

const EL_TYPE = { neutral: 'info', done: 'success', wait: 'warning', danger: 'danger', indigo: 'primary' } as const
const EFFECT = { pill: 'light', outline: 'plain', count: 'dark' } as const
</script>

<template>
  <span v-if="props.variant === 'quiet'" class="app-tag app-tag--quiet">
    <el-icon v-if="icon" class="app-tag__icon" aria-hidden="true"><component :is="icon" /></el-icon>
    <slot />
  </span>
  <el-tag
    v-else
    :type="props.variant === 'outline' ? 'info' : EL_TYPE[props.tone]"
    :effect="EFFECT[props.variant]"
    :size="size"
    :closable="closable"
    disable-transitions
    :class="['app-tag', `app-tag--${props.variant}`, props.variant === 'outline' ? null : `is-${props.tone}`]"
    @close="emit('close', $event)"
  >
    <el-icon v-if="icon" class="app-tag__icon" aria-hidden="true"><component :is="icon" /></el-icon>
    <slot />
  </el-tag>
</template>

<style scoped>
.app-tag :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.app-tag__icon {
  flex-shrink: 0;
}
/* A state on the indigo: the brand's tint, as a level that waits on someone's approval is. */
.el-tag.app-tag--pill.is-indigo {
  --el-tag-bg-color: var(--app-indigo-tint);
  --el-tag-text-color: var(--app-indigo);
}
/* An identity or an attribute: ink on a line, on no ground (white is a field's alone). */
.el-tag.app-tag--outline {
  --el-tag-bg-color: transparent;
  --el-tag-border-color: var(--app-line-strong);
  --el-tag-text-color: var(--app-ink-2);
  --el-tag-hover-color: var(--app-ink);
  --el-tag-border-radius: 4px;
  font-weight: normal;
}
.el-tag.app-tag--outline .app-tag__icon {
  color: var(--app-ink-3);
}
/* A count: its figures line up, and it stays a pill. */
.el-tag.app-tag--count {
  font-variant-numeric: tabular-nums;
}
/* The usual state: words in the third ink, a step smaller than the text around them, as a tag's are. */
.app-tag--quiet {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--app-ink-3);
  /* In a page's title too, as a tag beside it is (main.css). */
  font-family: var(--app-font-sans);
  font-size: var(--app-text-sm, 13px);
  font-weight: normal;
  letter-spacing: normal;
  white-space: nowrap;
}
</style>
