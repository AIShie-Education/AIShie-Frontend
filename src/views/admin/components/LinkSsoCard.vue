<script setup lang="ts">
// actor.link_sso: let a registered person sign in through an identity
// provider. One identity links to one actor, for good. The providers set up
// on 登入方式 (sso.list) are offered to choose from, the operator's first, and
// the account is asked for as the one chosen knows it (its subject claim);
// any other id may still be typed, since an account may be linked before its
// provider is set up. Without a provider to choose from (a Core from before
// sso.list, a failed read, or none set up), the id is typed into an empty
// field: each installation names its own provider (OIDC_PROVIDER_NAME),
// which the page cannot know.
import { computed, onMounted, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import { read } from '@/api/http'
import type { Actor } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import AppNote from '@/components/AppNote.vue'
import IdText from '@/components/IdText.vue'
import { ordered, type SsoProvider } from '../sso/ssoAdmin'

const props = defineProps<{ actor: Actor; blockedReason?: string | null }>()
/** An identity was linked: how they sign in has changed. */
const emit = defineEmits<{ linked: [] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ provider: '', subject: '' })
const linked = ref<{ credentialId: string; subject: string } | null>(null)
const { run, pending } = useWrite('actor.link_sso')

const required = (_r: unknown, v: string, cb: (e?: Error) => void) =>
  v && v.trim() ? cb() : cb(new Error(t('common.errors.required')))
const rules = computed<FormRules>(() => ({
  provider: [{ required: true, validator: required, trigger: 'blur' }],
  subject: [{ required: true, validator: required, trigger: 'blur' }],
}))

const providers = shallowRef<SsoProvider[]>([])
let providerChosen = false
onMounted(async () => {
  try {
    const list = ordered((await read('sso.list', {})).providers)
    providers.value = list
    if (!providerChosen && list.length && !list.some((p) => p.id === form.provider)) form.provider = list[0].id
  } catch {
    /* no list to choose from: the provider's id is typed */
  }
})
function chooseProvider(v: string) {
  providerChosen = true
  form.provider = v
}
const chosen = computed(() => providers.value.find((p) => p.id === form.provider.trim()) ?? null)
/** The claim the chosen provider knows accounts by, where it is not AD FS's upn, which the words say already. */
const claim = computed(() => (chosen.value && chosen.value.subject_claim !== 'upn' ? chosen.value.subject_claim : null))

function useEmail() {
  if (props.actor.email) form.subject = props.actor.email
}

async function submit() {
  if (props.blockedReason) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  const subject = form.subject.trim()
  const out = await run(
    { actor_id: props.actor.id, provider: form.provider.trim(), subject },
    { success: t('admin.sso.done') },
  )
  if (!out || out.status !== 'executed') return
  linked.value = { credentialId: out.result.credential_id, subject }
  emit('linked')
  form.subject = ''
}
</script>

<template>
  <section class="app-card">
    <h2 class="app-card__title">{{ t('admin.sso.title') }}</h2>
    <p class="app-muted sso__intro">{{ t('admin.sso.intro') }}</p>
    <AppNote v-if="blockedReason">{{ blockedReason }}</AppNote>
    <AppNote v-else-if="actor.kind === 'agent'">{{ t('admin.sso.agent') }}</AppNote>
    <template v-else>
      <el-alert v-if="linked" type="success" show-icon class="sso__alert" @close="linked = null">
        <template #title>{{ t('admin.sso.linkedAs', { subject: linked.subject }) }}</template>
        <div class="sso__linked">
          <span class="sso__linked-label">{{ t('admin.token.credential') }}</span>
          <IdText :id="linked.credentialId" />
        </div>
      </el-alert>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('admin.sso.provider')" prop="provider">
          <el-select
            v-if="providers.length"
            :model-value="form.provider"
            filterable
            allow-create
            default-first-option
            class="sso__provider"
            @update:model-value="chooseProvider"
          >
            <el-option v-for="p in providers" :key="p.id" :value="p.id" :label="p.display_name || p.id">
              <span>{{ p.display_name || p.id }}</span>
              <code class="sso__provider-id">{{ p.id }}</code>
              <span v-if="p.status !== 'offered'" class="app-muted sso__provider-off">{{
                t('admin.sso.providerNotOffered')
              }}</span>
            </el-option>
          </el-select>
          <el-input
            v-else
            v-model="form.provider"
            :placeholder="t('ssoAdmin.form.idPlaceholder')"
            maxlength="100"
            class="sso__provider"
          />
          <div class="app-form-hint">{{ t('admin.sso.providerHint') }}</div>
        </el-form-item>
        <el-form-item :label="claim ? t('admin.sso.subjectOf', { claim }) : t('admin.sso.subject')" prop="subject">
          <el-input
            v-model="form.subject"
            :placeholder="claim ? '' : t('admin.sso.subjectPlaceholder')"
            maxlength="320"
            autocomplete="off"
            class="sso__subject"
          />
          <div class="app-form-hint sso__hint">
            <span>{{
              claim ? t('admin.sso.subjectOfHint', { name: chosen?.display_name || chosen?.id, claim }) : t('admin.sso.subjectHint')
            }}</span>
            <el-button v-if="actor.email" link type="primary" size="small" @click="useEmail">
              {{ t('admin.sso.useEmail') }}
            </el-button>
          </div>
        </el-form-item>
        <p class="app-form-hint">{{ t('admin.sso.once') }}</p>
        <div class="sso__actions">
          <el-button type="primary" native-type="submit" :loading="pending">
            <el-icon><Link /></el-icon>
            <span>{{ t('admin.sso.submit') }}</span>
          </el-button>
        </div>
      </el-form>
    </template>
  </section>
</template>

<style scoped>
.sso__intro {
  margin: 0 0 16px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.sso__alert {
  margin-bottom: 12px;
}
.sso__linked {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.sso__linked-label {
  color: var(--el-text-color-regular);
}
.sso__hint {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sso__provider {
  width: 100%;
}
.sso__provider-id {
  margin-left: 8px;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.sso__provider-off {
  margin-left: 8px;
  font-size: var(--app-text-xs);
}
.sso__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
