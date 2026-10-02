<script setup lang="ts">
// Marks an agent beside its name: "AI" (AiBadge), and whose it is, "Your
// agent" or "Yuki's agent", for one a person owns (which acts only as that
// person's delegate, never with more than their seat; the tooltip says so).
// Whose it is is said quietly, in ink on an outline: an attribute, not a
// link or a state. Given a kind other than agent, it shows nothing, so it
// can sit beside any actor or member. Where the name beside it already
// carries the "AI" (MemberName with show-kind), `no-ai` leaves it out.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AiBadge from './AiBadge.vue'

const props = defineProps<{
  /** The actor's kind (human, agent, system); left out, the caller knows it is an agent. */
  kind?: string | null
  /** For an agent a person owns, that person's name (owner_name). */
  ownerName?: string | null
  /** The caller's own agent (is_my_delegate, is_delegate_of_opener, or on the caller's agent pages). */
  mine?: boolean
  size?: 'small' | 'default' | 'large'
  /** The "AI" is said beside the name already. */
  noAi?: boolean
  /** Inside a control: takes no focus, and says why in a hidden element of this id. */
  hintId?: string
}>()
const { t } = useI18n()

const shown = computed(() => props.kind === undefined || props.kind === null || props.kind === 'agent')
const owner = computed(() => {
  if (props.mine) return t('common.agent.yours')
  if (props.ownerName) return t('common.agent.ownersAgent', { owner: props.ownerName })
  return ''
})
const hint = computed(() => {
  if (props.mine) return t('common.agent.yourDelegate')
  if (props.ownerName) return t('common.agent.delegateOf', { owner: props.ownerName })
  return ''
})
</script>

<template>
  <span v-if="shown && (!noAi || owner)" class="agent-badge" :class="`is-${size ?? 'small'}`">
    <AiBadge v-if="!noAi" />
    <el-tooltip v-if="owner" :content="hint" placement="top">
      <span class="agent-badge__owner" :tabindex="hintId ? undefined : 0">{{ owner }}</span>
    </el-tooltip>
    <span v-if="hintId && hint" :id="hintId" hidden>{{ hint }}</span>
  </span>
</template>

<style scoped>
.agent-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  vertical-align: middle;
}
.agent-badge__owner {
  display: inline-block;
  box-sizing: border-box;
  height: 20px;
  min-width: 0;
  padding: 0 7px;
  border: 1px solid var(--app-line-strong);
  border-radius: 4px;
  color: var(--app-ink-2);
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-badge.is-default .agent-badge__owner,
.agent-badge.is-large .agent-badge__owner {
  height: 24px;
  padding: 0 9px;
  font-size: 13px;
  line-height: 22px;
}
</style>
