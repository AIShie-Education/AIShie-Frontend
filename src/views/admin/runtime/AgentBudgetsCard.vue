<script setup lang="ts">
// Hosted agents' daily budgets by default (GET, PUT and DELETE
// admin/agent-budgets): what one agent may use a UTC day, in all and for
// each person asking it in a course, in answers and dollars, on whichever
// key it answers. runtime.yaml's are the defaults, shown beside; the site's
// stand in place of them for agents hosted here until reset. The operator's
// own agents keep the budgets runtime.yaml gives them.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isRuntimeError, runtimeAdmin } from '@/api/runtime'
import type { AgentBudgets } from '@/api/runtime-types'
import { useAsync } from '@/composables/useAsync'
import DailyReset from '@/components/DailyReset.vue'
import { problemsOf } from '@/views/account/components/agents/hosting'
import OperatorDetail from '../components/OperatorDetail.vue'
import ChangedBy from './ChangedBy.vue'
import QuotaInputs from './QuotaInputs.vue'
import RuntimeAsync from './RuntimeAsync.vue'
import {
  adminErrorText,
  quotaFieldsOf,
  quotaFieldsProblems,
  quotaInputOf,
  sameUsd,
  type QuotaFields,
} from './runtimeAdmin'

const { t } = useI18n()

const budgets = useAsync(() => runtimeAdmin.agentBudgets().then((r) => r.data), { keepData: true })
const data = computed(() => budgets.data.value ?? null)

type Scope = 'per_agent_day' | 'per_asker_day'
const SCOPES: { key: Scope; label: string; hint: string }[] = [
  { key: 'per_agent_day', label: 'runtimeAdmin.budgets.perAgent', hint: 'runtimeAdmin.budgets.perAgentHint' },
  { key: 'per_asker_day', label: 'runtimeAdmin.budgets.perAsker', hint: 'runtimeAdmin.budgets.perAskerHint' },
]

const fields = reactive<Record<Scope, QuotaFields>>({
  per_agent_day: { answers: null, usd: '' },
  per_asker_day: { answers: null, usd: '' },
})
function take(b: AgentBudgets) {
  fields.per_agent_day = quotaFieldsOf(b.per_agent_day)
  fields.per_asker_day = quotaFieldsOf(b.per_asker_day)
}
watch(data, (b) => b && take(b), { immediate: true })

const changed = computed(() => {
  const b = data.value
  if (!b) return false
  return SCOPES.some(
    ({ key }) => fields[key].answers !== (b[key].answers ?? null) || !sameUsd(fields[key].usd, b[key].usd),
  )
})
const fieldErrors = reactive<Record<Scope, { answers?: string; usd?: string }>>({
  per_agent_day: {},
  per_asker_day: {},
})
const saving = ref<'save' | 'reset' | null>(null)
const error = shallowRef<unknown>(null)
const errorProblems = computed(() => problemsOf(error.value))

function clearErrors() {
  fieldErrors.per_agent_day = {}
  fieldErrors.per_asker_day = {}
}

async function save() {
  if (saving.value) return
  error.value = null
  clearErrors()
  let bad = false
  for (const { key } of SCOPES) {
    const p = quotaFieldsProblems(fields[key])
    fieldErrors[key] = { answers: p.answers && t(p.answers), usd: p.usd && t(p.usd) }
    bad ||= !!(p.answers || p.usd)
  }
  if (bad) return
  saving.value = 'save'
  try {
    const r = await runtimeAdmin.setAgentBudgets({
      per_agent_day: quotaInputOf(fields.per_agent_day),
      per_asker_day: quotaInputOf(fields.per_asker_day),
    })
    budgets.data.value = r.data
    ElMessage({ type: 'success', message: t('runtimeAdmin.budgets.saved') })
  } catch (e) {
    const f = isRuntimeError(e) && e.reason === 'invalid_field' ? String(e.details?.field ?? '') : ''
    const m = f.match(/^\/(per_agent_day|per_asker_day)\/(answers|usd)$/)
    if (m)
      fieldErrors[m[1] as Scope] = {
        [m[2]]: t(m[2] === 'usd' ? 'runtimeAdmin.money.invalidUsd' : 'runtimeAdmin.quotas.invalid'),
      }
    else error.value = e
  } finally {
    saving.value = null
  }
}

async function reset() {
  if (saving.value) return
  const ok = await ElMessageBox.confirm(t('runtimeAdmin.budgets.resetBody'), t('runtimeAdmin.budgets.resetTitle'), {
    type: 'warning',
    confirmButtonText: t('runtimeAdmin.quotas.reset'),
    cancelButtonText: t('common.actions.cancel'),
  }).then(
    () => true,
    () => false,
  )
  if (!ok) return
  saving.value = 'reset'
  error.value = null
  clearErrors()
  try {
    const r = await runtimeAdmin.resetAgentBudgets()
    budgets.data.value = r.data
    take(r.data)
    ElMessage({ type: 'success', message: t('runtimeAdmin.budgets.restored') })
  } catch (e) {
    error.value = e
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <section class="app-card budgets-card">
    <h2 class="app-card__title">{{ t('runtimeAdmin.budgets.title') }}</h2>
    <i18n-t keypath="runtimeAdmin.budgets.intro" tag="p" scope="global" class="budgets-card__intro">
      <template #reset><DailyReset /></template>
    </i18n-t>
    <RuntimeAsync
      :loading="budgets.loading.value && !data"
      :error="data ? null : budgets.error.value"
      @retry="budgets.reload"
    >
      <template v-if="data">
        <el-form label-position="top" class="budgets-card__form" @submit.prevent>
          <div class="budgets-card__grid">
            <span class="budgets-card__corner" />
            <div class="budgets-card__heads" aria-hidden="true">
              <span>{{ t('runtimeAdmin.money.answersDay') }}</span>
              <span>{{ t('runtimeAdmin.money.usdDay') }}</span>
            </div>
            <template v-for="s in SCOPES" :key="s.key">
              <div class="budgets-card__scope">
                <span class="budgets-card__label">{{ t(s.label) }}</span>
                <span class="app-form-hint">{{ t(s.hint) }}</span>
              </div>
              <QuotaInputs
                v-model="fields[s.key]"
                :server="data.defaults[s.key]"
                :errors="fieldErrors[s.key]"
                :disabled="!!saving"
                :label="t(s.label)"
                :class="`budgets-card__inputs budgets-card__${s.key}`"
              />
            </template>
          </div>
        </el-form>
        <p class="budgets-card__source">
          <template v-if="data.set">
            <span>{{ t('runtimeAdmin.budgets.set') }}</span>
            <ChangedBy :by="data.updated_by" :at="data.updated_at" class="app-muted" />
          </template>
          <span v-else
            >{{ t('runtimeAdmin.budgets.defaults') }}<OperatorDetail :text="t('runtimeAdmin.flags.serverFile')"
          /></span>
        </p>
        <p class="app-form-hint budgets-card__note">{{ t('runtimeAdmin.budgets.hostedOnly') }}</p>
        <el-alert
          v-if="error"
          type="error"
          show-icon
          :title="adminErrorText(error, t)"
          class="budgets-card__error"
          @close="error = null"
        >
          <ul v-if="errorProblems.length" class="budgets-card__problems">
            <li v-for="(p, i) in errorProblems" :key="i">{{ p }}</li>
          </ul>
        </el-alert>
        <div class="budgets-card__actions">
          <el-button
            type="primary"
            :loading="saving === 'save'"
            :disabled="!changed || (!!saving && saving !== 'save')"
            class="budgets-card__save"
            @click="save"
          >
            {{ t('common.actions.save') }}
          </el-button>
          <el-button v-if="changed" :disabled="!!saving" class="budgets-card__undo" @click="data && take(data)">
            {{ t('common.actions.cancel') }}
          </el-button>
          <el-button
            v-if="data.set"
            :loading="saving === 'reset'"
            :disabled="!!saving && saving !== 'reset'"
            class="budgets-card__reset"
            @click="reset"
          >
            {{ t('runtimeAdmin.quotas.reset') }}
          </el-button>
        </div>
      </template>
    </RuntimeAsync>
  </section>
</template>

<style scoped>
/* The fields follow the card's own width: beside their scope while there is room. */
.budgets-card {
  container-type: inline-size;
}
.budgets-card__intro {
  margin: -8px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.budgets-card__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 4px 16px;
  align-items: start;
}
.budgets-card__heads {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
  font-size: 13px;
  font-weight: 600;
}
.budgets-card__scope {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 6px;
}
.budgets-card__label {
  font-weight: 600;
}
.budgets-card__source {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 4px 0;
  font-size: 13px;
}
.budgets-card__note {
  margin: 0 0 16px;
}
.budgets-card__error {
  margin-bottom: 12px;
}
.budgets-card__problems {
  margin: 4px 0 0;
  padding-left: 18px;
  word-break: break-word;
}
.budgets-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.budgets-card__actions .el-button + .el-button {
  margin-left: 0;
}
@container (max-width: 559px) {
  .budgets-card__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .budgets-card__corner {
    display: none;
  }
}
</style>
