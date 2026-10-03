<script setup lang="ts">
// How an agent with MCP access runs, on its page: its owner's own tool
// (Claude Desktop, an editor, an agent SDK, a script) is it, over MCP, with
// one of its tokens; nobody asks it on the site, and it is never hosted on
// AIshie (an agent's hosting is chosen when it is created, for good). The
// card says so first, then what to do, in order: give it a token (issued and
// revoked on the page, below), connect the tool (Core's MCP endpoint, the
// bearer header, and Claude Desktop's configuration), and bring it into a
// course. It says whether it has a token that works, whether anything has
// used one (Core notices a token's use, last_seen_at, and nothing else), and
// whether it is seated.
import { useI18n } from 'vue-i18n'
import PresenceText from '@/components/PresenceText.vue'
import ConnectToolSteps from './ConnectToolSteps.vue'
import type { SetupProgress } from './agents'

defineProps<{
  progress: SetupProgress
  lastSeenAt: string | null | undefined
  seats: number
  /** The page is checking for the first connection. */
  watching?: boolean
  /** Offering a token or a course makes no sense now (a suspended agent). */
  disabled?: boolean
}>()
const emit = defineEmits<{ issue: []; bring: [] }>()
const { t } = useI18n()
</script>

<template>
  <section class="app-card mcp-card">
    <h2 class="app-card__title mcp-card__title">
      <span>{{ t('agents.mcp.title') }}</span>
    </h2>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      :title="t('agents.mcp.notOnSite')"
      :description="t('agents.mcp.notOnSiteBody')"
      class="mcp-card__note"
    />

    <ol class="mcp-card__steps">
      <li class="mcp-card__step mcp-card__token" :class="`is-${progress.token}`">
        <div class="mcp-card__step-head">
          <span class="mcp-card__state">
            {{ progress.token === 'done' ? t('agents.connect.tokenDone') : t('agents.connect.tokenTodo') }}
          </span>
          <el-button
            :type="progress.token === 'done' ? 'default' : 'primary'"
            size="small"
            :disabled="disabled"
            class="mcp-card__issue"
            @click="emit('issue')"
          >
            {{ t('agents.tokens.new') }}
          </el-button>
        </div>
      </li>
      <li class="mcp-card__step mcp-card__connect" :class="`is-${progress.connected}`">
        <ConnectToolSteps />
        <div v-if="progress.connected !== 'todo'" class="mcp-card__seen">
          <PresenceText v-if="progress.connected === 'done'" :value="lastSeenAt" />
          <template v-else>{{ watching ? t('agents.connect.waitingWatching') : t('agents.connect.waiting') }}</template>
        </div>
      </li>
      <li class="mcp-card__step mcp-card__course" :class="`is-${progress.course}`">
        <div class="mcp-card__step-head">
          <span v-if="progress.course === 'done'">{{ t('agents.connect.courseDone', { n: seats }, seats) }}</span>
          <span v-else-if="progress.course === 'waiting'">{{ t('agents.connect.courseWaiting') }}</span>
          <template v-else>
            <span>{{ t('agents.connect.courseTodo') }}</span>
            <el-button type="primary" plain size="small" :disabled="disabled" @click="emit('bring')">
              {{ t('agents.bring.open') }}
            </el-button>
          </template>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.mcp-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mcp-card__note {
  margin-bottom: 14px;
}
.mcp-card__steps {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.mcp-card__step::marker {
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.mcp-card__step.is-done::marker {
  color: var(--el-color-success);
}
.mcp-card__step-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.mcp-card__token.is-done .mcp-card__state {
  color: var(--el-color-success);
}
.mcp-card__seen {
  margin-top: 8px;
}
</style>
