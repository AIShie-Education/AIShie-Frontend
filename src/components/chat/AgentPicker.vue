<script setup lang="ts">
// The agents the caller may ask in a course (conversation.respondents): the
// course's agents first, then their own personal assistant. Never a person:
// conversations are with agents, and Core lists agents alone. Each says
// whether it can be asked now (a dot before its name, AskableDot), whose it
// is and what it is to the caller (two chips at most: docs/CONVENTIONS.md,
// "Tags"; how it runs is its owner's concern, said on its own page), and how
// its answers arrive when that is not at once. Whose it is and what it is
// are said only where the rows differ in them: where every agent listed is
// the caller's own, or every one the course's, no row says so; and that the
// course's agents answer others too is said once over the list where two or
// more are listed, not under each. An agent with MCP access,
// or one the runtime does not run just now, is not listed: Core leaves it
// out, and its owner's page for it says why.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Respondent } from '@/api/types'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AgentBadge from '@/components/AgentBadge.vue'
import AgentName from '@/components/AgentName.vue'
import AskableDot from '@/components/AskableDot.vue'
import AsyncState from '@/components/AsyncState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useNow } from '@/composables/useNow'
import { agentPurpose, availabilityOf } from './chat'
import { useRespondents } from './useConversationList'

const props = defineProps<{ courseId: string; enabled?: boolean }>()
const emit = defineEmits<{ pick: [agent: Respondent] }>()
const { t } = useI18n()
const now = useNow()

// The course's agents first (useRespondents).
const list = useRespondents({ courseId: props.courseId, enabled: () => props.enabled !== false })
const offline = (r: Respondent) => {
  const a = availabilityOf(r, now.value)
  return a === 'never' || a === 'offline'
}

// A chip whose value is the same on every row is not shown (two rows or more: one row's says what it is).
/** Whose an agent is, as its badge says it: the caller's own, a person's, or nobody's. */
const whoseOf = (r: Respondent) => (r.is_my_delegate ? 'mine' : (r.owner_name ?? ''))
const differ = (of: (r: Respondent) => string) => {
  const items = list.items.value
  return items.length < 2 || new Set(items.map(of)).size > 1
}
const showWhose = computed(() => differ(whoseOf))
const showPurpose = computed(() => differ(agentPurpose))
/** Two or more of the course's agents listed: that they answer others too is said once, over the list. */
const sharedOnce = computed(() => list.items.value.filter((r) => agentPurpose(r) === 'course').length > 1)

function refresh() {
  return list.refresh()
}
defineExpose({ refresh })
</script>

<template>
  <AsyncState
    :loading="list.loading.value && !list.loaded.value"
    :error="list.error.value"
    :empty="list.loaded.value && !list.items.value.length"
    :empty-text="t('chat.respondents.empty')"
    @retry="list.reload()"
  >
    <p v-if="sharedOnce" class="resp-shared">{{ t('chat.respondents.sharedHintAll') }}</p>
    <ul class="resp-list">
      <li v-for="r in list.items.value" :key="r.member_id">
        <!--
          The row is the one control: what it holds takes no focus of its own, and what their
          tooltips say is the row's description (hidden elements of these ids).
        -->
        <button
          type="button"
          class="resp-row"
          :aria-describedby="
            showWhose ? `resp-${r.member_id}-ask resp-${r.member_id}-whose` : `resp-${r.member_id}-ask`
          "
          @click="emit('pick', r)"
        >
          <AgentAvatar :name="r.display_name" class="resp-row__avatar" />
          <span class="resp-row__main">
            <span class="resp-row__line">
              <AskableDot :who="r" :name="r.display_name" :hint-id="`resp-${r.member_id}-ask`" />
              <!-- The "AI" stays with the name's last word when the line wraps. -->
              <AgentName :name="r.display_name" class="resp-row__name" />
              <AgentBadge
                v-if="showWhose"
                :kind="r.kind"
                :owner-name="r.owner_name"
                :mine="r.is_my_delegate"
                no-ai
                :hint-id="`resp-${r.member_id}-whose`"
              />
              <StatusTag v-if="showPurpose" vocab="seatPurpose" :value="agentPurpose(r)" />
            </span>
            <span v-if="r.answer_level !== 'autonomous'" class="resp-row__line resp-row__facts">
              <StatusTag vocab="answerLevel" :value="r.answer_level" />
            </span>
            <span v-if="!sharedOnce && agentPurpose(r) === 'course'" class="resp-row__note">{{
              t('chat.respondents.sharedHint')
            }}</span>
            <span v-if="offline(r)" class="resp-row__warn">
              {{ t('chat.respondents.offlineHint') }}
            </span>
          </span>
          <el-icon class="resp-row__go" aria-hidden="true"><ArrowRight /></el-icon>
        </button>
      </li>
    </ul>
  </AsyncState>
</template>

<style scoped>
/* What is true of the course's agents listed, said once over them, in the second ink. */
.resp-shared {
  margin: 0 0 8px;
  max-width: var(--app-measure);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--app-ink-2);
}
/* The agents to ask: rows between rules, hovered in a tint, each ending in its ›. */
.resp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-bottom: var(--app-rule);
}
.resp-list > li {
  border-top: var(--app-rule);
}
.resp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.resp-row:hover {
  background: var(--el-fill-color-light);
}
.resp-row:focus-visible {
  outline-offset: -2px;
}
.resp-row__avatar {
  align-self: flex-start;
  margin-top: 1px;
}
.resp-row__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.resp-row__line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.resp-row__name {
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
/* A row's notes in the size, the leading and the ink of the note said once over the list: the same sentence
   (that a course agent may repeat what is written) looks the same whether one agent is listed or several. Not
   running, which wants its owner, keeps the wait colour. */
.resp-row__note,
.resp-row__warn {
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--app-ink-2);
}
.resp-row__warn {
  color: var(--el-color-warning-dark-2);
}
.resp-row__go {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
/* Not a button: nothing here asks it. */
</style>
