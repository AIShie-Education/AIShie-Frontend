<script setup lang="ts">
// Adding groups to a set (group.create): how many, what they are called (a
// name and a number, the lowest numbers not in use, as a random split names
// the groups it makes), and, where sign-up is to stop at a size, how many
// each takes. The names it will give are shown before they are made.
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WriteOutcome } from '@/api/http'
import StatusTag from '@/components/StatusTag.vue'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatList } from '@/utils/format'
import { GROUP_REFUSALS, liveGroups, type GroupSet } from './groupModel'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ courseId: string; set: GroupSet }>()
const emit = defineEmits<{ saved: [out: WriteOutcome<unknown>] }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()
const w = useWrite('group.create')

const form = reactive({ count: 4, prefix: '', capacity: undefined as number | undefined })
watch(open, (on) => {
  if (!on) return
  form.count = liveGroups(props.set).length ? 1 : 4
  form.prefix = t('groups.split.defaultPrefix')
  form.capacity = undefined
})

/** The names they will have: the prefix and the lowest numbers no group not archived has. */
const names = computed(() => {
  const used = new Set(liveGroups(props.set).map((g) => g.name.toLowerCase()))
  const out: string[] = []
  const n = Math.max(0, Math.min(100, Math.floor(form.count || 0)))
  for (let k = 1; out.length < n; k++) {
    const name = `${form.prefix}${k}`.trim()
    if (used.has(name.toLowerCase())) continue
    used.add(name.toLowerCase())
    out.push(name)
  }
  return out
})
const namesText = computed(() => (ui.locale, formatList(names.value)))
const prefixOk = computed(() => [...form.prefix].length <= 96 && !/[\u0000-\u001f\u007f]/.test(form.prefix))

async function save() {
  if (!names.value.length || !prefixOk.value) return
  const out = await w.run(
    {
      course_id: props.courseId,
      set_id: props.set.id,
      groups: names.value.map((name) => ({ name, capacity: form.capacity || undefined })),
    },
    {
      success: t('groups.add.done', { names: namesText.value }, names.value.length),
      reasons: GROUP_REFUSALS,
    },
  )
  if (!out) return
  emit('saved', out)
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" :title="t('groups.add.title')" width="560px" destroy-on-close class="add-groups">
    <el-form label-position="top" @submit.prevent="save">
      <div class="add-groups__row">
        <el-form-item :label="t('groups.add.count')">
          <el-input-number v-model="form.count" :min="1" :max="100" :step="1" step-strictly controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('groups.add.prefix')" :error="prefixOk ? '' : t('groups.add.prefixBad')">
          <el-input v-model="form.prefix" maxlength="96" />
        </el-form-item>
      </div>
      <el-form-item>
        <template #label>
          {{ t('groups.add.capacity') }}<span class="add-groups__optional">{{ t('common.labels.optionalTag') }}</span>
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
        <div class="app-form-hint">{{ t('groups.add.capacityHint') }}</div>
      </el-form-item>
      <p class="add-groups__names">
        <i18n-t keypath="common.pair" tag="span" scope="global">
          <template #label>{{ t('groups.add.names') }}</template>
          <template #value>
            <strong>{{ namesText }}</strong>
          </template>
        </i18n-t>
      </p>
    </el-form>
    <template #footer>
      <div class="add-groups__footer">
        <StatusTag v-if="course.needsApproval('assignment_write')" vocab="level" value="confirm_required" />
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="w.pending.value"
          :disabled="!course.writable || !names.length || !prefixOk"
          @click="save"
        >
          {{ t('groups.add.submit', { n: names.length }, names.length) }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.add-groups__row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--app-space-md);
}
@media (max-width: 480px) {
  .add-groups__row {
    grid-template-columns: 1fr;
  }
}
.add-groups__optional {
  color: var(--app-ink-3);
  font-weight: 400;
}
.add-groups__names {
  margin: 0;
  color: var(--app-ink-2);
  overflow-wrap: anywhere;
}
.add-groups__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--app-space-sm);
}
</style>
