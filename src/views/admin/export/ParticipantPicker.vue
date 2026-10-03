<script setup lang="ts">
// Choosing whose conversations alone are exported (participant_actor_id):
// the person who asked in them, or the agent that answered. A platform
// administrator finds anyone, person or agent, by a piece of their name,
// email or login ID (actor.list), or by a pasted ID (actor.get). A
// department's administrator has no directory: they find a person by their
// whole email or login ID (actor.lookup_by_email), and an agent, or anyone,
// by a pasted actor ID, which Core checks when the export is asked for.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, read } from '@/api/http'
import type { Actor } from '@/api/types'
import { errorMessage } from '@/composables/useErrors'
import { isUuid, shortId } from '@/utils/format'
import { isLoginId } from '@/utils/loginId'
import AgentBadge from '@/components/AgentBadge.vue'
import StatusTag from '@/components/StatusTag.vue'
import { EMAIL_RE } from '../components/adminShared'
import { probeActorList, useActorSearch } from '../components/actorSearch'

const model = defineModel<string>({ required: true })
/** Who was chosen, in words, for what the page says of the export. */
const label = defineModel<string>('label', { default: '' })
const props = defineProps<{ id?: string; disabled?: boolean; platform: boolean }>()
const { t } = useI18n()
const inputId = props.id ?? `participant-${useId()}`

// --- A platform administrator: the directory --------------------------------------------------

const directory = useActorSearch()
if (props.platform) void probeActorList()
const idOnly = computed(() => directory.hasActorList.value === false)
/** The one chosen, kept among the options whatever is searched next, so that the box keeps showing them. */
const picked = ref<Actor | null>(null)
const options = computed(() => {
  const list = directory.options.value
  const p = picked.value
  return p && p.id === model.value && !list.some((a) => a.id === p.id) ? [p, ...list] : list
})

function pickActor(id: string | undefined) {
  const a = (id && options.value.find((x) => x.id === id)) || null
  picked.value = a
  model.value = a?.id ?? ''
  label.value = a ? a.display_name : ''
}

const contact = (a: Actor) => a.email ?? a.login_id ?? ''

// --- A department's administrator: a whole email or login ID, or an ID --------------------------

const typed = ref('')
const finding = ref(false)
const findError = ref<string | null>(null)
/** Who was found, as the line under the box shows them. */
const found = ref<{ id: string; name: string; kind: string | null; status: string | null; by: string } | null>(null)
let finds = 0

// Someone chosen before (the form shown again after a reload) is shown by the words kept for them.
if (model.value && label.value) {
  if (props.platform) picked.value = { id: model.value, display_name: label.value, kind: '', status: 'active' } as Actor
  else found.value = { id: model.value, name: label.value, kind: null, status: null, by: '' }
}

async function find() {
  const v = typed.value.trim()
  findError.value = null
  if (!v) return
  if (isUuid(v)) {
    // Anyone by their ID, an agent too: Core says when the export is asked for if there is nobody.
    choose({ id: v.toLowerCase(), name: '', kind: null, status: null, by: v.toLowerCase() })
    return
  }
  const byEmail = EMAIL_RE.test(v)
  if (!byEmail && !isLoginId(v)) {
    findError.value = t('auditExport.participant.invalid')
    return
  }
  const mine = ++finds
  finding.value = true
  try {
    const p = await read('actor.lookup_by_email', byEmail ? { email: v } : { login_id: v })
    if (mine !== finds) return
    choose({ id: p.actor_id, name: p.display_name, kind: p.kind, status: p.status, by: v })
  } catch (e) {
    if (mine !== finds) return
    findError.value =
      e instanceof ApiError && e.isNotFound ? t('auditExport.participant.notFound', { who: v }) : errorMessage(e)
  } finally {
    if (mine === finds) finding.value = false
  }
}

function choose(who: NonNullable<typeof found.value>) {
  found.value = who
  model.value = who.id
  label.value = who.name
    ? t('common.aside', { text: who.name, aside: who.by })
    : t('auditExport.participant.byId', { id: who.id })
  typed.value = ''
}

function clear() {
  finds++
  finding.value = false
  found.value = null
  findError.value = null
  picked.value = null
  model.value = ''
  label.value = ''
}

defineExpose({ clear })
</script>

<template>
  <div class="participant-picker">
    <template v-if="platform">
      <el-select
        :id="inputId"
        :model-value="model || undefined"
        filterable
        remote
        remote-show-suffix
        clearable
        fit-input-width
        :remote-method="directory.search"
        :loading="directory.searching.value"
        :disabled="disabled"
        :placeholder="idOnly ? t('auditExport.participant.placeholderId') : t('auditExport.participant.placeholder')"
        class="participant-picker__select"
        @update:model-value="pickActor"
        @visible-change="directory.onVisible"
      >
        <el-option v-for="a in options" :key="a.id" :value="a.id" :label="a.display_name">
          <div class="participant-picker__option">
            <span class="participant-picker__name">
              <span>{{ a.display_name }}</span>
              <AgentBadge :kind="a.kind" :owner-name="a.owner_name" size="small" />
            </span>
            <span class="participant-picker__meta">
              <StatusTag v-if="a.status !== 'active'" vocab="actorStatus" :value="a.status" />
              <span v-if="contact(a)">{{ contact(a) }}</span>
              <code class="app-mono participant-picker__id">{{ shortId(a.id) }}</code>
            </span>
          </div>
        </el-option>
        <template #empty>
          <div class="participant-picker__empty">
            <template v-if="directory.searching.value">{{ t('common.labels.loading') }}</template>
            <template v-else>{{
              directory.error.value ??
              (idOnly ? t('auditExport.participant.pasteId') : t('auditExport.participant.noMatch'))
            }}</template>
          </div>
        </template>
      </el-select>
    </template>

    <template v-else>
      <!-- Not a form of its own: it is inside the export's, and Enter here finds, never exports. -->
      <div v-if="!model" class="participant-picker__find">
        <el-input
          :id="inputId"
          v-model="typed"
          name="participant"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :disabled="disabled"
          :placeholder="t('auditExport.participant.lookupPlaceholder')"
          class="participant-picker__input"
          @keydown.enter.prevent="find"
        />
        <el-button :loading="finding" :disabled="disabled || !typed.trim()" @click="find">
          <el-icon><Search /></el-icon>
          <span>{{ t('auditExport.participant.find') }}</span>
        </el-button>
      </div>
      <div v-else class="participant-picker__chosen">
        <span class="participant-picker__who">
          <template v-if="found?.name">
            <strong>{{ found.name }}</strong>
            <AgentBadge v-if="found.kind" :kind="found.kind" size="small" />
            <span class="app-muted">{{ found.by }}</span>
          </template>
          <template v-else>
            <span>{{ t('auditExport.participant.byIdShort') }}</span>
            <code class="app-mono">{{ model }}</code>
          </template>
        </span>
        <el-button
          link
          type="primary"
          :disabled="disabled"
          :aria-label="t('auditExport.participant.clear')"
          @click="clear"
        >
          {{ t('auditExport.participant.clear') }}
        </el-button>
      </div>
      <div v-if="findError" class="participant-picker__error" role="alert">{{ findError }}</div>
    </template>
  </div>
</template>

<style scoped>
.participant-picker,
.participant-picker__select {
  width: 100%;
}
.participant-picker__option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.participant-picker__name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.participant-picker__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 55%;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.participant-picker__id {
  font-size: 11px;
}
.participant-picker__empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.participant-picker__find {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}
.participant-picker__input {
  flex: 1 1 240px;
  min-width: 0;
}
.participant-picker__chosen {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-lighter);
}
.participant-picker__who {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  overflow-wrap: anywhere;
}
.participant-picker__error {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-color-danger);
}
@media (max-width: 640px) {
  .participant-picker__meta code {
    display: none;
  }
}
</style>
