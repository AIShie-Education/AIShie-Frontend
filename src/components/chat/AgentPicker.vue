<script setup lang="ts">
// The agents the caller may ask in a course (conversation.respondents): the
// course's agents first, then their own personal assistant. Never a person:
// conversations are with agents, and Core lists agents alone. Each says what
// it is to the caller, how it runs (hosted on AIshie: only an agent the
// site's runtime runs now is listed), whether it can be asked now, and
// how its answers arrive when that is not at once. An agent with MCP access,
// or one the runtime does not run just now, is not listed: Core leaves it
// out, and its owner's page for it says why.
import { useI18n } from 'vue-i18n'
import type { Respondent } from '@/api/types'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AgentBadge from '@/components/AgentBadge.vue'
import AiBadge from '@/components/AiBadge.vue'
import AsyncState from '@/components/AsyncState.vue'
import HostingTag from '@/components/HostingTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useNow } from '@/composables/useNow'
import { agentPurpose, availabilityOf } from './chat'
import { useRespondents } from './useConversationList'
import AskableText from './AskableText.vue'

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
    <ul class="resp-list">
      <li v-for="r in list.items.value" :key="r.member_id">
        <button type="button" class="resp-row" @click="emit('pick', r)">
          <AgentAvatar :name="r.display_name" class="resp-row__avatar" />
          <span class="resp-row__main">
            <span class="resp-row__line">
              <!-- The "AI" stays with the name when the line wraps. -->
              <span class="resp-row__who"
                ><span class="resp-row__name">{{ r.display_name }}</span
                ><AiBadge class="resp-row__ai"
              /></span>
              <AgentBadge :kind="r.kind" :owner-name="r.owner_name" :mine="r.is_my_delegate" no-ai />
              <StatusTag vocab="seatPurpose" :value="agentPurpose(r)" />
              <HostingTag :hosting="r.hosting" />
            </span>
            <span class="resp-row__line resp-row__facts">
              <AskableText :who="r" :name="r.display_name" />
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
.resp-row__avatar {
  align-self: flex-start;
  margin-top: 1px;
}
/* The light's ring follows the row's ground as it is hovered. */
.resp-row:hover .resp-row__avatar,
.resp-row:focus-visible .resp-row__avatar {
  --agent-avatar-ring: var(--el-color-primary-light-9);
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
.resp-row__who {
  min-width: 0;
}
.resp-row__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.resp-row__ai {
  margin-left: 6px;
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
/* Not a button: nothing here asks it. */
</style>
