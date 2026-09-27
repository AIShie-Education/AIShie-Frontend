<script setup lang="ts">
// agent.create: registering an agent of one's own. Only its name is asked
// for: nothing about where or how it runs is kept here. A refusal at the
// limit tells how many one may have (noteAgentLimit), which the list then
// shows as "n of N".
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import { useWrite } from '@/composables/useWrite'
import { knownAgentLimit, noteAgentLimit } from './agents'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ counted: number }>()
const emit = defineEmits<{ created: [actorId: string, name: string] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ name: '' })
const { run, pending, lastError } = useWrite('agent.create')

watch(open, (v) => {
  if (v) form.name = ''
})

const atLimit = computed(() => knownAgentLimit.value !== null && props.counted >= knownAgentLimit.value)

const rules = computed<FormRules>(() => ({
  name: [
    {
      validator: (_r, v: string, cb) => (v?.trim() ? cb() : cb(new Error(t('agents.create.nameRequired')))),
      trigger: 'blur',
    },
  ],
}))

async function submit() {
  if (pending.value) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  const name = form.name.trim()
  const out = await run({ display_name: name }, { success: t('agents.create.done', { name }) })
  if (!out) {
    noteAgentLimit(lastError.value)
    return
  }
  open.value = false
  // A tool on one's own account is never proposed; were it, there would be no id to open.
  if (out.status === 'executed') emit('created', out.result.actor_id, name)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('agents.create.title')"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="create-agent__intro">{{ t('agents.create.intro') }}</p>
    <el-alert
      v-if="atLimit"
      type="warning"
      :closable="false"
      show-icon
      :title="t('agents.limit.reached', { limit: knownAgentLimit ?? 0 })"
      class="create-agent__alert"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('agents.create.name')" prop="name">
        <el-input
          v-model="form.name"
          :placeholder="t('agents.create.namePlaceholder')"
          maxlength="200"
          autocomplete="off"
          @keyup.enter="submit"
        />
        <div class="app-form-hint">{{ t('agents.create.nameHint') }}</div>
      </el-form-item>
    </el-form>
    <ol class="create-agent__next">
      <li>{{ t('agents.create.next.token') }}</li>
      <li>{{ t('agents.create.next.runtime') }}</li>
      <li>{{ t('agents.create.next.course') }}</li>
    </ol>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">{{ t('agents.create.submit') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.create-agent__intro {
  margin: 0 0 16px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.create-agent__alert {
  margin-bottom: 16px;
}
.create-agent__next {
  margin: 4px 0 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}
</style>
