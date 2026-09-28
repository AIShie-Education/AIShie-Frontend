<script setup lang="ts">
// The one-brain warning (the contract's A.1). An agent has one brain at a
// time: whatever runs it answers every question, so two would answer twice.
// The runtime says, when a token is inspected or connected, which of the
// agent's other live tokens there are and whether one was used lately
// (other_tokens); before the page issues a token of its own, it works the
// same out from Core's list (otherTokensFrom).
//
// One used lately: the agent seems to run somewhere else, and the warning
// names the most recent, in the words A.1 suggests. Live but unused: a
// quieter note. Each can be revoked from here, as the agent's owner
// (agent.revoke_credential, found by its prefix among the agent's tokens);
// nothing is revoked unless asked. When nothing could be checked (Core
// would not list them), a muted line where the page asks for one, and
// otherwise nothing. The runtime refuses nothing for it, and neither does
// the page: the choice is the owner's.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { OtherTokens } from '@/api/runtime-types'
import TimeText from '@/components/TimeText.vue'
import { useUiStore } from '@/stores/ui'
import { fromNow } from '@/utils/format'
import { tokenHint } from './hosting'
import { ownerRevokeByPrefix } from './hostingFlow'

const props = defineProps<{
  actorId: string
  /** The agent's other live tokens; null when they could not be checked. */
  others: OtherTokens | null | undefined
  /** Say so when they could not be checked, rather than saying nothing. */
  sayUnknown?: boolean
  /** It can be put away (once the agent is connected). */
  closable?: boolean
}>()
const emit = defineEmits<{
  /** A token is revoked, or turned out not to work any more: leave it out from now on. */
  revoked: [prefix: string]
  /** Core's list of the agent's tokens should be read again. */
  credsChanged: []
  close: []
}>()
const { t } = useI18n()
const ui = useUiStore()

const busy = ref<string | null>(null)
const failed = ref<string[]>([])

const tokens = computed(() => props.others?.tokens ?? [])
const inUse = computed(() => !!props.others?.in_use && tokens.value.some((x) => x.recent))
/** The token the warning names: the most recently used (the list comes most recent first). */
const latest = computed(() => tokens.value.find((x) => x.recent))
// Recomputed when the language changes, so that "3 minutes ago" follows it.
const inUseText = computed(() => {
  void ui.locale
  const x = latest.value
  return x ? t('hosting.otherTokens.inUse', { token: tokenHint(x.prefix), ago: fromNow(x.last_used_at) }) : ''
})

async function revoke(prefix: string) {
  if (busy.value) return
  busy.value = prefix
  failed.value = failed.value.filter((p) => p !== prefix)
  try {
    const r = await ownerRevokeByPrefix(props.actorId, prefix)
    if (r === 'failed') {
      failed.value = [...failed.value, prefix]
      return
    }
    const words = r === 'revoked' ? 'hosting.otherTokens.revoked' : 'hosting.otherTokens.gone'
    ElMessage({ type: 'success', message: t(words, { token: tokenHint(prefix) }) })
    emit('revoked', prefix)
  } finally {
    busy.value = null
    emit('credsChanged')
  }
}
</script>

<template>
  <el-alert
    v-if="tokens.length"
    :type="inUse ? 'warning' : 'info'"
    :closable="closable"
    show-icon
    :title="inUse ? t('hosting.otherTokens.inUseTitle') : t('hosting.otherTokens.unusedTitle')"
    class="other-tokens"
    :class="inUse ? 'is-in-use' : 'is-unused'"
    @close="emit('close')"
  >
    <p class="other-tokens__body">{{ inUse ? inUseText : t('hosting.otherTokens.unused') }}</p>
    <ul class="other-tokens__list">
      <li v-for="x in tokens" :key="x.prefix" class="other-tokens__token">
        <code>{{ tokenHint(x.prefix) }}</code>
        <span class="other-tokens__label">{{ x.label?.trim() || t('hosting.otherTokens.unlabelled') }}</span>
        <el-tag v-if="x.recent" type="warning" size="small" disable-transitions>{{ t('hosting.otherTokens.recent') }}</el-tag>
        <span class="other-tokens__used">
          <template v-if="x.last_used_at">
            {{ t('hosting.otherTokens.lastUsed') }}
            <TimeText :value="x.last_used_at" relative />
          </template>
          <template v-else>{{ t('hosting.otherTokens.neverUsed') }}</template>
        </span>
        <el-button
          link
          type="danger"
          size="small"
          class="other-tokens__revoke"
          :loading="busy === x.prefix"
          :disabled="!!busy && busy !== x.prefix"
          @click="revoke(x.prefix)"
        >
          {{ t('hosting.otherTokens.revoke') }}
        </el-button>
        <span v-if="failed.includes(x.prefix)" class="other-tokens__failed">{{ t('hosting.otherTokens.revokeFailed') }}</span>
      </li>
    </ul>
  </el-alert>
  <p v-else-if="others === null && sayUnknown" class="app-muted other-tokens__unknown">
    {{ t('hosting.otherTokens.unknown') }}
  </p>
</template>

<style scoped>
.other-tokens__body {
  margin: 0 0 6px;
  line-height: 1.5;
}
.other-tokens__list {
  margin: 0;
  padding-left: 18px;
}
.other-tokens__token {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.other-tokens__token code {
  font-family: var(--app-font-mono);
}
.other-tokens__label {
  font-weight: 500;
}
.other-tokens__failed {
  flex-basis: 100%;
  color: var(--el-color-danger);
}
.other-tokens__unknown {
  margin: 12px 0 0;
  font-size: 12px;
}
</style>
