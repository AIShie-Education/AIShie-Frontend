<script setup lang="ts">
// agent.issue_token: a token for a tool of the caller's that uses one of
// their agents with MCP access. The token itself goes to the parent, which
// shows it once. An agent hosted on AIshie is never issued one here (Core
// refuses it, hosted_by_runtime): the page does not offer it.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { AgentToken } from '@/api/types'
import { useWrite } from '@/composables/useWrite'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  actorId: string
  name: string
  suspended?: boolean
}>()
const emit = defineEmits<{ issued: [out: AgentToken] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ label: '', expiry: 'days' as 'never' | 'days', days: 90 as number | undefined })
const { run, pending } = useWrite('agent.issue_token')

watch(open, (v) => {
  if (!v) return
  form.label = ''
  form.expiry = 'days'
  form.days = 90
})

const rules = computed<FormRules>(() => ({
  label: [
    {
      validator: (_r, v: string, cb) => (v?.trim() ? cb() : cb(new Error(t('agents.issue.labelRequired')))),
      trigger: 'blur',
    },
  ],
  days: [
    {
      validator: (_r, v: number | undefined, cb) => {
        if (form.expiry === 'never') return cb()
        if (v === undefined || v === null || !Number.isInteger(v) || v < 1 || v > 3650) {
          return cb(new Error(t('agents.issue.daysInvalid')))
        }
        cb()
      },
      trigger: 'change',
    },
  ],
}))

async function submit() {
  if (pending.value) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  const out = await run(
    {
      actor_id: props.actorId,
      label: form.label.trim(),
      expires_in_days: form.expiry === 'days' ? form.days : undefined,
    },
    // The next dialog says what happened.
    { success: false },
  )
  if (!out) return
  open.value = false
  if (out.status === 'executed') emit('issued', out.result)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('agents.issue.title', { name })"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="issue-intro">{{ t('agents.issue.intro', { name }) }}</p>
    <el-alert
      v-if="suspended"
      type="warning"
      :closable="false"
      show-icon
      :title="t('agents.issue.suspended')"
      class="issue-alert"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item :label="t('agents.issue.label')" prop="label">
        <el-input
          v-model="form.label"
          :placeholder="t('agents.issue.labelPlaceholder')"
          maxlength="200"
          @keyup.enter="submit"
        />
        <div class="app-form-hint">{{ t('agents.issue.labelHint') }}</div>
      </el-form-item>
      <el-form-item :label="t('agents.issue.expiry')" prop="days">
        <div class="issue-expiry">
          <el-radio-group v-model="form.expiry">
            <el-radio value="days">{{ t('agents.issue.after') }}</el-radio>
            <el-radio value="never">{{ t('agents.issue.never') }}</el-radio>
          </el-radio-group>
          <div v-if="form.expiry === 'days'" class="issue-days">
            <el-input-number v-model="form.days" :min="1" :max="3650" :step="1" :precision="0" step-strictly />
            <span>{{ t('agents.issue.days') }}</span>
          </div>
          <el-alert
            v-else
            type="warning"
            :closable="false"
            show-icon
            :title="t('agents.issue.noExpiryWarn')"
            class="issue-alert"
          />
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">{{ t('agents.issue.submit') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.issue-intro {
  margin: 0 0 16px;
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.issue-alert {
  margin-bottom: 12px;
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
</style>
