<script setup lang="ts">
// Whom the caller may ask here (conversation.respondents): the course's
// agents, their own agents, anyone who can see and do nothing they cannot.
// Each says whether it is running (for an agent), and how its answers arrive
// when that is not at once.
import { useI18n } from 'vue-i18n'
import type { Respondent } from '@/api/types'
import AgentBadge from '@/components/AgentBadge.vue'
import AsyncState from '@/components/AsyncState.vue'
import PresenceText from '@/components/PresenceText.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useNow } from '@/composables/useNow'
import { availabilityOf } from '../chat'
import { useRespondents } from '../useConversationList'

const props = defineProps<{ courseId: string; enabled?: boolean }>()
const emit = defineEmits<{ start: [respondent: Respondent] }>()
const { t } = useI18n()
const now = useNow()

// TODO(answers_course): once Core records on the seat whether an agent is a
// course agent (students may ask it) or a personal assistant (answers only its
// owner), and conversation.respondents says so, label each agent here with
// <StatusTag vocab="seatPurpose"> and list course agents apart from the
// caller's own. Until then is_my_delegate is all that tells them apart.
const list = useRespondents({ courseId: props.courseId, enabled: () => props.enabled !== false })
const offline = (r: Respondent) => {
  const a = availabilityOf(r, now.value)
  return a === 'never' || a === 'offline'
}
defineExpose({ refresh: list.refresh })
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
        <button type="button" class="resp-row" @click="emit('start', r)">
          <span class="resp-row__icon" aria-hidden="true">
            <el-icon :size="18"><Cpu v-if="r.kind === 'agent'" /><User v-else /></el-icon>
          </span>
          <span class="resp-row__main">
            <span class="resp-row__line">
              <span class="resp-row__name">{{ r.display_name }}</span>
              <AgentBadge
                v-if="r.kind === 'agent'"
                :kind="r.kind"
                :owner-name="r.owner_name"
                :mine="r.is_my_delegate"
              />
              <StatusTag v-else vocab="role" :value="r.role" />
            </span>
            <span class="resp-row__line resp-row__facts">
              <PresenceText v-if="r.kind === 'agent'" :value="r.last_seen_at" />
              <StatusTag v-if="r.answer_level !== 'autonomous'" vocab="answerLevel" :value="r.answer_level" />
            </span>
            <span v-if="r.kind === 'agent' && offline(r)" class="resp-row__warn">
              {{ t('chat.respondents.offlineHint') }}
            </span>
          </span>
          <el-icon class="resp-row__go" aria-hidden="true"><ChatLineRound /></el-icon>
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
  border-radius: 8px;
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
.resp-row__warn {
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-color-warning-dark-2);
}
.resp-row__go {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
</style>
