<script setup lang="ts">
// Renaming a group, and setting how many sign-up takes it to (group.update):
// a capacity binds students signing themselves up, never the teacher, and
// set to the group's size it closes that one group to sign-up. None is no
// limit.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WriteOutcome } from '@/api/http'
import StatusTag from '@/components/StatusTag.vue'
import { errorMessage } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { groupRefusalScopes } from './groupEvents'
import type { Group } from './groupModel'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ courseId: string; group: Group | null }>()
const emit = defineEmits<{ saved: [out: WriteOutcome<unknown>] }>()
const { t } = useI18n()
const course = useCourseStore()
const w = useWrite('group.update')

const form = reactive({ name: '', capacity: undefined as number | undefined })
const failure = ref<string | null>(null)
watch(open, (on) => {
  if (!on || !props.group) return
  form.name = props.group.name
  form.capacity = props.group.capacity ?? undefined
  failure.value = null
})
const nameProblem = computed(() => {
  const name = form.name.trim()
  if (!name) return t('groups.setForm.nameRequired')
  if ([...name].length > 100) return t('groups.setForm.nameTooLong')
  if (/[\u0000-\u001f\u007f]/.test(name)) return t('groups.setForm.nameOneLine')
  return null
})

async function save() {
  const g = props.group
  if (!g || nameProblem.value) return
  failure.value = null
  const args: Parameters<typeof w.run>[0] = { course_id: props.courseId, group_id: g.id }
  const name = form.name.trim()
  if (name !== g.name) args.name = name
  if ((form.capacity ?? null) !== (g.capacity ?? null)) {
    if (form.capacity) args.capacity = form.capacity
    else args.clear_capacity = true
  }
  if (Object.keys(args).length === 2) {
    open.value = false
    return
  }
  const out = await w.run(args, { notify: false })
  if (!out) {
    failure.value = errorMessage(w.lastError.value, { reasons: groupRefusalScopes('group.update') })
    return
  }
  announce(out, { success: t('groups.edit.done', { name }) })
  emit('saved', out)
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="t('groups.edit.title')" width="480px" destroy-on-close>
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item :label="t('groups.edit.name')" :error="nameProblem ?? ''">
        <el-input v-model="form.name" maxlength="100" />
      </el-form-item>
      <el-form-item>
        <template #label>
          {{ t('groups.add.capacity') }}<span class="group-dialog__optional">{{ t('common.labels.optionalTag') }}</span>
        </template>
        <el-input-number
          v-model="form.capacity"
          :min="1"
          :max="500"
          :step="1"
          step-strictly
          controls-position="right"
          :placeholder="t('groups.add.noLimit')"
        />
        <div class="app-form-hint">
          {{ t('groups.edit.capacityHint', { n: group?.size ?? 0 }) }}
        </div>
      </el-form-item>
      <el-alert v-if="failure" type="error" :title="failure" :closable="false" show-icon />
    </el-form>
    <template #footer>
      <div class="group-dialog__footer">
        <StatusTag v-if="course.needsApproval('assignment_write')" vocab="level" value="confirm_required" />
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="w.pending.value"
          :disabled="!course.writable || !!nameProblem"
          @click="save"
        >
          {{ t('common.actions.save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.group-dialog__optional {
  color: var(--app-ink-3);
  font-weight: 400;
}
.group-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--app-space-sm);
}
</style>
