<script setup lang="ts">
// How one's own tool reaches an agent with MCP access: any MCP client
// (Claude Desktop, an editor, an agent SDK, a script) connects to Core's MCP
// endpoint (streamable HTTP) with one of the agent's tokens as a bearer token
// in the Authorization header. Claude Desktop is given an example
// configuration: its claude_desktop_config.json, reaching the endpoint
// through mcp-remote (which Claude Desktop runs with npx), the header taken
// from an environment variable so that the token stays out of the command
// line's arguments. No token is shown here: where one goes is named, unless
// the dialog that shows a new token once passes it in.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MCP_ENDPOINT } from '@/api/http'
import CopyBlock from './CopyBlock.vue'
import { claudeDesktopConfig } from './agents'

const props = defineProps<{
  /** A token just issued, shown once by the reveal dialog; otherwise where one goes is named. */
  token?: string
}>()
const emit = defineEmits<{ copied: [] }>()
const { t } = useI18n()

// Protocol strings, not prose: PLACEHOLDER is where one of the agent's tokens goes.
const PLACEHOLDER = '<token>'
const header = computed(() => `Authorization: Bearer ${props.token || PLACEHOLDER}`)
/** Claude Desktop's configuration, as JSON it reads (claude_desktop_config.json). */
const claudeDesktop = computed(() => claudeDesktopConfig(MCP_ENDPOINT, props.token || PLACEHOLDER))
</script>

<template>
  <div class="tool-steps">
    <p class="app-form-hint tool-steps__intro">{{ t('agents.connect.toolIntro') }}</p>
    <CopyBlock :text="MCP_ENDPOINT" :label="t('agents.connect.endpoint')" inline class="tool-steps__endpoint" />
    <CopyBlock
      :text="header"
      :label="t('agents.connect.header')"
      inline
      class="tool-steps__header"
      @copied="emit('copied')"
    />
    <p v-if="!token" class="app-form-hint tool-steps__hint">
      {{ t('agents.connect.headerHint', { placeholder: PLACEHOLDER }) }}
    </p>
    <details class="tool-steps__claude" :open="!!token">
      <summary>{{ t('agents.connect.claudeDesktop') }}</summary>
      <CopyBlock
        :text="claudeDesktop"
        :label="t('agents.connect.claudeDesktopFile')"
        class="tool-steps__claude-config"
        @copied="emit('copied')"
      />
      <p class="app-form-hint tool-steps__hint">
        {{
          token
            ? t('agents.connect.claudeDesktopHintToken')
            : t('agents.connect.claudeDesktopHint', { placeholder: PLACEHOLDER })
        }}
      </p>
    </details>
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
.tool-steps__claude {
  font-size: 13px;
}
.tool-steps__claude summary {
  cursor: pointer;
  color: var(--el-color-primary);
}
.tool-steps__claude-config {
  margin: 10px 0;
}
.tool-steps__claude .tool-steps__hint {
  margin: 0;
}
</style>
