<script setup lang="ts">
// The school's plan's daily quotas, in answers (PUT and DELETE
// admin/school-plan/quotas): per owner across their agents, per person
// asking one agent in one course, and, optionally, for the whole school.
// runtime.yaml's are the defaults, shown beside each field; once set here
// they stand in place of those until they are reset. Quotas in dollars are
// only said to be there: the PUT leaves out what it does not know, which
// the runtime keeps as it is.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isRuntimeError, runtimeAdmin } from '@/api/runtime'
import type { PlanQuotas, SchoolPlan } from '@/api/runtime-types'
import ChangedBy from './ChangedBy.vue'
import { QUOTA_MAX, adminErrorText, quotaProblem, sameQuotas } from './runtimeAdmin'

const props = defineProps<{ plan: SchoolPlan }>()
const emit = defineEmits<{ update: [plan: SchoolPlan] }>()
const { t } = useI18n()

type Field = keyof PlanQuotas
const FIELDS: { key: Field; label: string; hint: string; required: boolean }[] = [
  {
    key: 'per_owner_day',
    label: 'runtimeAdmin.quotas.perOwner',
    hint: 'runtimeAdmin.quotas.perOwnerHint',
    required: true,
  },
  {
    key: 'per_asker_day',
    label: 'runtimeAdmin.quotas.perAsker',
    hint: 'runtimeAdmin.quotas.perAskerHint',
    required: true,
  },
  { key: 'per_day', label: 'runtimeAdmin.quotas.perDay', hint: 'runtimeAdmin.quotas.perDayHint', required: false },
]

const form = reactive<{ per_owner_day: number | null; per_asker_day: number | null; per_day: number | null }>({
  per_owner_day: null,
  per_asker_day: null,
  per_day: null,
})
// The plan read again (after a change to an offer, say) shows its quotas, unless some are being changed here.
watch(
  () => props.plan.quotas,
  (q, before) => {
    if (!before || sameQuotas(form as PlanQuotas, before)) Object.assign(form, { ...q })
  },
  { immediate: true },
)
const fieldErrors = reactive<Partial<Record<Field, string>>>({})
const saving = ref<'save' | 'reset' | null>(null)
const error = shallowRef<unknown>(null)

const defaults = computed(() => props.plan.quota_defaults)
const changed = computed(() => !sameQuotas(form as PlanQuotas, props.plan.quotas))

function defaultOf(f: Field): string {
  const v = defaults.value[f]
  return v === null ? t('runtimeAdmin.quotas.defaultNone') : t('runtimeAdmin.quotas.default', { n: v })
}

async function save() {
  if (saving.value) return
  error.value = null
  for (const f of FIELDS) {
    const k = quotaProblem(form[f.key], f.required)
    if (k) fieldErrors[f.key] = t(k)
    else delete fieldErrors[f.key]
  }
  if (Object.keys(fieldErrors).length) return
  saving.value = 'save'
  try {
    const r = await runtimeAdmin.setQuotas({
      per_owner_day: form.per_owner_day!,
      per_asker_day: form.per_asker_day!,
      per_day: form.per_day ?? null,
    })
    emit('update', r.data)
    ElMessage({ type: 'success', message: t('runtimeAdmin.quotas.saved') })
  } catch (e) {
    // A quota refused names its field (/per_day): said there.
    const f = isRuntimeError(e) && ['invalid_field', 'missing_field'].includes(e.reason) ? e.details?.field : null
    const field = FIELDS.find((x) => f === `/${x.key}`)
    if (field) fieldErrors[field.key] = t('runtimeAdmin.quotas.invalid')
    else error.value = e
  } finally {
    saving.value = null
  }
}

async function reset() {
  if (saving.value) return
  const d = defaults.value
  const ok = await ElMessageBox.confirm(
    t('runtimeAdmin.quotas.resetBody', {
      owner: d.per_owner_day,
      asker: d.per_asker_day,
      day: d.per_day ?? t('runtimeAdmin.quotas.noCeiling'),
    }),
    t('runtimeAdmin.quotas.resetTitle'),
    {
      type: 'warning',
      confirmButtonText: t('runtimeAdmin.quotas.reset'),
      cancelButtonText: t('common.actions.cancel'),
    },
  ).then(
    () => true,
    () => false,
  )
  if (!ok) return
  saving.value = 'reset'
  error.value = null
  try {
    const r = await runtimeAdmin.resetQuotas()
    for (const k of Object.keys(fieldErrors) as Field[]) delete fieldErrors[k]
    Object.assign(form, { ...r.data.quotas })
    emit('update', r.data)
    ElMessage({ type: 'success', message: t('runtimeAdmin.quotas.restored') })
  } catch (e) {
    error.value = e
  } finally {
    saving.value = null
  }
}

function undo() {
  Object.assign(form, { ...props.plan.quotas })
  for (const k of Object.keys(fieldErrors) as Field[]) delete fieldErrors[k]
}
</script>

<template>
  <section class="app-card quotas-card">
    <h2 class="app-card__title">{{ t('runtimeAdmin.quotas.title') }}</h2>
    <p class="quotas-card__intro">{{ t('runtimeAdmin.quotas.intro') }}</p>
    <el-form label-position="top" class="quotas-card__form" @submit.prevent="save">
      <div class="quotas-card__fields">
        <el-form-item
          v-for="f in FIELDS"
          :key="f.key"
          :label="t(f.label)"
          :error="fieldErrors[f.key]"
          :class="`quotas-card__field quotas-card__${f.key}`"
        >
          <el-input-number
            v-model="form[f.key]"
            :min="1"
            :max="QUOTA_MAX"
            :step="1"
            :precision="0"
            :value-on-clear="null"
            :placeholder="f.required ? String(defaults[f.key] ?? '') : t('runtimeAdmin.quotas.noCeiling')"
            :disabled="!!saving"
            controls-position="right"
            class="quotas-card__input"
          />
          <div class="app-form-hint quotas-card__hint">
            <span>{{ t(f.hint) }}</span>
            <span class="quotas-card__default">{{ defaultOf(f.key) }}</span>
          </div>
        </el-form-item>
      </div>
    </el-form>

    <p class="quotas-card__source">
      <template v-if="plan.quotas_set">
        <span>{{ t('runtimeAdmin.quotas.set') }}</span>
        <ChangedBy :by="plan.quotas_updated_by" :at="plan.quotas_updated_at" class="app-muted" />
      </template>
      <span v-else>{{ t('runtimeAdmin.quotas.defaults') }}</span>
    </p>
    <p class="app-form-hint quotas-card__dollars">{{ t('runtimeAdmin.quotas.dollars') }}</p>

    <el-alert
      v-if="error"
      type="error"
      show-icon
      :title="adminErrorText(error, t)"
      class="quotas-card__error"
      @close="error = null"
    />

    <div class="quotas-card__actions">
      <el-button
        type="primary"
        :loading="saving === 'save'"
        :disabled="!changed || (!!saving && saving !== 'save')"
        class="quotas-card__save"
        @click="save"
      >
        {{ t('common.actions.save') }}
      </el-button>
      <el-button v-if="changed" :disabled="!!saving" class="quotas-card__undo" @click="undo">
        {{ t('common.actions.cancel') }}
      </el-button>
      <el-button
        v-if="plan.quotas_set"
        :loading="saving === 'reset'"
        :disabled="!!saving && saving !== 'reset'"
        class="quotas-card__reset"
        @click="reset"
      >
        {{ t('runtimeAdmin.quotas.reset') }}
      </el-button>
    </div>
  </section>
</template>

<style scoped>
/* The fields follow the card's own width: three side by side while each keeps 180 px. */
.quotas-card {
  container-type: inline-size;
}
.quotas-card__intro {
  margin: -8px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.quotas-card__fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 16px;
}
.quotas-card__input {
  width: 100%;
}
.quotas-card__hint {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.quotas-card__source {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 0 0 4px;
  font-size: 13px;
}
.quotas-card__dollars {
  margin: 0 0 16px;
}
.quotas-card__error {
  margin-bottom: 12px;
}
.quotas-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.quotas-card__actions .el-button + .el-button {
  margin-left: 0;
}
@container (max-width: 599px) {
  .quotas-card__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
