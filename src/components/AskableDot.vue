<script setup lang="ts">
// Whether an agent can be asked now, in a list of agents: a dot before its
// name (docs/CONVENTIONS.md, "Tags"), not a chip, so that a row keeps to its
// two. An agent is never "online" in green: the dot is the ink's, solid
// while it can be asked, a ring while it is paused, and amber only where
// AIshie does not run an agent hosted on it, which wants its owner. Its words
// are its accessible name and its tooltip; inside a control (a row that is
// a button), `hint-id` keeps it out of the tab order and puts the tooltip's
// words in a hidden element of that id, for the control's aria-describedby.
// Given either how the agent runs and whether the site runs it (`hosting`,
// `site-chat`: those who manage it), or the agent as one asks it (`who`:
// those who ask it); an agent with MCP access, never asked on the site, or
// one whose state is not known, has no dot.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { availabilityOf } from '@/components/chat/chat'
import { useNow } from '@/composables/useNow'
import { hostingOf } from '@/utils/agents'
import { fromNow } from '@/utils/format'

const props = defineProps<{
  hosting?: string | null
  siteChat?: boolean | null
  who?: { kind: string; last_seen_at?: string | null; answer_level?: string | null; seat_status?: string | null }
  /** The agent's name, for the tooltip of one asked (`who`). */
  name?: string
  hintId?: string
}>()
const { t, locale } = useI18n()
const now = useNow()

type DotState = 'on' | 'paused' | 'off'
const availability = computed(() => (props.who ? availabilityOf(props.who, now.value) : null))
const state = computed<DotState | null>(() => {
  const a = availability.value
  if (a) return a === 'online' || a === 'human' ? 'on' : 'paused'
  if (hostingOf(props.hosting) !== 'runtime' || typeof props.siteChat !== 'boolean') return null
  return props.siteChat ? 'on' : 'off'
})
const label = computed(() => {
  if (props.who) return state.value === 'on' ? t('common.presence.askable') : t('common.presence.paused')
  return state.value === 'on' ? t('common.agent.askable.on') : t('common.agent.askable.off')
})
/** Why, in the words the chat uses (as AskableText says it in the chat's header). */
const help = computed(() => {
  const a = availability.value
  if (!a) return state.value === 'on' ? t('common.agent.askable.onHelp') : t('common.agent.askable.offHelp')
  switch (a) {
    case 'online':
    case 'human':
      return t('common.presence.askableHelp')
    case 'gone':
    case 'paused':
    case 'notAnswering':
      return t(`chat.availability.${a}`, { name: props.name ?? '' })
    case 'never':
      return t('common.presence.neverHelp')
    default:
      // Recomputed as time passes and when the language changes.
      return (now.value, locale.value, t('common.presence.pausedSince', { time: fromNow(props.who?.last_seen_at) }))
  }
})
</script>

<template>
  <template v-if="state">
    <el-tooltip :content="help" placement="top">
      <span
        class="askable-dot"
        :class="`is-${state}`"
        role="img"
        :aria-label="label"
        :tabindex="hintId ? undefined : 0"
      />
    </el-tooltip>
    <span v-if="hintId" :id="hintId" hidden>{{ help }}</span>
  </template>
</template>

<style scoped>
.askable-dot {
  display: inline-block;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  vertical-align: middle;
  background: var(--app-ink-2);
  border: 1.5px solid var(--app-ink-2);
}
.askable-dot.is-paused {
  background: transparent;
  border-color: var(--app-ink-3);
}
.askable-dot.is-off {
  background: var(--app-wait-fg);
  border-color: var(--app-wait-fg);
}
</style>
