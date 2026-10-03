<script setup lang="ts">
// One agent, by its shape: a rounded square (a person is always a circle) on
// the indigo tint, with its initials in indigo (agentInitials: two letters,
// or one Chinese, Japanese or Korean character), and the brand's light, the
// dot on the wordmark's i, at its top right corner. No hue of its own: the
// shape tells an agent from a person, and the "AI" beside its name
// (AiBadge) says it in words. It is decorative: the name goes beside it, and
// the initials are drawn by CSS, so that they are not in the text a screen
// reader reads, a selection copies or a test finds beside the name.
//
// 28 px where an agent heads a row of a list of agents (the chat's list to
// ask, the course's agents); `small` (20 px) inline in a line of text (the
// chat's header and author line, a proposal's proposer, a name in a table,
// the feed's who line, a draft's drafter); `large` (36 px) heading an entry
// of a list of agents with their details (My agents, the administration's
// card of an agent). An agent's own page is headed by its name alone.
import { computed } from 'vue'
import { agentInitials } from '@/utils/initials'
import AgentSeatIcon from './AgentSeatIcon.vue'

const props = withDefaults(defineProps<{ name?: string | null; size?: 'small' | 'default' | 'large' }>(), {
  name: '',
  size: 'default',
})
const initials = computed(() => agentInitials(props.name))
</script>

<template>
  <span class="agent-avatar" :class="`is-${size}`" aria-hidden="true">
    <span v-if="initials" class="agent-avatar__initials" :data-initials="initials" />
    <AgentSeatIcon v-else class="agent-avatar__icon" />
    <span class="agent-avatar__light" />
  </span>
</template>

<style scoped>
.agent-avatar {
  --agent-avatar-size: 28px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--agent-avatar-size);
  height: var(--agent-avatar-size);
  border-radius: 8px;
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
  /* Plex in every language, so that the letters look alike; a Chinese character falls back to the language's font. */
  font-family: 'IBM Plex Sans', var(--app-font-sans);
  /* Drawn to the square, not to the type scale, and so the same in every language: 43% of its side (12 px of
     28, 15 of 36), half of the small one's (10 of 20), which 43% would take under 9. */
  font-size: calc(var(--agent-avatar-size) * 0.43);
  font-weight: var(--app-weight-strong);
  line-height: 1;
  letter-spacing: 0;
  vertical-align: middle;
  user-select: none;
}
.agent-avatar.is-small {
  --agent-avatar-size: 20px;
  border-radius: 6px;
  font-size: calc(var(--agent-avatar-size) / 2);
}
.agent-avatar.is-large {
  --agent-avatar-size: 36px;
  border-radius: 10px;
}
.agent-avatar__initials::before {
  content: attr(data-initials);
}
.agent-avatar__icon {
  font-size: 0.6em;
  width: 60%;
  height: 60%;
}
/* The light: 6 px (5 at the small size), ringed in what it stands on, so that it sits on the corner. */
.agent-avatar__light {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-light);
  box-shadow: 0 0 0 1.5px var(--agent-avatar-ring, var(--el-bg-color));
}
.agent-avatar.is-small .agent-avatar__light {
  width: 5px;
  height: 5px;
  top: -1.5px;
  right: -1.5px;
}
.agent-avatar.is-large .agent-avatar__light {
  width: 7px;
  height: 7px;
}
</style>
