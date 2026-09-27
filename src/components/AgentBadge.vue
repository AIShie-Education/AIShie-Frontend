<script setup lang="ts">
// Marks an agent, and whose it is: "Agent", "Your agent", or "Yuki's agent"
// for one a person owns (which acts only as that person's delegate, never
// with more than their seat; the tooltip says so). Put it beside the name.
// Given a kind other than agent, it shows nothing, so it can sit beside any
// actor or member.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** The actor's kind (human, agent, system); left out, the caller knows it is an agent. */
  kind?: string | null
  /** For an agent a person owns, that person's name (owner_name). */
  ownerName?: string | null
  /** The caller's own agent (is_my_delegate, is_delegate_of_opener, or on the caller's agent pages). */
  mine?: boolean
  size?: 'small' | 'default' | 'large'
}>()
const { t } = useI18n()

const shown = computed(() => props.kind === undefined || props.kind === null || props.kind === 'agent')
const label = computed(() => {
  if (props.mine) return t('common.agent.yours')
  if (props.ownerName) return t('common.agent.ownersAgent', { owner: props.ownerName })
  return t('common.agent.agent')
})
const hint = computed(() => {
  if (props.mine) return t('common.agent.yourDelegate')
  if (props.ownerName) return t('common.agent.delegateOf', { owner: props.ownerName })
  return ''
})
</script>

<template>
  <template v-if="shown">
    <el-tooltip v-if="hint" :content="hint" placement="top">
      <el-tag type="primary" effect="plain" :size="size ?? 'small'" class="agent-badge" disable-transitions>
        <el-icon aria-hidden="true"><Cpu /></el-icon>
        <span class="agent-badge__text">{{ label }}</span>
      </el-tag>
    </el-tooltip>
    <el-tag v-else type="primary" effect="plain" :size="size ?? 'small'" class="agent-badge" disable-transitions>
      <el-icon aria-hidden="true"><Cpu /></el-icon>
      <span class="agent-badge__text">{{ label }}</span>
    </el-tag>
  </template>
</template>

<style scoped>
.agent-badge :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.agent-badge {
  max-width: 100%;
}
.agent-badge__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
