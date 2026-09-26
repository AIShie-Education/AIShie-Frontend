<script setup lang="ts">
// Departments (department.list, readable by anyone signed in) and making one
// (department.create, administrators only). A department groups courses and
// may have presets of its own; it cannot be renamed or removed.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import PageHeader from '@/components/PageHeader.vue'
import { usePresetCounts } from './setup/presetCounts'

const { t } = useI18n()
const session = useSessionStore()

const departments = useAsync(() => read('department.list', {}).then((o) => o.departments ?? []), { keepData: true })
const filter = ref('')
const all = computed(() => departments.data.value ?? [])
const rows = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return all.value.filter((d) => !q || d.name.toLowerCase().includes(q))
})

// --- How many presets each has --------------------------------------------------
// One preset.list per department, for the link to its presets to say how many
// of its own it has: a few at a time, within a budget a visit, and none once
// the page is left (see presetCounts.ts). Until a count is in (or if it cannot
// be had) the link just says "View". Departments made here are counted as
// they appear; Refresh counts them all again.
const { counts: presetCounts, count: countPresets, forget: forgetPresetCounts } = usePresetCounts()
watch(
  () => departments.data.value,
  (list) => void countPresets((list ?? []).map((d) => d.id)),
  { immediate: true },
)
function refresh() {
  forgetPresetCounts()
  void departments.reload()
}

// --- Creating ---------------------------------------------------------------
const open = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ name: '' })
const { run, pending } = useWrite('department.create')
const rules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('common.errors.required'), trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => (v?.trim() ? cb() : cb(new Error(t('common.errors.required')))),
      trigger: 'blur',
    },
  ],
}))

function start() {
  form.name = ''
  open.value = true
}

async function save() {
  if (pending.value) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const out = await run({ name: form.name.trim() }, { success: t('adminSetup.departments.create.done') })
  if (!out) return
  open.value = false
  void departments.reload()
}
</script>

<template>
  <div>
    <PageHeader :title="t('adminSetup.departments.title')" :subtitle="t('adminSetup.departments.subtitle')">
      <el-button v-if="session.isAdmin" type="primary" @click="start">
        <el-icon><Plus /></el-icon>
        <span>{{ t('adminSetup.departments.new') }}</span>
      </el-button>
    </PageHeader>

    <section class="app-card">
      <div class="app-toolbar">
        <el-input v-model="filter" :placeholder="t('adminSetup.departments.filter')" clearable class="setup-filter">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <span class="app-toolbar__spacer" />
        <span v-if="all.length" class="app-muted setup-count">{{ t('adminSetup.departments.count', all.length) }}</span>
        <el-button
          :loading="departments.loading.value"
          circle
          :aria-label="t('common.actions.refresh')"
          @click="refresh"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
      <AsyncState
        :loading="departments.loading.value && !departments.data.value"
        :error="departments.data.value ? null : departments.error.value"
        :empty="!rows.length"
        :empty-text="all.length ? t('adminSetup.departments.noMatch') : t('adminSetup.departments.empty')"
        @retry="departments.reload"
      >
        <el-table :data="rows" row-key="id">
          <el-table-column prop="name" :label="t('adminSetup.departments.name')" min-width="200" sortable fixed="left">
            <template #default="{ row }">
              <span class="dept-name">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.labels.id')" min-width="130">
            <template #default="{ row }"><IdText :id="row.id" /></template>
          </el-table-column>
          <el-table-column :label="t('adminSetup.departments.presets')" min-width="120" align="right">
            <template #default="{ row }">
              <router-link :to="{ name: 'admin-presets', query: { dept: row.id } }" class="dept-link">
                <el-icon><Key /></el-icon>
                <span>
                  {{
                    presetCounts.has(row.id)
                      ? t('adminSetup.departments.viewPresetsN', presetCounts.get(row.id) ?? 0)
                      : t('adminSetup.departments.viewPresets')
                  }}
                </span>
              </router-link>
            </template>
          </el-table-column>
        </el-table>
      </AsyncState>
    </section>

    <el-dialog
      v-model="open"
      :title="t('adminSetup.departments.create.title')"
      width="560px"
      destroy-on-close
      :close-on-click-modal="!pending"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item :label="t('adminSetup.departments.create.name')" prop="name">
          <el-input
            v-model="form.name"
            :placeholder="t('adminSetup.departments.create.namePlaceholder')"
            maxlength="200"
            @keyup.enter="save"
          />
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon :title="t('adminSetup.departments.create.permanent')" />
      </el-form>
      <template #footer>
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="pending" @click="save">{{ t('common.actions.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.setup-filter {
  width: 240px;
  max-width: 100%;
}
.setup-count {
  font-size: 13px;
}
.dept-name {
  word-break: break-word;
}
.dept-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-decoration: none;
  font-size: 14px;
}
.dept-link:hover {
  text-decoration: underline;
}
</style>
