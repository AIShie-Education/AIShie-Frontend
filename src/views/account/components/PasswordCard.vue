<script setup lang="ts">
// Setting or replacing the caller's own password (credential.set_password).
// Whether one is set, and since when, is read from the credential list. A
// password is used only with an email address (auth.Login finds the account
// by it), which only an administrator can give an account later
// (actor.update): without it, there is nothing to set.
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { ApiError } from '@/api/http'
import type { Credential } from '@/api/types'
import { errorMessage } from '@/composables/useErrors'
import { useWrite } from '@/composables/useWrite'
import TimeText from '@/components/TimeText.vue'
import { passwordProblem } from '@/utils/password'
import { credentialState } from './credentials'

const props = defineProps<{
  credentials: Credential[] | undefined
  loading: boolean
  error: ApiError | null
  hasEmail: boolean
}>()
const emit = defineEmits<{ changed: []; retry: [] }>()
const { t } = useI18n()

const current = computed(() =>
  (props.credentials ?? []).find((c) => c.kind === 'password' && credentialState(c) === 'active'),
)
const known = computed(() => props.credentials !== undefined)
// The list could not be read, and nothing read before it is kept.
const failed = computed(() => !known.value && !props.loading && !!props.error)

const open = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ password: '', repeat: '' })
const { run, pending } = useWrite('credential.set_password')

const rules = computed<FormRules>(() => ({
  password: [
    { required: true, message: t('common.errors.required'), trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => {
        const problem = passwordProblem(v ?? '')
        if (!v) cb(new Error(t('common.errors.required')))
        else if (problem === 'short') cb(new Error(t('account.password.tooShort')))
        else if (problem === 'long') cb(new Error(t('account.password.tooLong')))
        else cb()
      },
      trigger: 'blur',
    },
  ],
  repeat: [
    { required: true, message: t('common.errors.required'), trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => {
        if (!v) cb(new Error(t('common.errors.required')))
        else if (v !== form.password) cb(new Error(t('account.password.mismatch')))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}))

function start() {
  form.password = ''
  form.repeat = ''
  open.value = true
}

async function save() {
  if (pending.value) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const out = await run({ password: form.password }, { success: t('account.password.done') })
  if (!out) return
  form.password = ''
  form.repeat = ''
  open.value = false
  emit('changed')
}
</script>

<template>
  <section class="app-card password-card">
    <h2 class="app-card__title">{{ t('account.password.title') }}</h2>
    <div class="password-card__body">
      <el-icon :size="28" class="password-card__icon" :class="{ 'is-set': !!current && hasEmail }">
        <Lock v-if="current && hasEmail" />
        <Unlock v-else />
      </el-icon>
      <div class="password-card__text">
        <p v-if="!hasEmail">{{ t('account.password.noEmail') }}</p>
        <template v-else-if="current">
          <p>{{ t('account.password.isSet') }}</p>
          <p class="app-muted password-card__since">
            {{ t('account.password.setOn') }} <TimeText :value="current.created_at" />
          </p>
        </template>
        <p v-else-if="known">{{ t('account.password.notSet') }}</p>
        <template v-else-if="failed">
          <p>{{ t('account.password.unknown') }}</p>
          <p class="app-muted password-card__error">{{ errorMessage(error) }}</p>
        </template>
        <p v-else class="app-muted">{{ t('common.labels.loading') }}</p>
      </div>
    </div>
    <div v-if="hasEmail" class="password-card__actions">
      <el-button v-if="failed" :loading="loading" @click="emit('retry')">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.retry') }}</span>
      </el-button>
      <el-button v-else type="primary" plain :disabled="!known" @click="start">
        <el-icon><Key /></el-icon>
        <span>{{ current ? t('account.password.change') : t('account.password.set') }}</span>
      </el-button>
    </div>

    <el-dialog
      v-model="open"
      :title="current ? t('account.password.dialogChange') : t('account.password.dialogSet')"
      width="560px"
      destroy-on-close
      :close-on-click-modal="!pending"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item :label="t('account.password.new')" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            name="new-password"
            autocomplete="new-password"
            maxlength="1024"
          />
          <div class="app-form-hint">{{ t('account.password.rule') }}</div>
        </el-form-item>
        <el-form-item :label="t('account.password.repeat')" prop="repeat">
          <el-input
            v-model="form.repeat"
            type="password"
            show-password
            name="repeat-password"
            autocomplete="new-password"
            maxlength="1024"
            @keyup.enter="save"
          />
        </el-form-item>
        <el-alert type="warning" :closable="false" show-icon :title="t('account.password.effect')" />
      </el-form>
      <template #footer>
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="pending" @click="save">{{ t('common.actions.save') }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.password-card__body {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.password-card__icon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  margin-top: 2px;
}
.password-card__icon.is-set {
  color: var(--el-color-success);
}
.password-card__text p {
  margin: 0 0 4px;
  line-height: 1.5;
}
.password-card__since {
  font-size: 13px;
}
.password-card__error {
  font-size: 13px;
  word-break: break-word;
}
.password-card__actions {
  margin-top: 16px;
}
</style>
