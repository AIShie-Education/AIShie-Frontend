<script setup lang="ts">
// How an agent registered here runs. An agent is only an identity here;
// what thinks and answers runs elsewhere, and an agent has one brain at a
// time, so the card asks for one of three, in this order:
//
// 1. Host it on AIShie (hosting): the school's runtime runs it, on a model
//    and key the owner chooses; no token or file is ever shown. Offered only
//    where the runtime's API is there; its content is the hosted slot.
// 2. Connect another AI tool: any MCP client (Claude, ChatGPT, an agent SDK)
//    with Core's MCP endpoint and one of the agent's tokens in a header.
// 3. Run the AIShie runtime yourself (advanced): the agent file an operator
//    of their own runtime needs, folded away.
//
// For 2 and 3 the card also says whether the agent has a token and whether
// anything has used one (Core notices a token's use, last_seen_at, and
// nothing else). Whatever runs it, it can do nothing until it is in a course.
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import PresenceText from '@/components/PresenceText.vue'
import ConnectToolSteps from './ConnectToolSteps.vue'
import OwnRuntimeSteps from './OwnRuntimeSteps.vue'
import { type SetupProgress } from './agents'

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
  /** AIShie can host it: offer that first. */
  hosting?: boolean
}>()
const emit = defineEmits<{ issue: []; bring: [] }>()
const { t } = useI18n()

type Mode = 'hosted' | 'tool' | 'runtime'
const mode = ref<Mode>(props.hosting ? 'hosted' : 'tool')
watch(
  () => props.hosting,
  (h) => {
    if (h && mode.value === 'tool') mode.value = 'hosted'
    if (!h && mode.value === 'hosted') mode.value = 'tool'
  },
)
</script>

<template>
  <section class="app-card connect-card">
    <h2 class="app-card__title">{{ t('hosting.choice.title') }}</h2>
    <p class="connect-card__intro">{{ t('hosting.choice.intro') }}</p>

    <el-radio-group v-model="mode" class="connect-choices">
      <el-radio v-if="hosting" value="hosted" border class="connect-choice connect-choice--hosted">
        <span class="connect-choice__title">
          {{ t('hosting.choice.hosted') }}
          <el-tag type="success" size="small" disable-transitions>{{ t('hosting.choice.recommended') }}</el-tag>
        </span>
        <span class="connect-choice__hint">{{ t('hosting.choice.hostedHint') }}</span>
      </el-radio>
      <el-radio value="tool" border class="connect-choice connect-choice--tool">
        <span class="connect-choice__title">{{ t('hosting.choice.tool') }}</span>
        <span class="connect-choice__hint">{{ t('hosting.choice.toolHint') }}</span>
      </el-radio>
      <el-radio value="runtime" border class="connect-choice connect-choice--runtime">
        <span class="connect-choice__title">{{ t('hosting.choice.runtime') }}</span>
        <span class="connect-choice__hint">{{ t('hosting.choice.runtimeHint') }}</span>
      </el-radio>
    </el-radio-group>

    <div v-if="mode === 'hosted'" class="connect-card__pane connect-card__hosted">
      <slot name="hosted" />
    </div>
    <div v-else class="connect-card__pane">
      <ConnectToolSteps v-if="mode === 'tool'" />
      <OwnRuntimeSteps v-else :name="name" :actor-id="actorId" />

      <div class="connect-card__token">
        <span class="connect-card__state" :class="`is-${progress.token}`">
          {{ progress.token === 'done' ? t('agents.connect.tokenDone') : t('agents.connect.tokenTodo') }}
        </span>
        <el-button
          :type="progress.token === 'done' ? 'default' : 'primary'"
          size="small"
          :disabled="disabled"
          class="connect-card__issue"
          @click="emit('issue')"
        >
          {{ t('agents.tokens.new') }}
        </el-button>
      </div>
      <div v-if="progress.connected !== 'todo'" class="connect-card__seen">
        <PresenceText v-if="progress.connected === 'done'" :value="lastSeenAt" />
        <template v-else>{{ watching ? t('agents.connect.waitingWatching') : t('agents.connect.waiting') }}</template>
      </div>
    </div>

    <div class="connect-card__course" :class="`is-${progress.course}`">
      <span v-if="progress.course === 'done'">{{ t('agents.connect.courseDone', { n: seats }, seats) }}</span>
      <span v-else-if="progress.course === 'waiting'">{{ t('agents.connect.courseWaiting') }}</span>
      <template v-else>
        <span>{{ t('agents.connect.courseTodo') }}</span>
        <el-button type="primary" plain size="small" :disabled="disabled" @click="emit('bring')">
          {{ t('agents.bring.open') }}
        </el-button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.connect-card__intro {
  margin: -4px 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.connect-choices {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 16px;
}
.connect-choice {
  height: auto;
  margin: 0;
  padding: 10px 14px;
  align-items: flex-start;
  white-space: normal;
}
.connect-choice :deep(.el-radio__input) {
  margin-top: 3px;
}
.connect-choice :deep(.el-radio__label) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: normal;
}
.connect-choice__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.connect-choice--hosted .connect-choice__title {
  font-size: 15px;
}
.connect-choice__hint {
  font-size: 12px;
  line-height: 1.5;
  font-weight: normal;
  color: var(--el-text-color-secondary);
}
.connect-card__pane {
  margin-bottom: 12px;
}
.connect-card__token {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 14px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.connect-card__state.is-done {
  color: var(--el-color-success);
}
.connect-card__seen {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.connect-card__course {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
