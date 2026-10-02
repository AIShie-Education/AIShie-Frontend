<script setup lang="ts">
// Tenants' daily quotas on the school's key (GET, PUT and DELETE
// admin/tenants): what all of one tenant's agents may use a UTC day, in
// answers and dollars, beside the plan's quotas. A hosted agent's owner is a
// tenant (ten_<their actor id>), shown by name; the operator's agents have
// tenants of runtime.yaml's. runtime.yaml's quotas are the operator's and
// shown beside; the site's replace a tenant's whole quota until reset. A
// page of tenants at a time, by id.
import { computed, reactive, ref, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isRuntimeError, runtimeAdmin } from '@/api/runtime'
import type { TenantQuota } from '@/api/runtime-types'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import IdText from '@/components/IdText.vue'
import LoadMore from '@/components/LoadMore.vue'
import { problemsOf } from '@/views/account/components/agents/hosting'
import QuotaInputs from './QuotaInputs.vue'
import RuntimeAsync from './RuntimeAsync.vue'
import {
  adminErrorText,
  quotaFieldsOf,
  quotaFieldsProblems,
  quotaInputOf,
  usdShown,
  type QuotaFields,
} from './runtimeAdmin'

const { t } = useI18n()
// Every column where the card has the 690 px they take; with less, a
// tenant's source, quotas (the server's beside them) and actions go under its
// name. By the card's own width (its title's), not the window's: the side bar
// takes from it.
const cardTitle = useTemplateRef<HTMLElement>('cardTitle')
const narrow = useContainerNarrow(cardTitle, 689)

const tenants = ref<TenantQuota[]>([])
const next = ref<string | null>(null)
const loading = ref(false)
const loadError = shallowRef<unknown>(null)
const loaded = ref(false)

async function load(more = false) {
  if (loading.value) return
  loading.value = true
  loadError.value = null
  try {
    const r = await runtimeAdmin.tenants(more && next.value ? { after: next.value } : {})
    tenants.value = more ? [...tenants.value, ...(r.data.tenants ?? [])] : (r.data.tenants ?? [])
    next.value = r.data.next ?? null
    loaded.value = true
  } catch (e) {
    loadError.value = e
  } finally {
    loading.value = false
  }
}
void load()

function replace(q: TenantQuota) {
  tenants.value = tenants.value.map((x) => (x.tenant_id === q.tenant_id ? q : x))
}

const SOURCE_TAG = { site: 'primary', config: 'info', none: 'info' } as const

// --- Editing ----------------------------------------------------------------------------
const editing = shallowRef<TenantQuota | null>(null)
const open = ref(false)
const fields = ref<QuotaFields>({ answers: null, usd: '' })
const fieldErrors = reactive<{ answers?: string; usd?: string }>({})
const saving = ref(false)
const error = shallowRef<unknown>(null)
const errorProblems = computed(() => problemsOf(error.value))

function openEdit(q: TenantQuota) {
  editing.value = q
  fields.value = quotaFieldsOf(q.per_day)
  delete fieldErrors.answers
  delete fieldErrors.usd
  error.value = null
  open.value = true
}

async function save() {
  const q = editing.value
  if (!q || saving.value) return
  error.value = null
  const problems = quotaFieldsProblems(fields.value, { oneAtLeast: true })
  fieldErrors.answers = problems.answers ? t(problems.answers) : undefined
  fieldErrors.usd = problems.usd ? t(problems.usd) : undefined
  if (problems.answers || problems.usd) return
  saving.value = true
  try {
    const r = await runtimeAdmin.setTenant(q.tenant_id, { per_day: quotaInputOf(fields.value) })
    replace(r.data)
    ElMessage({ type: 'success', message: t('runtimeAdmin.tenants.saved', { who: nameOf(r.data) }) })
    open.value = false
  } catch (e) {
    const field = isRuntimeError(e) ? e.details?.field : null
    if (isRuntimeError(e) && e.reason === 'invalid_field' && field === '/per_day/usd')
      fieldErrors.usd = t('runtimeAdmin.money.invalidUsd')
    else if (isRuntimeError(e) && e.reason === 'invalid_field' && field === '/per_day/answers')
      fieldErrors.answers = t('runtimeAdmin.quotas.invalid')
    else error.value = e
  } finally {
    saving.value = false
  }
}

const resetting = ref<string | null>(null)
async function reset(q: TenantQuota) {
  if (resetting.value) return
  const ok = await ElMessageBox.confirm(
    t('runtimeAdmin.tenants.resetBody', { server: serverText(q) }),
    t('runtimeAdmin.tenants.resetTitle', { who: nameOf(q) }),
    {
      type: 'warning',
      confirmButtonText: t('runtimeAdmin.tenants.reset'),
      cancelButtonText: t('common.actions.cancel'),
    },
  ).then(
    () => true,
    () => false,
  )
  if (!ok) return
  resetting.value = q.tenant_id
  try {
    const r = await runtimeAdmin.resetTenant(q.tenant_id)
    replace(r.data)
    ElMessage({ type: 'success', message: t('runtimeAdmin.tenants.restored', { who: nameOf(r.data) }) })
  } catch (e) {
    ElMessage({ type: 'error', message: adminErrorText(e, t), duration: 6000, showClose: true })
  } finally {
    resetting.value = null
  }
}

function nameOf(q: TenantQuota): string {
  return q.display_name ?? q.tenant_id
}
function answersText(n: number | null | undefined): string {
  return n != null ? String(n) : t('runtimeAdmin.money.noLimit')
}
function usdText(v: string | null | undefined): string {
  return v != null ? `$${usdShown(v)}` : t('runtimeAdmin.money.noLimit')
}
function serverText(q: TenantQuota): string {
  const c = q.config_per_day
  if (!c || (c.answers == null && c.usd == null)) return t('runtimeAdmin.tenants.serverNone')
  return t('runtimeAdmin.tenants.serverQuota', { answers: answersText(c.answers), usd: usdText(c.usd) })
}
</script>

<template>
  <section class="app-card tenants-card">
    <h2 ref="cardTitle" class="app-card__title">
      <span>{{ t('runtimeAdmin.tenants.title') }}</span>
      <el-button
        circle
        :loading="loading"
        :aria-label="t('common.actions.refresh')"
        class="tenants-card__refresh"
        @click="load()"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
    </h2>
    <p class="tenants-card__intro">{{ t('runtimeAdmin.tenants.intro') }}</p>
    <RuntimeAsync :loading="loading && !loaded" :error="loaded ? null : loadError" @retry="load()">
      <el-empty v-if="!tenants.length" :description="t('runtimeAdmin.tenants.empty')" class="tenants-card__empty" />
      <el-table v-else :data="tenants" row-key="tenant_id" class="tenants-card__table">
        <el-table-column :label="t('runtimeAdmin.tenants.tenant')" min-width="200">
          <template #default="{ row }">
            <div class="tenant-cell" :data-tenant="row.tenant_id">
              <router-link
                v-if="row.owner_actor_id && row.display_name"
                :to="{ name: 'admin-actor', params: { actorId: row.owner_actor_id } }"
                class="tenant-cell__name"
                >{{ row.display_name }}</router-link
              >
              <span v-else-if="row.owner_actor_id" class="tenant-cell__unknown">
                {{ t('runtimeAdmin.usage.unknownOwner') }} <IdText :id="row.owner_actor_id" />
              </span>
              <code v-else class="tenant-cell__id">{{ row.tenant_id }}</code>
              <span class="tenant-cell__meta">{{
                t('runtimeAdmin.tenants.agents', { n: row.agents }, row.agents)
              }}</span>
              <template v-if="narrow">
                <el-tag
                  :type="SOURCE_TAG[row.source as 'site']"
                  effect="plain"
                  size="small"
                  disable-transitions
                  class="tenant-cell__source tenant-cell__source--narrow"
                >
                  {{ t(`runtimeAdmin.tenants.sources.${row.source}`) }}
                </el-tag>
                <span class="tenant-cell__meta">
                  {{ answersText(row.per_day.answers) }} · {{ usdText(row.per_day.usd) }}
                </span>
                <span v-if="row.source === 'site' && row.config_per_day" class="tenant-cell__server">
                  {{
                    t('runtimeAdmin.tenants.server', {
                      v: `${answersText(row.config_per_day.answers)} · ${usdText(row.config_per_day.usd)}`,
                    })
                  }}
                </span>
                <div class="tenant-cell__actions">
                  <el-button link type="primary" class="tenant-cell__edit" @click="openEdit(row)">
                    {{ t('runtimeAdmin.offers.edit') }}
                  </el-button>
                  <el-button
                    v-if="row.source === 'site'"
                    link
                    type="primary"
                    :loading="resetting === row.tenant_id"
                    class="tenant-cell__reset"
                    @click="reset(row)"
                  >
                    {{ t('runtimeAdmin.tenants.reset') }}
                  </el-button>
                </div>
              </template>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="!narrow" :label="t('runtimeAdmin.tenants.source')" min-width="120">
          <template #default="{ row }">
            <el-tag
              :type="SOURCE_TAG[row.source as 'site']"
              effect="plain"
              size="small"
              disable-transitions
              class="tenant-cell__source"
            >
              {{ t(`runtimeAdmin.tenants.sources.${row.source}`) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="!narrow" :label="t('runtimeAdmin.money.answersDay')" min-width="120" align="right">
          <template #default="{ row }">
            <span class="tenant-cell__num tenant-cell__answers">{{ answersText(row.per_day.answers) }}</span>
            <span v-if="row.source === 'site' && row.config_per_day" class="tenant-cell__server">
              {{ t('runtimeAdmin.tenants.server', { v: answersText(row.config_per_day.answers) }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column v-if="!narrow" :label="t('runtimeAdmin.money.usdDay')" min-width="120" align="right">
          <template #default="{ row }">
            <span class="tenant-cell__num tenant-cell__usd">{{ usdText(row.per_day.usd) }}</span>
            <span v-if="row.source === 'site' && row.config_per_day" class="tenant-cell__server">
              {{ t('runtimeAdmin.tenants.server', { v: usdText(row.config_per_day.usd) }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column v-if="!narrow" :label="t('runtimeAdmin.offers.actions')" min-width="130">
          <template #default="{ row }">
            <div class="tenant-cell__actions">
              <el-button link type="primary" class="tenant-cell__edit" @click="openEdit(row)">
                {{ t('runtimeAdmin.offers.edit') }}
              </el-button>
              <el-button
                v-if="row.source === 'site'"
                link
                type="primary"
                :loading="resetting === row.tenant_id"
                class="tenant-cell__reset"
                @click="reset(row)"
              >
                {{ t('runtimeAdmin.tenants.reset') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <LoadMore :has-more="!!next" :loading="loading" @more="load(true)" />
    </RuntimeAsync>

    <el-dialog
      v-model="open"
      :title="t('runtimeAdmin.tenants.editTitle', { who: editing ? nameOf(editing) : '' })"
      width="520px"
      destroy-on-close
      :close-on-click-modal="!saving"
      class="tenant-dialog"
    >
      <p class="tenant-dialog__intro">{{ t('runtimeAdmin.tenants.editIntro') }}</p>
      <el-form label-position="top" class="tenant-dialog__form" @submit.prevent>
        <div class="tenant-dialog__heads" aria-hidden="true">
          <span>{{ t('runtimeAdmin.money.answersDay') }}</span>
          <span>{{ t('runtimeAdmin.money.usdDay') }}</span>
        </div>
        <QuotaInputs
          v-model="fields"
          :server="editing?.config_per_day ?? null"
          :errors="fieldErrors"
          :disabled="saving"
          :label="t('runtimeAdmin.tenants.title')"
        />
      </el-form>
      <el-alert
        v-if="error"
        type="error"
        :closable="false"
        show-icon
        :title="adminErrorText(error, t)"
        class="tenant-dialog__error"
      >
        <ul v-if="errorProblems.length" class="tenant-dialog__problems">
          <li v-for="(p, i) in errorProblems" :key="i">{{ p }}</li>
        </ul>
      </el-alert>
      <template #footer>
        <el-button :disabled="saving" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" class="tenant-dialog__save" @click="save">
          {{ t('common.actions.save') }}
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.tenants-card__intro {
  margin: -8px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.tenant-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  word-break: break-word;
}
.tenant-cell__meta,
.tenant-cell__server {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tenant-cell__server {
  display: block;
}
.tenant-cell__num {
  font-variant-numeric: tabular-nums;
}
.tenant-cell__source--narrow {
  align-self: flex-start;
}
.tenant-cell__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.tenant-cell__actions .el-button + .el-button {
  margin-left: 0;
}
.tenant-dialog__intro {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
}
.tenant-dialog__heads {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}
.tenant-dialog__problems {
  margin: 4px 0 0;
  padding-left: 18px;
  word-break: break-word;
}
</style>
