<script setup lang="ts">
// An action's history from its own row: made (proposed, done or refused),
// decided, carried out or failed or cancelled, reviewed or escalated — and
// what it is still waiting for.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TimeText from '@/components/TimeText.vue'
import ActionActor from './ActionActor.vue'
import type { ActionRow } from './actionText'

const props = defineProps<{ action: ActionRow }>()
const { t } = useI18n()

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info'
interface Item {
  key: string
  tone: Tone
  hollow?: boolean
  icon: string
  /** A message key; {who} is filled with whoever it names. */
  text: string
  who?: { memberId?: string | null; actorId?: string | null }
  time?: string | null
}

const items = computed<Item[]>(() => {
  const a = props.action
  const out: Item[] = []
  const who = { memberId: a.member_id, actorId: a.actor_id }
  const proposal = a.authz_result === 'confirm_required'
  if (a.status === 'denied') {
    out.push({ key: 'made', tone: 'danger', icon: 'CircleClose', text: 'actions.timeline.refused', who, time: a.created_at })
    return out
  }
  if (proposal) {
    out.push({ key: 'made', tone: 'primary', icon: 'Promotion', text: 'actions.timeline.proposed', who, time: a.created_at })
  } else if (a.member_id) {
    out.push({ key: 'made', tone: 'primary', icon: 'Pointer', text: 'actions.timeline.requested', who, time: a.created_at })
  } else {
    out.push({ key: 'made', tone: 'primary', icon: 'Monitor', text: 'actions.timeline.requestedSystem', time: a.created_at })
  }

  if (a.decided_at || a.decided_by_member_id) {
    const rejected = a.status === 'rejected'
    out.push({
      key: 'decided',
      tone: rejected ? 'danger' : 'success',
      icon: rejected ? 'CloseBold' : 'Stamp',
      text: rejected ? 'actions.timeline.rejected' : 'actions.timeline.approved',
      who: { memberId: a.decided_by_member_id },
      time: a.decided_at,
    })
  }
  if (a.status === 'cancelled') {
    out.push({ key: 'cancelled', tone: 'warning', icon: 'RemoveFilled', text: 'actions.timeline.cancelled' })
  }
  if (a.executed_at) {
    out.push({ key: 'executed', tone: 'success', icon: 'CircleCheck', text: 'actions.timeline.executed', time: a.executed_at })
  }
  if (a.status === 'failed') {
    out.push({ key: 'failed', tone: 'danger', icon: 'CircleClose', text: 'actions.timeline.failed', time: a.decided_at ?? a.created_at })
  }
  if (a.reviewed_at && (a.review_state === 'reviewed' || a.review_state === 'escalated')) {
    const esc = a.review_state === 'escalated'
    out.push({
      key: 'reviewed',
      tone: esc ? 'warning' : 'success',
      icon: esc ? 'Warning' : 'View',
      text: esc ? 'actions.timeline.escalated' : 'actions.timeline.reviewed',
      who: { memberId: a.reviewed_by_member_id },
      time: a.reviewed_at,
    })
  }
  // What it still waits for.
  if (a.status === 'proposed') {
    out.push({ key: 'wait', tone: 'warning', hollow: true, icon: 'Clock', text: 'actions.timeline.waitingDecision' })
  } else if (a.review_state === 'pending') {
    out.push({ key: 'wait', tone: 'warning', hollow: true, icon: 'Clock', text: 'actions.timeline.waitingReview' })
  } else if (a.review_state === 'escalated') {
    out.push({ key: 'wait', tone: 'warning', hollow: true, icon: 'Clock', text: 'actions.timeline.waitingSecond' })
  }
  return out
})
</script>

<template>
  <el-timeline class="action-timeline">
    <el-timeline-item
      v-for="it in items"
      :key="it.key"
      :type="it.tone"
      :hollow="it.hollow"
      :size="it.hollow ? 'normal' : 'large'"
      :icon="it.hollow ? undefined : it.icon"
    >
      <div class="action-timeline__item" :class="{ 'is-waiting': it.hollow }">
        <span class="action-timeline__text">
          <i18n-t v-if="it.who" :keypath="it.text" tag="span" scope="global" class="action-timeline__line">
            <template #who>
              <ActionActor v-if="it.who.memberId || it.who.actorId" :member-id="it.who.memberId" :actor-id="it.who.actorId" />
              <span v-else>{{ t('actions.timeline.someone') }}</span>
            </template>
          </i18n-t>
          <span v-else>{{ t(it.text) }}</span>
        </span>
        <span v-if="it.time" class="action-timeline__time"><TimeText :value="it.time" /></span>
      </div>
    </el-timeline-item>
  </el-timeline>
</template>

<style scoped>
.action-timeline {
  padding-left: 2px;
  margin: 0;
}
.action-timeline :deep(.el-timeline-item:last-child) {
  padding-bottom: 0;
}
.action-timeline__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.action-timeline__text {
  font-size: 14px;
}
.action-timeline__line {
  display: inline;
  line-height: 1.7;
}
.action-timeline__line :deep(.action-actor) {
  vertical-align: bottom;
}
.is-waiting .action-timeline__text {
  color: var(--el-color-warning);
}
.action-timeline__time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
