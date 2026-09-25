<script setup lang="ts">
// Making an API token for oneself (credential.issue_token). The token itself
// is handed to the parent, which shows it once. A token is the whole actor:
// Core gates platform tools on the actor's platform role alone, whatever
// credential the call came with, so an administrator's token administers.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { ToolOut } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import { DIALOG_WIDTH } from './credentials'

const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ issued: [out: ToolOut<'credential.issue_token'>]; proposed: [] }>()
const { t } = useI18n()
const session = useSessionStore()
const platformRole = computed(() => session.me?.platform_role || null)

const formRef = ref<FormInstance>()
const form = reactive({ label: '', expiry: 'days' as 'never' | 'days', days: 90 as number | undefined })
const { run, pending } = useWrite('credential.issue_token')

watch(open, (v) => {
  if (v) {
    form.label = ''
    form.expiry = 'days'
    form.days = 90
  }
})

const rules = computed<FormRules>(() => ({
  label: [
    { required: true, message: t('account.issue.labelRequired'), trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => (v?.trim() ? cb() : cb(new Error(t('account.issue.labelRequired')))),
      trigger: 'blur',
    },
  ],
  days: [
    {
      validator: (_r, v: number | undefined, cb) => {
        if (form.expiry === 'never') return cb()
        if (v === undefined || v === null || !Number.isInteger(v) || v < 1 || v > 3650) {
          return cb(new Error(t('account.issue.daysInvalid')))
        }
        cb()
      },
      trigger: 'change',
    },
  ],
}))

async function submit() {
  if (pending.value) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const out = await run(
    {
      label: form.label.trim(),
      expires_in_days: form.expiry === 'days' ? form.days : undefined,
    },
    // The next dialog says what happened.
    { success: false },
  )
  if (!out) return
  open.value = false
  if (out.status === 'executed') emit('issued', out.result)
  else emit('proposed')
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('account.issue.title')"
    :width="DIALOG_WIDTH"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="issue-intro">{{ t('account.issue.intro') }}</p>
    <el-alert
      v-if="platformRole"
      type="warning"
      :closable="false"
      show-icon
      :title="t('account.issue.platformRole', { role: t(`enums.platformRole.${platformRole}`) })"
      class="issue-role"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item :label="t('account.issue.label')" prop="label">
        <el-input
          v-model="form.label"
          :placeholder="t('account.issue.labelPlaceholder')"
          maxlength="200"
          @keyup.enter="submit"
        />
        <div class="app-form-hint">{{ t('account.issue.labelHelp') }}</div>
      </el-form-item>
      <el-form-item :label="t('account.issue.expiry')" prop="days">
        <div class="issue-expiry">
          <el-radio-group v-model="form.expiry">
            <el-radio value="days">{{ t('account.issue.after') }}</el-radio>
            <el-radio value="never">{{ t('account.issue.never') }}</el-radio>
          </el-radio-group>
          <div v-if="form.expiry === 'days'" class="issue-days">
            <el-input-number v-model="form.days" :min="1" :max="3650" :step="1" :precision="0" step-strictly />
            <span>{{ t('account.issue.days') }}</span>
          </div>
          <div v-if="form.expiry === 'days'" class="app-form-hint">{{ t('account.issue.daysHelp') }}</div>
          <el-alert
            v-else
            type="warning"
            :closable="false"
            show-icon
            :title="t('account.issue.noExpiryWarn')"
            class="issue-warn"
          />
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">{{ t('account.issue.submit') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.issue-intro {
  margin: 0 0 16px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.issue-role {
  margin: -4px 0 16px;
}
.issue-expiry {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.issue-days {
  display: flex;
  align-items: center;
  gap: 8px;
}
.issue-warn {
  margin-top: 4px;
}
</style>
