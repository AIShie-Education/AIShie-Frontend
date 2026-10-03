<script setup lang="ts">
// Whether an agent can be asked now, to those who ask it, in the chat's
// header (its list of agents says it by a dot, AskableDot, with these
// words): "Can be asked" while something runs it, "Paused"
// otherwise, in plain ink, with no dot of colour. An agent is not a person
// who is online: what it does is answer, or not just now. The tooltip says
// why, in the words the rest of the chat uses: paused or no longer in the
// course, not answering, or nothing running it since a time; after whose
// agent it is (`whose`), where its header has no room to say so. Inside a
// control (a row of the list of agents, a button), `hint-id` keeps it out of
// the tab order and puts the words in a hidden element of that id, for the
// control's aria-describedby.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNow } from '@/composables/useNow'
import { fromNow } from '@/utils/format'
import { availabilityOf } from './chat'

const props = defineProps<{
  who: { kind: string; last_seen_at?: string | null; answer_level?: string | null; seat_status?: string | null }
  /** The agent's name, for the tooltip. */
  name: string
  /** Whose agent it is ("Your agent"), said first in the tooltip. */
  whose?: string
  /** Inside a control: takes no focus, and says why in a hidden element of this id. */
  hintId?: string
}>()
const { t, locale } = useI18n()
const now = useNow()

const availability = computed(() => availabilityOf(props.who, now.value))
const askable = computed(() => availability.value === 'online' || availability.value === 'human')
const text = computed(() => (askable.value ? t('common.presence.askable') : t('common.presence.paused')))
const why = computed(() => {
  const a = availability.value
  switch (a) {
    case 'online':
    case 'human':
      return t('common.presence.askableHelp')
    case 'gone':
    case 'paused':
    case 'notAnswering':
      return t(`chat.availability.${a}`, { name: props.name })
    case 'never':
      return t('common.presence.neverHelp')
    default:
      // Recomputed as time passes and when the language changes.
      return (now.value, locale.value, t('common.presence.pausedSince', { time: fromNow(props.who.last_seen_at) }))
  }
})
const hint = computed(() =>
  props.whose ? t('common.presence.whose', { whose: props.whose, why: why.value }) : why.value,
)
</script>

<template>
  <el-tooltip :content="hint" placement="top">
    <span class="askable" :class="{ 'is-paused': !askable }" :tabindex="hintId ? undefined : 0">{{ text }}</span>
  </el-tooltip>
  <span v-if="hintId" :id="hintId" hidden>{{ hint }}</span>
</template>

<style scoped>
.askable {
  font-size: 13px;
  color: var(--app-ink-2);
  white-space: nowrap;
}
.askable.is-paused {
  color: var(--app-ink-3);
}
</style>
