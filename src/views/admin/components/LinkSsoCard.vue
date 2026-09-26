<script setup lang="ts">
// actor.link_sso: let a registered person sign in through the identity
// provider. One identity links to one actor, for good.
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { Actor } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import IdText from '@/components/IdText.vue'
import { DEFAULT_SSO_PROVIDER } from './adminShared'

const props = defineProps<{ actor: Actor; blockedReason?: string | null }>()
/** An identity was linked: how they sign in has changed. */
const emit = defineEmits<{ linked: [] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ provider: DEFAULT_SSO_PROVIDER, subject: '' })
const linked = ref<{ credentialId: string; subject: string } | null>(null)
const { run, pending } = useWrite('actor.link_sso')

const required = (_r: unknown, v: string, cb: (e?: Error) => void) =>
  v && v.trim() ? cb() : cb(new Error(t('common.errors.required')))
const rules = computed<FormRules>(() => ({
  provider: [{ required: true, validator: required, trigger: 'blur' }],
  subject: [{ required: true, validator: required, trigger: 'blur' }],
}))

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
    <el-alert v-if="blockedReason" type="info" :closable="false" show-icon :title="blockedReason" />
    <el-alert
      v-else-if="actor.kind === 'agent'"
      type="info"
      :closable="false"
      show-icon
      :title="t('admin.sso.agent')"
    />
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
          <el-input v-model="form.provider" maxlength="100" class="sso__provider" />
          <div class="app-form-hint">{{ t('admin.sso.providerHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('admin.sso.subject')" prop="subject">
          <el-input
            v-model="form.subject"
            :placeholder="t('admin.sso.subjectPlaceholder')"
            maxlength="320"
            autocomplete="off"
          />
          <div class="app-form-hint sso__hint">
            <span>{{ t('admin.sso.subjectHint') }}</span>
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
  font-size: 13px;
  line-height: 1.6;
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
.sso__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
