<script setup lang="ts">
// actor.register: a person or an agent. Only root may make an administrator.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import { DIALOG_WIDTH, type RegisteredActor } from './adminShared'

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ registered: [actor: RegisteredActor]; proposed: [] }>()
const { t } = useI18n()
const session = useSessionStore()

const formRef = ref<FormInstance>()
const form = reactive({ kind: 'human' as 'human' | 'agent', display_name: '', email: '', admin: false })
const { run, pending } = useWrite('actor.register')

watch(
  open,
  (v) => {
    if (!v) return
    form.kind = 'human'
    form.display_name = ''
    form.email = ''
    form.admin = false
  },
  { immediate: true },
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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
}))

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  const display_name = form.display_name.trim()
  const email = form.kind === 'human' && form.email.trim() ? form.email.trim() : null
  const platform_role = form.admin && session.isRoot ? 'admin' : null
  const out = await run(
    { kind: form.kind, display_name, email: email ?? undefined, platform_role: platform_role ?? undefined },
    { success: t('admin.register.done', { name: display_name }) },
  )
  if (!out) return
  open.value = false
  if (out.status === 'executed') {
    emit('registered', { id: out.result.actor_id, kind: form.kind, display_name, email, platform_role })
  } else emit('proposed')
}
</script>

<template>
  <el-dialog v-model="open" :title="t('admin.register.title')" :width="DIALOG_WIDTH" destroy-on-close>
    <p class="app-form-hint register__intro">{{ t('admin.register.intro') }}</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('admin.register.kind')">
        <el-radio-group v-model="form.kind">
          <el-radio-button value="human">
            <el-icon><User /></el-icon> {{ t('enums.actorKind.human') }}
          </el-radio-button>
          <el-radio-button value="agent">
            <el-icon><Cpu /></el-icon> {{ t('enums.actorKind.agent') }}
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
      </el-form-item>
      <el-form-item v-if="form.kind === 'human'" prop="email">
        <template #label>
          {{ t('admin.register.email') }} <span class="app-muted">({{ t('common.labels.optional') }})</span>
        </template>
        <el-input v-model="form.email" type="email" maxlength="320" autocomplete="off" />
        <div class="app-form-hint register__block">{{ t('admin.register.emailHint') }}</div>
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="form.admin" :disabled="!session.isRoot" :label="t('admin.register.admin')" />
        <div class="app-form-hint register__block">
          {{ session.isRoot ? t('admin.register.adminHint') : t('admin.register.adminRootOnly') }}
        </div>
      </el-form-item>
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
</style>
