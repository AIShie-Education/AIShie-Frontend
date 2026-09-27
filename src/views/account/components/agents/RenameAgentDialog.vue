<script setup lang="ts">
// agent.update: renaming one of the caller's agents. The name is what it is
// called wherever it appears: member lists, conversations, approvals.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import { useWrite } from '@/composables/useWrite'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ actorId: string; name: string }>()
const emit = defineEmits<{ saved: [name: string] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ name: '' })
const { run, pending } = useWrite('agent.update')

watch(open, (v) => {
  if (v) form.name = props.name
})

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
  if (name === props.name) {
    open.value = false
    return
  }
  const out = await run({ actor_id: props.actorId, display_name: name }, { success: t('agents.rename.done') })
  if (!out) return
  open.value = false
  if (out.status === 'executed') emit('saved', name)
}
</script>

<template>
  <el-dialog v-model="open" :title="t('agents.rename.title')" width="560px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('agents.create.name')" prop="name">
        <el-input v-model="form.name" maxlength="200" autocomplete="off" @keyup.enter="submit" />
        <div class="app-form-hint">{{ t('agents.rename.hint') }}</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">{{ t('common.actions.save') }}</el-button>
    </template>
  </el-dialog>
</template>
