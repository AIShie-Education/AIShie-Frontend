<script setup lang="ts">
// Terms (term.list, readable by anyone signed in) and making one
// (term.create, administrators only). A term cannot be edited or removed.
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { FormInstance, FormRules } from 'element-plus'
import { read } from '@/api/http'
import type { Term } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useNarrow } from '@/composables/useMediaQuery'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import PageHeader from '@/components/PageHeader.vue'
import { DIALOG_WIDTH } from './setup/presets'

const { t } = useI18n()
const session = useSessionStore()
// On a phone the dates go under the name, instead of in columns off-screen.
const narrow = useNarrow()

const terms = useAsync(() => read('term.list', {}).then((o) => o.terms ?? []), { keepData: true })
const filter = ref('')

type TermState = 'current' | 'upcoming' | 'ended'
const today = dayjs().format('YYYY-MM-DD')
function stateOf(x: Term): TermState {
  if (x.starts_on > today) return 'upcoming'
  if (x.ends_on < today) return 'ended'
  return 'current'
}
const STATE_TAG: Record<TermState, 'success' | 'primary' | 'info'> = {
  current: 'success',
  upcoming: 'primary',
  ended: 'info',
}

function lengthOf(x: Term): string {
  const days = dayjs(x.ends_on).diff(dayjs(x.starts_on), 'day') + 1
  if (days < 14) return t('adminSetup.terms.days', days)
  return t('adminSetup.terms.weeks', { n: Math.round(days / 7) })
}

const all = computed(() => terms.data.value ?? [])
const rows = computed(() => {
  const q = filter.value.trim().toLowerCase()
  // Latest first, also on a phone, where the date columns (and their sorting) are hidden.
  return all.value
    .filter((x) => !q || x.name.toLowerCase().includes(q))
    .sort((x, y) => y.starts_on.localeCompare(x.starts_on))
})

// --- Creating ---------------------------------------------------------------
const open = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ name: '', starts_on: '', ends_on: '' })
const { run, pending } = useWrite('term.create')

const rules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('common.errors.required'), trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => (v?.trim() ? cb() : cb(new Error(t('common.errors.required')))),
      trigger: 'blur',
    },
  ],
  starts_on: [{ required: true, message: t('common.errors.required'), trigger: 'change' }],
  ends_on: [
    { required: true, message: t('common.errors.required'), trigger: 'change' },
    {
      validator: (_r, v: string, cb) => {
        if (!v) return cb(new Error(t('common.errors.required')))
        if (form.starts_on && v < form.starts_on) return cb(new Error(t('adminSetup.terms.create.endsBeforeStarts')))
        cb()
      },
      trigger: 'change',
    },
  ],
}))

function start() {
  form.name = ''
  form.starts_on = ''
  form.ends_on = ''
  open.value = true
}

function disabledEnd(d: Date): boolean {
  return !!form.starts_on && dayjs(d).format('YYYY-MM-DD') < form.starts_on
}

function onStartChange() {
  if (form.ends_on) void formRef.value?.validateField('ends_on').catch(() => undefined)
}

async function save() {
  if (pending.value) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const out = await run(
    { name: form.name.trim(), starts_on: form.starts_on, ends_on: form.ends_on },
    { success: t('adminSetup.terms.create.done') },
  )
  if (!out) return
  open.value = false
  void terms.reload()
}
</script>

<template>
  <div>
    <PageHeader :title="t('adminSetup.terms.title')" :subtitle="t('adminSetup.terms.subtitle')">
      <el-button v-if="session.isAdmin" type="primary" @click="start">
        <el-icon><Plus /></el-icon>
        <span>{{ t('adminSetup.terms.new') }}</span>
      </el-button>
    </PageHeader>

    <section class="app-card">
      <div class="app-toolbar">
        <el-input v-model="filter" :placeholder="t('adminSetup.terms.filter')" clearable class="setup-filter">
          <template #prefix
            ><el-icon><Search /></el-icon
          ></template>
        </el-input>
        <span class="app-toolbar__spacer" />
        <span v-if="all.length" class="app-muted setup-count">{{ t('adminSetup.terms.count', all.length) }}</span>
        <el-button
          :loading="terms.loading.value"
          circle
          :aria-label="t('common.actions.refresh')"
          @click="terms.reload"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
      <AsyncState
        :loading="terms.loading.value && !terms.data.value"
        :error="terms.data.value ? null : terms.error.value"
        :empty="!rows.length"
        :empty-text="all.length ? t('adminSetup.terms.noMatch') : t('adminSetup.terms.empty')"
        @retry="terms.reload"
      >
        <el-table :data="rows" row-key="id" :default-sort="{ prop: 'starts_on', order: 'descending' }">
          <el-table-column
            prop="name"
            :label="t('adminSetup.terms.name')"
            :min-width="narrow ? 180 : 200"
            sortable
            :fixed="narrow ? false : 'left'"
          >
            <template #default="{ row }">
              <div class="term-cell">
                <span class="term-name">{{ row.name }}</span>
                <span v-if="narrow" class="term-meta">
                  <span class="term-day">{{ row.starts_on }} – {{ row.ends_on }}</span> ·
                  <span class="term-length">{{ lengthOf(row) }}</span>
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.labels.status')" :min-width="narrow ? 90 : 110">
            <template #default="{ row }">
              <el-tag :type="STATE_TAG[stateOf(row)]" size="small" disable-transitions>
                {{ t(`adminSetup.terms.state.${stateOf(row)}`) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            v-if="!narrow"
            prop="starts_on"
            :label="t('adminSetup.terms.startsOn')"
            min-width="120"
            sortable
          >
            <template #default="{ row }"
              ><span class="term-day">{{ row.starts_on }}</span></template
            >
          </el-table-column>
          <el-table-column v-if="!narrow" prop="ends_on" :label="t('adminSetup.terms.endsOn')" min-width="120" sortable>
            <template #default="{ row }"
              ><span class="term-day">{{ row.ends_on }}</span></template
            >
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('adminSetup.terms.length')" min-width="100">
            <template #default="{ row }">{{ lengthOf(row) }}</template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('common.labels.id')" min-width="130">
            <template #default="{ row }"><IdText :id="row.id" /></template>
          </el-table-column>
        </el-table>
      </AsyncState>
    </section>

    <el-dialog
      v-model="open"
      :title="t('adminSetup.terms.create.title')"
      :width="DIALOG_WIDTH"
      destroy-on-close
      :close-on-click-modal="!pending"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item :label="t('adminSetup.terms.create.name')" prop="name">
          <el-input v-model="form.name" :placeholder="t('adminSetup.terms.create.namePlaceholder')" maxlength="200" />
        </el-form-item>
        <div class="term-dates">
          <el-form-item :label="t('adminSetup.terms.create.startsOn')" prop="starts_on">
            <el-date-picker
              v-model="form.starts_on"
              type="date"
              value-format="YYYY-MM-DD"
              format="YYYY-MM-DD"
              :placeholder="t('adminSetup.terms.create.pickDate')"
              class="term-date"
              @change="onStartChange"
            />
          </el-form-item>
          <el-form-item :label="t('adminSetup.terms.create.endsOn')" prop="ends_on">
            <el-date-picker
              v-model="form.ends_on"
              type="date"
              value-format="YYYY-MM-DD"
              format="YYYY-MM-DD"
              :placeholder="t('adminSetup.terms.create.pickDate')"
              :disabled-date="disabledEnd"
              :default-value="form.starts_on ? dayjs(form.starts_on).toDate() : undefined"
              class="term-date"
            />
          </el-form-item>
        </div>
        <el-alert type="info" :closable="false" show-icon :title="t('adminSetup.terms.create.permanent')" />
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
.term-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.term-name {
  word-break: break-word;
}
.term-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
.term-day {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.term-length {
  white-space: nowrap;
}
.term-dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
.term-date {
  width: 100%;
}
.term-dates :deep(.el-date-editor.el-input) {
  width: 100%;
}
@media (max-width: 480px) {
  .term-dates {
    grid-template-columns: 1fr;
  }
}
</style>
