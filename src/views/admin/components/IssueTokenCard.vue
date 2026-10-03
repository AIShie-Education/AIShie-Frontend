<script setup lang="ts">
// actor.issue_token: an API token for an agent with MCP access, shown once.
// Only agents are given one: a person signs in with a password, single
// sign-on or an invitation. An agent hosted on AIshie is given none here
// (Core refuses it, hosted_by_runtime): the card says that the site's agent
// runtime alone is issued its one token. Says `issued` when Core has made
// one, for the list of its tokens to show it.
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { Actor, ToolOut } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import TokenRevealDialog from './TokenRevealDialog.vue'

const props = defineProps<{ actor: Actor; blockedReason?: string | null }>()
const emit = defineEmits<{ issued: [] }>()
const { t } = useI18n()

const PRESETS = ['30', '90', '365', 'never', 'custom'] as const
type Expiry = (typeof PRESETS)[number]

const formRef = ref<FormInstance>()
const form = reactive({ label: '', expiry: '90' as Expiry, days: '' })
const { run, pending } = useWrite('actor.issue_token')

const issued = ref<ToolOut<'actor.issue_token'> | null>(null)
const revealing = ref(false)

function validDays(v: string) {
  if (!/^\d{1,4}$/.test(v.trim())) return false
  const n = Number(v)
  return n >= 1 && n <= 3650
}

const rules = computed<FormRules>(() => ({
  label: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        v && v.trim() ? cb() : cb(new Error(t('common.errors.required'))),
      trigger: 'blur',
    },
  ],
  days: [
    {
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        form.expiry !== 'custom' || validDays(v) ? cb() : cb(new Error(t('admin.token.daysInvalid'))),
      trigger: 'blur',
    },
  ],
}))

function expiresInDays(): number | undefined {
  if (form.expiry === 'never') return undefined
  if (form.expiry === 'custom') return Number(form.days.trim())
  return Number(form.expiry)
}

async function submit() {
  if (props.blockedReason) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  const out = await run(
    { actor_id: props.actor.id, label: form.label.trim(), expires_in_days: expiresInDays() },
    { success: false },
  )
  if (!out || out.status !== 'executed') return
  issued.value = out.result
  revealing.value = true
  form.label = ''
  emit('issued')
}

/** The token is not kept any longer than the dialog that shows it. */
function forget() {
  issued.value = null
}
</script>

<template>
  <section class="app-card">
    <h2 class="app-card__title">{{ t('admin.token.title') }}</h2>
    <p v-if="actor.hosting !== 'runtime'" class="app-muted token__intro">{{ t('admin.token.intro') }}</p>
    <el-alert
      v-if="actor.hosting === 'runtime'"
      type="info"
      :closable="false"
      show-icon
      :title="t('admin.token.runtimeAgent')"
      class="token__runtime"
    />
    <el-alert v-else-if="blockedReason" type="info" :closable="false" show-icon :title="blockedReason" />
    <el-form v-else ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-alert
        v-if="actor.status !== 'active'"
        type="warning"
        :closable="false"
        show-icon
        :title="t('admin.token.suspendedNote')"
        class="token__note"
      />
      <el-form-item :label="t('admin.token.label')" prop="label">
        <el-input v-model="form.label" :placeholder="t('admin.token.labelPlaceholder')" maxlength="200" />
        <div class="app-form-hint">{{ t('admin.token.labelHint') }}</div>
      </el-form-item>
      <div class="token__expiry">
        <el-form-item :label="t('admin.token.expiry')" class="token__expiry-item">
          <el-select v-model="form.expiry" class="token__expiry-select">
            <el-option
              v-for="p in PRESETS"
              :key="p"
              :value="p"
              :label="
                p === 'never'
                  ? t('admin.token.never')
                  : p === 'custom'
                    ? t('admin.token.custom')
                    : t('admin.token.days', { n: p })
              "
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="form.expiry === 'custom'"
          :label="t('admin.token.customDays')"
          prop="days"
          class="token__expiry-item"
        >
          <el-input
            v-model="form.days"
            inputmode="numeric"
            :placeholder="t('admin.token.daysPlaceholder')"
            class="token__days"
          />
        </el-form-item>
      </div>
      <div class="token__actions">
        <el-button type="primary" native-type="submit" :loading="pending">
          <el-icon><Key /></el-icon>
          <span>{{ t('admin.token.submit') }}</span>
        </el-button>
      </div>
    </el-form>

    <TokenRevealDialog v-model="revealing" :issued="issued" @closed="forget" />
  </section>
</template>

<style scoped>
.token__intro {
  margin: 0 0 16px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.token__expiry {
  display: flex;
  gap: 0 12px;
  flex-wrap: wrap;
}
.token__expiry .token__expiry-select {
  width: 160px;
}
.token__note {
  margin-bottom: 12px;
}
.token__days {
  width: 160px;
}
.token__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
