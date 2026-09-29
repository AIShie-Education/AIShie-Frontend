<script setup lang="ts">
// What an agent is doing on its answer, step by step, as an agent chat lists
// it: each done step quiet, with a tick ("Read 《HW1.pdf》"), the running one
// with the turning glyph ("Reading 《HW1.pdf》…"). Once the answer's text has
// begun (collapsed), the steps done are summed up in one line ("Consulted 3
// items"), which opens to list them again.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSpinner from './ChatSpinner.vue'
import { consulted, stepDone, stepMessage, type DraftStep } from './draft'

const props = defineProps<{
  steps: DraftStep[]
  /** Sum up the steps done in one line (the answer's text has begun). */
  collapsed?: boolean
}>()
const { t } = useI18n()

const open = ref(false)
const listId = `chat-steps-${Math.random().toString(36).slice(2, 9)}`
const looked = computed(() => consulted(props.steps))
const running = computed(() => props.steps.filter((s) => !stepDone(s) && !(props.collapsed && s.kind === 'writing')))
/** The steps listed one by one: all of them, or, collapsed, only the running ones (unless opened). */
const listed = computed(() => (props.collapsed && !open.value ? running.value : props.steps))
function say(step: DraftStep) {
  const m = stepMessage(step)
  return m.target ? t(m.key, { target: m.target }) : t(m.key)
}
</script>

<template>
  <div class="chat-steps" :class="{ 'is-collapsed': collapsed }">
    <button
      v-if="collapsed && looked.length"
      type="button"
      class="chat-steps__summary"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="listId"
      @click="open = !open"
    >
      <el-icon class="chat-steps__tick" aria-hidden="true"><Check /></el-icon>
      <span>{{ t('chat.draft.consulted', { n: looked.length }, looked.length) }}</span>
      <el-icon class="chat-steps__chevron" :class="{ 'is-open': open }" aria-hidden="true"><ArrowRight /></el-icon>
    </button>
    <ol v-if="listed.length" :id="listId" class="chat-steps__list" :aria-label="t('chat.draft.stepsLabel')">
      <li
        v-for="(s, i) in listed"
        :key="`${i}:${s.kind}:${s.target ?? ''}`"
        class="chat-steps__step"
        :class="stepDone(s) ? 'is-done' : 'is-running'"
      >
        <ChatSpinner v-if="!stepDone(s)" class="chat-steps__glyph" />
        <el-icon v-else class="chat-steps__tick" aria-hidden="true"><Check /></el-icon>
        <span class="chat-steps__text">{{ say(s) }}</span>
        <span class="chat-steps__state">{{ stepDone(s) ? t('chat.draft.done') : t('chat.draft.running') }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.chat-steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-ink-3);
}
.chat-steps__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chat-steps__step {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 22px;
}
.chat-steps.is-collapsed .chat-steps__list {
  padding-left: 12px;
  border-left: 1px solid var(--app-line);
  margin-left: 7px;
}
.chat-steps__tick {
  flex-shrink: 0;
  width: 1em;
  font-size: 13px;
  color: var(--app-done-fg);
}
.chat-steps__glyph {
  font-size: 14px;
}
.chat-steps__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-steps__step.is-running .chat-steps__text {
  color: var(--app-ink);
}
/* Said to screen readers only: the tick and the glyph say it to the eye. */
.chat-steps__state {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.chat-steps__summary {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  padding: 2px 6px 2px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.chat-steps__summary:hover {
  color: var(--app-ink);
}
.chat-steps__chevron {
  font-size: 11px;
  transition: transform 0.15s;
}
.chat-steps__chevron.is-open {
  transform: rotate(90deg);
}
@media (prefers-reduced-motion: reduce) {
  .chat-steps__chevron {
    transition: none;
  }
}
</style>
