<script setup lang="ts">
// "Connect a runtime": what an agent registered here still needs in order to
// work, as a checklist that fills in by itself. An agent is only an identity
// here; what thinks and answers runs elsewhere (a runtime), and connects to
// Core's MCP endpoint with one of the agent's tokens. Core notices a token's
// use (last_seen_at) and nothing else, so "connected" means a token has been
// used.
//
// Running a runtime oneself is shown two ways: the agent file the AIShie
// Agent Runtime reads, with the token in the secret it names; and, for any
// other runtime or MCP client, the endpoint it connects to with the token.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CORE_ORIGIN, MCP_ENDPOINT } from '@/api/http'
import PresenceText from '@/components/PresenceText.vue'
import CopyBlock from './CopyBlock.vue'
import { runtimeAgentFile, type SetupProgress, type StepState } from './agents'

const props = defineProps<{
  /** The agent's name and actor id, for the agent file. */
  name: string
  actorId: string
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

const file = computed(() => runtimeAgentFile({ coreUrl: CORE_ORIGIN, name: props.name, actorId: props.actorId }))
const fileHint = computed(() =>
  t('agents.connect.agentFileHint', { file: file.value.tokenFile, variable: file.value.tokenVar }),
)
const allDone = computed(() => Object.values(props.progress).every((s) => s === 'done'))

const ICON: Record<StepState, string> = { done: 'CircleCheckFilled', waiting: 'Clock', todo: 'Remove' }
</script>

<template>
  <section class="app-card connect-card" :class="{ 'is-done': allDone }">
    <h2 class="app-card__title">{{ t('agents.connect.title') }}</h2>
    <p class="connect-card__intro">{{ t('agents.connect.intro') }}</p>

    <ol class="connect-steps">
      <li class="connect-step" :class="`is-${progress.token}`">
        <el-icon :size="20" class="connect-step__icon"><component :is="ICON[progress.token]" /></el-icon>
        <div class="connect-step__body">
          <div class="connect-step__title">{{ t('agents.connect.step.token') }}</div>
          <div class="connect-step__text">
            {{ progress.token === 'done' ? t('agents.connect.tokenDone') : t('agents.connect.tokenTodo') }}
          </div>
          <el-button
            v-if="progress.token !== 'done'"
            type="primary"
            size="small"
            :disabled="disabled"
            class="connect-step__action"
            @click="emit('issue')"
          >
            {{ t('agents.tokens.new') }}
          </el-button>
        </div>
      </li>
      <li class="connect-step" :class="`is-${progress.connected}`">
        <el-icon :size="20" class="connect-step__icon"><component :is="ICON[progress.connected]" /></el-icon>
        <div class="connect-step__body">
          <div class="connect-step__title">{{ t('agents.connect.step.runtime') }}</div>
          <div class="connect-step__text">
            <template v-if="progress.connected === 'done'">
              <PresenceText :value="lastSeenAt" />
            </template>
            <template v-else-if="progress.connected === 'waiting'">
              {{ watching ? t('agents.connect.waitingWatching') : t('agents.connect.waiting') }}
            </template>
            <template v-else>{{ t('agents.connect.runtimeTodo') }}</template>
          </div>
          <div v-if="progress.connected !== 'done'" class="connect-step__copy">
            <CopyBlock :text="file.yaml" :label="t('agents.connect.agentFile')" />
            <p class="app-form-hint connect-step__hint">{{ fileHint }}</p>
            <CopyBlock :text="MCP_ENDPOINT" :label="t('agents.connect.endpoint')" inline />
            <p class="app-form-hint connect-step__hint">{{ t('agents.connect.endpointHint') }}</p>
          </div>
        </div>
      </li>
      <li class="connect-step" :class="`is-${progress.course}`">
        <el-icon :size="20" class="connect-step__icon"><component :is="ICON[progress.course]" /></el-icon>
        <div class="connect-step__body">
          <div class="connect-step__title">{{ t('agents.connect.step.course') }}</div>
          <div class="connect-step__text">
            <template v-if="progress.course === 'done'">{{
              t('agents.connect.courseDone', { n: seats }, seats)
            }}</template>
            <template v-else-if="progress.course === 'waiting'">{{ t('agents.connect.courseWaiting') }}</template>
            <template v-else>{{ t('agents.connect.courseTodo') }}</template>
          </div>
          <el-button
            v-if="progress.course === 'todo'"
            type="primary"
            plain
            size="small"
            :disabled="disabled"
            class="connect-step__action"
            @click="emit('bring')"
          >
            {{ t('agents.bring.open') }}
          </el-button>
        </div>
      </li>
    </ol>

    <details v-if="progress.connected === 'done'" class="connect-card__again">
      <summary>{{ t('agents.connect.showSettings') }}</summary>
      <CopyBlock :text="file.yaml" :label="t('agents.connect.agentFile')" class="connect-card__block" />
      <p class="app-form-hint connect-card__hint">{{ fileHint }}</p>
      <CopyBlock :text="MCP_ENDPOINT" :label="t('agents.connect.endpoint')" inline class="connect-card__block" />
      <p class="app-form-hint connect-card__hint">{{ t('agents.connect.endpointHint') }}</p>
    </details>
  </section>
</template>

<style scoped>
.connect-card.is-done {
  border-color: var(--el-color-success-light-5);
}
.connect-card__intro {
  margin: -4px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.connect-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.connect-step {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.connect-step__icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--el-text-color-placeholder);
}
.connect-step.is-done .connect-step__icon {
  color: var(--el-color-success);
}
.connect-step.is-waiting .connect-step__icon {
  color: var(--el-color-warning);
}
.connect-step__body {
  flex: 1;
  min-width: 0;
}
.connect-step__title {
  font-weight: 600;
}
.connect-step.is-done .connect-step__title {
  color: var(--el-text-color-regular);
}
.connect-step__text {
  margin-top: 2px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.connect-step__action {
  margin-top: 8px;
}
.connect-step__copy {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
.connect-step__hint {
  margin: -4px 0 0;
}
.connect-card__again {
  margin-top: 16px;
  font-size: 13px;
}
.connect-card__again summary {
  cursor: pointer;
  color: var(--el-color-primary);
}
.connect-card__block {
  margin-top: 10px;
}
.connect-card__hint {
  margin: 6px 0 0;
}
</style>
