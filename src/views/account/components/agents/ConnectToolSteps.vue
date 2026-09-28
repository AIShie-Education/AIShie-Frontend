<script setup lang="ts">
// "Connect another AI tool": any MCP client (Claude, ChatGPT, an agent SDK,
// a program of one's own) runs the agent with one of its tokens. All it
// needs is Core's MCP endpoint and the header that carries the token; for
// Claude's custom connector, one line says where each goes. No token is
// shown here: the header names where one goes, unless the dialog that shows
// a new token once passes it in.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MCP_ENDPOINT } from '@/api/http'
import CopyBlock from './CopyBlock.vue'

const props = defineProps<{
  /** A token just issued, shown once by the reveal dialog; otherwise the header names where one goes. */
  token?: string
}>()
const emit = defineEmits<{ copied: [] }>()
const { t } = useI18n()

// Protocol strings, not prose: PLACEHOLDER is where one of the agent's tokens goes.
const PLACEHOLDER = '<token>'
const header = computed(() => `Authorization: Bearer ${props.token || PLACEHOLDER}`)
</script>

<template>
  <div class="tool-steps">
    <p class="app-form-hint tool-steps__intro">{{ t('agents.connect.toolIntro') }}</p>
    <CopyBlock :text="MCP_ENDPOINT" :label="t('agents.connect.endpoint')" inline />
    <CopyBlock :text="header" :label="t('agents.connect.header')" inline @copied="emit('copied')" />
    <p v-if="!token" class="app-form-hint tool-steps__hint">
      {{ t('agents.connect.headerHint', { placeholder: PLACEHOLDER }) }}
    </p>
    <p class="app-form-hint tool-steps__hint tool-steps__claude">
      {{ t('agents.connect.claudeHint', { placeholder: PLACEHOLDER }) }}
    </p>
  </div>
</template>

<style scoped>
.tool-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tool-steps__intro {
  margin: 0;
}
.tool-steps__hint {
  margin: -4px 0 0;
}
</style>
