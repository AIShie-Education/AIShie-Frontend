<script setup lang="ts">
// Hosting one of the caller's agents on the school's runtime, by its id
// (runtime-hosting-api.md): the wizard's first step, "Agent", before "Model
// and key" (ModelKeyDialog). Opened from an agent's page, the agent is that
// one; from My agents, the caller picks one of theirs that Core hosts
// runtime, is active, and is not hosted here yet (agent.list, and the
// runtime's own list). An agent with MCP access is never offered: it is its
// owner's tools', and the runtime refuses it.
//
// The agent chosen is inspected (POST /agents/inspect: nothing is written):
// how many courses it is in, whether the runtime may host it and why not,
// and whether it is hosted here already. Hosting it (POST /agents with its
// id) makes its row without a model, needs_model: the runtime is issued the
// agent's token by itself once it has one. Nobody hands over, sees or
// pastes a token here.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ApiError, read } from '@/api/http'
import { isRuntimeError, runtime } from '@/api/runtime'
import type { HostedAgent, InspectAnswer } from '@/api/runtime-types'
import type { AgentSummary } from '@/api/types'
import { hostingOf } from '@/utils/agents'
import { hostingErrorText } from './hosting'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  /** The agent to host, when opened from its page; the caller picks one otherwise. */
  actorId?: string | null
  /** Its name, when given. */
  name?: string
  /** The next step may be the school's plan (features.school_key). */
  school?: boolean
}>()
const emit = defineEmits<{
  /** Hosted: the agent's row (needs_model), and which of the caller's agents it is. */
  hosted: [agent: HostedAgent, actorId: string]
}>()
const { t } = useI18n()

const fixed = computed(() => (props.actorId ? props.actorId.toLowerCase() : null))
const chosen = ref('')
const agentId = computed(() => fixed.value ?? (chosen.value || null))

// --- The caller's agents that could be hosted, when one is to be picked ----------------
const candidates = shallowRef<AgentSummary[] | null>(null)
const loadError = shallowRef<unknown>(null)
const loading = ref(false)

async function loadCandidates() {
  loading.value = true
  loadError.value = null
  try {
    const [mine, hosted] = await Promise.all([read('agent.list', {}), runtime.list()])
    const here = new Set(hosted.data.agents.map((a) => a.core_actor_id.toLowerCase()))
    candidates.value = (mine.agents ?? []).filter(
      (a) => hostingOf(a.hosting) === 'runtime' && a.status === 'active' && !here.has(a.actor_id.toLowerCase()),
    )
    if (candidates.value.length === 1) chosen.value = candidates.value[0].actor_id
  } catch (e) {
    loadError.value = e
  } finally {
    loading.value = false
  }
}

// --- What the runtime says of the agent chosen --------------------------------------------
const inspected = shallowRef<InspectAnswer | null>(null)
const inspecting = ref(false)
const error = shallowRef<unknown>(null)
let asked = 0

/** Asks the runtime about the agent; after a refusal to host it, the refusal stays said (keepError). */
async function inspect(id: string, keepError = false) {
  const mine = ++asked
  inspected.value = null
  if (!keepError) error.value = null
  inspecting.value = true
  try {
    const r = await runtime.inspect(id)
    if (mine === asked) inspected.value = r.data
  } catch (e) {
    if (mine === asked && !keepError) error.value = e
  } finally {
    if (mine === asked) inspecting.value = false
  }
}

watch(
  open,
  (v) => {
    if (!v) return
    chosen.value = ''
    inspected.value = null
    error.value = null
    candidates.value = null
    if (!fixed.value) void loadCandidates()
  },
  { immediate: true },
)
watch(
  [open, agentId],
  ([v, id]) => {
    if (v && id) void inspect(id)
    else {
      asked++
      inspected.value = null
      inspecting.value = false
    }
  },
  { immediate: true },
)

const agentName = computed(
  () =>
    props.name ||
    inspected.value?.display_name ||
    candidates.value?.find((a) => a.actor_id === chosen.value)?.display_name ||
    '',
)
const title = computed(() => (fixed.value ? t('hosting.host.titleNamed', { name: agentName.value }) : t('hosting.host.title')))
/** Hosted here already by the caller: nothing to do but open it. */
const already = computed(() => !!inspected.value?.hosted?.by_you)
/** Why the runtime will not host it, in words; '' when it will. */
const refusal = computed(() => {
  const i = inspected.value
  if (!i || i.hostable) return ''
  return t(`hosting.errors.${i.reason ?? 'operator_agent'}`)
})
const pending = ref(false)
const canHost = computed(() => !!inspected.value && inspected.value.hostable && !already.value && !pending.value)

const errorText = computed(() => (error.value ? hostingErrorText(error.value, t, { notYours: true }) : ''))
const errorDetail = computed(() => (error.value instanceof ApiError ? error.value.message : ''))

async function go() {
  const id = agentId.value
  if (!id || !canHost.value) return
  pending.value = true
  error.value = null
  try {
    const r = await runtime.host(id)
    ElMessage({ type: 'success', message: t('hosting.host.done', { name: agentName.value || r.data.display_name }) })
    open.value = false
    emit('hosted', r.data, id)
  } catch (e) {
    error.value = e
    // What Core says of it may have changed (suspended, or not the caller's): ask again.
    if (isRuntimeError(e) && e.status !== 429) void inspect(id, true)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
    :close-on-press-escape="!pending"
    :show-close="!pending"
    class="host-dialog"
  >
    <el-steps :active="0" finish-status="success" simple class="host-dialog__steps">
      <el-step :title="t('hosting.host.steps.agent')" />
      <el-step :title="t('hosting.host.steps.model')" />
    </el-steps>

    <p class="host-dialog__body">{{ t(school ? 'hosting.host.bodySchool' : 'hosting.host.body') }}</p>

    <el-form v-if="!fixed" label-position="top" class="host-dialog__pick" @submit.prevent>
      <el-form-item :label="t('hosting.host.agent')" for="host-agent-pick">
        <div v-loading="loading" class="host-dialog__stack">
          <el-alert
            v-if="loadError"
            type="error"
            :closable="false"
            show-icon
            :title="hostingErrorText(loadError, t)"
          >
            <el-button size="small" @click="loadCandidates">{{ t('common.actions.retry') }}</el-button>
          </el-alert>
          <template v-else-if="candidates">
            <el-select
              v-if="candidates.length"
              id="host-agent-pick"
              v-model="chosen"
              class="host-dialog__select"
              :placeholder="t('hosting.host.agentPlaceholder')"
            >
              <el-option v-for="a in candidates" :key="a.actor_id" :value="a.actor_id" :label="a.display_name" />
            </el-select>
            <p v-else class="app-form-hint host-dialog__none">{{ t('hosting.host.none') }}</p>
          </template>
        </div>
      </el-form-item>
    </el-form>

    <div v-if="agentId" class="host-dialog__agent">
      <div v-if="inspecting" class="host-dialog__checking app-muted">
        <el-icon class="is-loading" aria-hidden="true"><Loading /></el-icon>
        <span>{{ t('hosting.host.checking') }}</span>
      </div>
      <template v-else-if="inspected">
        <p class="host-dialog__seats">{{ t('hosting.host.seats', { n: inspected.live_seats }, inspected.live_seats) }}</p>
        <el-alert
          v-if="already"
          type="success"
          :closable="false"
          show-icon
          :title="t('hosting.host.already')"
          class="host-dialog__alert host-dialog__already"
        >
          <router-link
            v-if="!fixed"
            :to="{ name: 'account-agent', params: { actorId: inspected.core_actor_id } }"
            @click="open = false"
          >
            {{ t('hosting.host.openIt') }}
          </router-link>
        </el-alert>
        <el-alert
          v-else-if="refusal"
          type="warning"
          :closable="false"
          show-icon
          :title="refusal"
          class="host-dialog__alert host-dialog__refusal"
        />
        <p v-else-if="inspected.hosted && !inspected.hosted.by_you" class="app-form-hint host-dialog__takes-over">
          {{ t('hosting.host.takesOver') }}
        </p>
      </template>
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon :title="errorText" class="host-dialog__alert">
      <details v-if="errorDetail" class="host-dialog__details">
        <summary>{{ t('hosting.errors.details') }}</summary>
        <p>{{ errorDetail }}</p>
      </details>
    </el-alert>

    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" class="host-dialog__submit" :loading="pending" :disabled="!canHost" @click="go">
        {{ t('hosting.host.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.host-dialog__steps {
  margin-bottom: 16px;
}
.host-dialog__body {
  margin: 0 0 12px;
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.host-dialog__stack {
  width: 100%;
  min-height: 32px;
}
.host-dialog__select {
  width: 100%;
}
.host-dialog__none {
  margin: 0;
}
.host-dialog__checking {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--app-text-sm);
}
.host-dialog__seats {
  margin: 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.host-dialog__takes-over {
  margin: 8px 0 0;
}
.host-dialog__alert {
  margin-top: 12px;
}
.host-dialog__details summary {
  cursor: pointer;
}
.host-dialog__details p {
  margin: 4px 0 0;
  word-break: break-word;
}
</style>
