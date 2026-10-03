<script setup lang="ts">
// actor.register: a person or an agent. Only root may make an administrator.
// The kind and the platform role given here are theirs for good; the name, the
// email and a person's login ID (a student or staff number, which they sign in
// with as with an email) can be corrected later (actor.update, on their page). An agent may
// be given an owner, a person whose delegate alone it will be, only here: the
// owner is fixed when it is registered, and nobody changes it or takes it away
// afterwards; an agent registered without one stays nobody's. An agent with
// an owner holds no platform role, so the two are not offered together. How
// an agent runs (hosting) is asked too, with nothing chosen for the
// administrator, and is kept for good: hosted on AIshie, whose runtime alone
// is issued its token, or reached over MCP with tokens issued on its page.
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { Actor, AgentHosting } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import { formatDate } from '@/utils/format'
import { loginIdProblem, MAX_LOGIN_ID } from '@/utils/loginId'
import AppNote from '@/components/AppNote.vue'
import HostingChoice from '@/components/HostingChoice.vue'
import IdText from '@/components/IdText.vue'
import StatusTag from '@/components/StatusTag.vue'
import AgentSeatIcon from '@/components/AgentSeatIcon.vue'
import { hasActorList } from './actorSearch'
import { EMAIL_RE, type ActorRow, type RegisteredActor } from './adminShared'
import { findSameName, sameText } from './sameName'
import OwnerSelect from './OwnerSelect.vue'
import type { OwnerPick } from './owner'

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ registered: [actor: RegisteredActor, owner: OwnerPick | null] }>()
const { t } = useI18n()
const session = useSessionStore()

const formRef = ref<FormInstance>()
const form = reactive({
  kind: 'human' as 'human' | 'agent',
  display_name: '',
  email: '',
  login_id: '',
  admin: false,
  owner: '',
  hosting: '' as AgentHosting | '',
})
/** The person chosen to own the agent, for what the page says next. */
const owner = ref<Actor | null>(null)
const { run, pending } = useWrite('actor.register')
/** An agent given an owner holds no platform role (Core refuses the pair). */
const owned = computed(() => form.kind === 'agent' && !!form.owner)
watch(owned, (v) => {
  if (v) form.admin = false
})
/** Those already registered under the name typed (see below). */
const sameName = ref<ActorRow[]>([])
/** The name whose check stopped short of all its matches, and how many it read. */
const sameNameUnchecked = ref<{ name: string; checked: number } | null>(null)

watch(
  open,
  (v) => {
    if (!v) return
    form.kind = 'human'
    form.display_name = ''
    form.email = ''
    form.login_id = ''
    form.admin = false
    form.owner = ''
    form.hosting = ''
    owner.value = null
    sameName.value = []
    sameNameUnchecked.value = null
  },
  { immediate: true },
)

// --- Someone of the same name ---------------------------------------------------
// Two actors may share a name, and then only their IDs tell them apart (two
// agents both called "Claude", say). Registering such a name is allowed, but
// the form says who has it already, a moment after typing stops (see
// sameName.ts). On a Core without the directory (actor.list) there is nobody
// to compare with.
let lookup: ReturnType<typeof setTimeout> | undefined
let asked = 0
watch(
  () => form.display_name,
  (typed) => {
    clearTimeout(lookup)
    const name = typed.trim()
    const mine = ++asked
    const stale = () => mine !== asked
    sameName.value = sameName.value.filter((a) => sameText(a.display_name, name))
    if (sameNameUnchecked.value && !sameText(sameNameUnchecked.value.name, name)) sameNameUnchecked.value = null
    if (!name || hasActorList.value === false) return
    lookup = setTimeout(async () => {
      try {
        const out = await findSameName(name, { stale, found: (actors) => (sameName.value = actors) })
        if (!out) return
        sameName.value = out.actors
        sameNameUnchecked.value = out.complete ? null : { name, checked: out.checked }
      } catch {
        /* no directory, or no answer: nothing to warn about */
        if (stale()) return
        sameName.value = []
        sameNameUnchecked.value = null
      }
    }, 400)
  },
)
onScopeDispose(() => {
  clearTimeout(lookup)
  asked++ // a check under way stops at its next page
})

const rules = computed<FormRules>(() => ({
  display_name: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        v && v.trim() ? cb() : cb(new Error(t('common.errors.required'))),
      trigger: 'blur',
    },
  ],
  email: [
    {
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        !v || !v.trim() || EMAIL_RE.test(v.trim()) ? cb() : cb(new Error(t('common.errors.invalidEmail'))),
      trigger: 'blur',
    },
  ],
  hosting: [
    {
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        form.kind !== 'agent' || v ? cb() : cb(new Error(t('common.agent.hosting.required'))),
      trigger: 'change',
    },
  ],
  login_id: [
    {
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        const p = loginIdProblem(v)
        return !p || p === 'empty' ? cb() : cb(new Error(t(`admin.loginId.problem.${p}`, { n: MAX_LOGIN_ID })))
      },
      trigger: 'blur',
    },
  ],
}))

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  const display_name = form.display_name.trim()
  const email = form.kind === 'human' && form.email.trim() ? form.email.trim() : null
  const login_id = form.kind === 'human' && form.login_id.trim() ? form.login_id.trim() : null
  const platform_role = form.admin && session.isRoot ? 'admin' : null
  const ownerId = form.kind === 'agent' && form.owner ? form.owner : null
  const hosting = form.kind === 'agent' && form.hosting ? form.hosting : null
  if (form.kind === 'agent' && !hosting) return
  const ownerPick: OwnerPick | null =
    ownerId && owner.value?.id === ownerId ? { id: ownerId, display_name: owner.value.display_name } : null
  const out = await run(
    {
      kind: form.kind,
      display_name,
      email: email ?? undefined,
      login_id: login_id ?? undefined,
      platform_role: platform_role ?? undefined,
      owner_actor_id: ownerId ?? undefined,
      hosting: hosting ?? undefined,
    },
    { success: t('admin.register.done', { name: display_name }), reasons: 'admin.loginId.refusal' },
  )
  if (!out) return
  open.value = false
  // A platform tool is never proposed: outside a course there is no ladder.
  if (out.status === 'executed') {
    emit(
      'registered',
      { id: out.result.actor_id, kind: form.kind, display_name, email, login_id, platform_role, hosting },
      ownerId ? (ownerPick ?? { id: ownerId, display_name: '' }) : null,
    )
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="t('admin.register.title')" width="560px" destroy-on-close>
    <p class="app-form-hint register__intro">
      {{ form.admin && session.isRoot ? t('admin.register.introAdmin') : t('admin.register.intro') }}
    </p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('admin.register.kind')">
        <el-radio-group v-model="form.kind">
          <el-radio-button value="human">
            <el-icon><User /></el-icon> {{ t('enums.actorKind.human') }}
          </el-radio-button>
          <el-radio-button value="agent">
            <el-icon><AgentSeatIcon /></el-icon> {{ t('enums.actorKind.agent') }}
          </el-radio-button>
        </el-radio-group>
        <div class="app-form-hint register__block">{{ t(`admin.register.kindHelp.${form.kind}`) }}</div>
      </el-form-item>
      <el-form-item :label="t('admin.register.displayName')" prop="display_name">
        <el-input
          v-model="form.display_name"
          :placeholder="t(`admin.register.namePlaceholder.${form.kind}`)"
          maxlength="200"
          autocomplete="off"
        />
        <el-alert
          v-if="sameName.length"
          type="warning"
          :closable="false"
          show-icon
          class="register__same"
          :title="t('admin.register.sameName', { name: form.display_name.trim(), n: sameName.length }, sameName.length)"
        >
          <div>{{ t('admin.register.sameNameHint') }}</div>
          <ul class="register__same-list">
            <li v-for="a in sameName" :key="a.id">
              <StatusTag vocab="actorKind" :value="a.kind" />
              <StatusTag v-if="a.status !== 'active'" vocab="actorStatus" :value="a.status" />
              <span v-if="a.email" class="register__same-email">{{ a.email }}</span>
              <IdText :id="a.id" />
              <span class="app-muted">{{ t('admin.actors.registeredOn', { date: formatDate(a.created_at) }) }}</span>
            </li>
          </ul>
        </el-alert>
        <div v-if="sameNameUnchecked" class="app-form-hint register__block">
          {{ t('admin.register.sameNameUnchecked', { name: sameNameUnchecked.name, n: sameNameUnchecked.checked }) }}
        </div>
      </el-form-item>
      <el-form-item v-if="form.kind === 'human'" prop="email">
        <template #label>
          {{ t('admin.register.email') }}<span class="app-muted">{{ t('common.labels.optionalTag') }}</span>
        </template>
        <el-input v-model="form.email" type="email" maxlength="320" autocomplete="off" />
        <div class="app-form-hint register__block">{{ t('admin.register.emailHint') }}</div>
      </el-form-item>
      <el-form-item v-if="form.kind === 'human'" prop="login_id">
        <template #label>
          {{ t('admin.loginId.label') }}<span class="app-muted">{{ t('common.labels.optionalTag') }}</span>
        </template>
        <el-input
          v-model="form.login_id"
          name="login_id"
          :maxlength="MAX_LOGIN_ID"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <div class="app-form-hint register__block">{{ t('admin.loginId.registerHint') }}</div>
      </el-form-item>
      <el-form-item v-if="form.kind === 'agent'" :label="t('common.agent.hosting.label')" prop="hosting">
        <HostingChoice v-model="form.hosting" />
        <div v-if="form.hosting" class="app-form-hint register__block">
          {{ t(form.hosting === 'runtime' ? 'admin.register.hostingRuntime' : 'admin.register.hostingMcp') }}
        </div>
      </el-form-item>
      <el-form-item v-if="form.kind === 'agent'">
        <template #label>
          {{ t('admin.register.owner') }}<span class="app-muted">{{ t('common.labels.optionalTag') }}</span>
        </template>
        <OwnerSelect v-model="form.owner" @picked="(a) => (owner = a)" />
        <div class="app-form-hint register__block">
          {{ form.owner ? t('admin.register.ownerHintSet') : t('admin.register.ownerHint') }}
        </div>
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="form.admin" :disabled="!session.isRoot || owned" :label="t('admin.register.admin')" />
        <div class="app-form-hint register__block">
          {{
            !session.isRoot
              ? t('admin.register.adminRootOnly')
              : owned
                ? t('admin.register.adminOwned')
                : t('admin.register.adminHint')
          }}
        </div>
      </el-form-item>
      <AppNote>{{ t('admin.register.permanent') }}</AppNote>
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">{{ t('admin.register.submit') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.register__intro {
  margin: 0 0 16px;
}
.register__block {
  width: 100%;
}
.register__same {
  margin-top: 8px;
  line-height: var(--app-lh-ui);
}
.register__same-list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.register__same-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.register__same-email {
  word-break: break-all;
}
</style>
