<script setup lang="ts">
// The agents the caller may ask in a course (conversation.respondents): the
// course's agents first, then their own personal assistant. Never a person:
// conversations are with agents, and Core lists agents alone. Each says what it is to the caller, whether anything is running it, and how
// its answers arrive when that is not at once.
//
// An agent operated from an external tool takes no conversations in the
// site, and Core leaves it out. The caller's own such agents seated here are
// listed after the rest, with no way to ask them, saying why and what would
// change it: they would be looked for.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Respondent } from '@/api/types'
import AgentBadge from '@/components/AgentBadge.vue'
import AsyncState from '@/components/AsyncState.vue'
import HostingTag from '@/components/HostingTag.vue'
import PresenceText from '@/components/PresenceText.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useNow } from '@/composables/useNow'
import { useSessionStore } from '@/stores/session'
import { agentPurpose, availabilityOf } from './chat'
import { useChatSeat } from './seat'
import { useAgentsElsewhere, useRespondents } from './useConversationList'

const props = defineProps<{ courseId: string; enabled?: boolean }>()
const emit = defineEmits<{ pick: [agent: Respondent] }>()
const { t } = useI18n()
const now = useNow()
const seat = useChatSeat(() => props.courseId)
const session = useSessionStore()

// The course's agents first (useRespondents).
const list = useRespondents({ courseId: props.courseId, enabled: () => props.enabled !== false })
const offline = (r: Respondent) => {
  const a = availabilityOf(r, now.value)
  return a === 'never' || a === 'offline'
}

// Only a person owns agents.
const elsewhere = useAgentsElsewhere({
  courseId: props.courseId,
  myMemberId: () => seat.value.memberId,
  enabled: () => props.enabled !== false && session.me?.kind === 'human',
})
/** Those not offered, less any Core offers after all (it said so since agent.list was read). */
const notHere = computed(() => {
  const offered = new Set(list.items.value.map((r) => r.member_id))
  return elsewhere.items.value.filter((a) => !offered.has(a.memberId))
})

function refresh() {
  void elsewhere.refresh()
  return list.refresh()
}
defineExpose({ refresh })
</script>

<template>
  <AsyncState
    :loading="list.loading.value && !list.loaded.value"
    :error="list.error.value"
    :empty="list.loaded.value && !list.items.value.length && !notHere.length"
    :empty-text="t('chat.respondents.empty')"
    @retry="list.reload()"
  >
    <p v-if="!list.items.value.length" class="resp-list__none app-muted">{{ t('chat.respondents.empty') }}</p>
    <ul v-else class="resp-list">
      <li v-for="r in list.items.value" :key="r.member_id">
        <button type="button" class="resp-row" @click="emit('pick', r)">
          <span class="resp-row__icon" aria-hidden="true">
            <el-icon :size="18"><Cpu /></el-icon>
          </span>
          <span class="resp-row__main">
            <span class="resp-row__line">
              <span class="resp-row__name">{{ r.display_name }}</span>
              <AgentBadge :kind="r.kind" :owner-name="r.owner_name" :mine="r.is_my_delegate" />
              <StatusTag vocab="seatPurpose" :value="agentPurpose(r)" />
              <HostingTag :hosting="r.hosting" />
            </span>
            <span class="resp-row__line resp-row__facts">
              <PresenceText :value="r.last_seen_at" />
              <StatusTag v-if="r.answer_level !== 'autonomous'" vocab="answerLevel" :value="r.answer_level" />
            </span>
            <span v-if="!r.is_my_delegate" class="resp-row__note">{{ t('chat.respondents.sharedHint') }}</span>
            <span v-if="offline(r)" class="resp-row__warn">
              {{ t('chat.respondents.offlineHint') }}
            </span>
          </span>
          <el-icon class="resp-row__go" aria-hidden="true"><ArrowRight /></el-icon>
        </button>
      </li>
    </ul>
    <ul v-if="notHere.length" class="resp-list resp-list--elsewhere">
      <li v-for="a in notHere" :key="a.memberId">
        <div class="resp-row is-elsewhere">
          <span class="resp-row__icon" aria-hidden="true">
            <el-icon :size="18"><Cpu /></el-icon>
          </span>
          <span class="resp-row__main">
            <span class="resp-row__line">
              <span class="resp-row__name">{{ a.displayName }}</span>
              <AgentBadge mine />
              <StatusTag v-if="a.purpose" vocab="seatPurpose" :value="a.purpose" />
              <el-tag size="small" type="info" effect="plain" disable-transitions>
                {{ t('common.agent.external') }}
              </el-tag>
            </span>
            <span class="resp-row__note">{{ t('common.agent.externalNote') }}</span>
            <span class="resp-row__note">
              {{ t('common.agent.hostedTakesChat') }}
              <router-link :to="{ name: 'account-agent', params: { actorId: a.actorId } }">
                {{ t('chat.respondents.agentPage') }}
              </router-link>
            </span>
          </span>
        </div>
      </li>
    </ul>
  </AsyncState>
</template>

<style scoped>
.resp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.resp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-bg-color);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.resp-row:hover,
.resp-row:focus-visible {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.resp-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
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
  font-weight: 600;
  overflow-wrap: anywhere;
}
.resp-row__note {
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
.resp-row__warn {
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-color-warning-dark-2);
}
.resp-row__go {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.resp-list__none {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}
.resp-list--elsewhere {
  margin-top: 6px;
}
/* Not a button: nothing here asks it. */
.resp-row.is-elsewhere,
.resp-row.is-elsewhere:hover {
  align-items: flex-start;
  cursor: default;
  border-color: var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}
</style>
