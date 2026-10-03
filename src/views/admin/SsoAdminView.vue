<script setup lang="ts">
// 登入方式: single sign-on's identity providers (the sso tools), for root and
// the platform's administrators (router/modules/admin.ts; the side bar
// offers it to them alone). People sign in with their password, and through
// any provider offered here once their account is linked at it.
//
// The list is Core's order, the sign-in page's: the operator's provider first
// (set in the server's environment, read-only here, with its status), then
// the site's by position. Each says its name on the sign-in button, its id
// and issuer, how it stands (switched off, its id the operator's, its secret
// one the server's keys no longer open), whether it links by email, and how
// many accounts sign in through it. The site's are switched on and off here,
// tested (sso.test: nobody is signed in, no secret is sent), changed and
// deleted, each write over the version read; one made meanwhile elsewhere
// (version_mismatch) reads the list again and says so. Deleting one that
// accounts are linked at says how many would no longer sign in through it,
// and offers switching it off instead, which keeps them linked.
//
// The redirect URI to register at every provider heads the page and the
// dialog. Without SECRETS_KEY on the server no provider can be added (nor a
// secret given again), which is said, and the operator's still works.
import { computed, ref, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAsync } from '@/composables/useAsync'
import { useContainerNarrow, useTableRelayout } from '@/composables/useContainerWidth'
import { useWrite } from '@/composables/useWrite'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import OperatorDetail from './components/OperatorDetail.vue'
import RedirectUri from './sso/RedirectUri.vue'
import SsoProviderDialog from './sso/SsoProviderDialog.vue'
import SsoStatus from './sso/SsoStatus.vue'
import SsoTestDialog from './sso/SsoTestDialog.vue'
import {
  isEditable,
  isGone,
  isOperator,
  isVersionMismatch,
  listProviders,
  ordered,
  reasonOf,
  ssoErrorText,
  type SsoProvider,
} from './sso/ssoAdmin'

const { t, te } = useI18n()
// Every column where the providers' card has the 760 px they take; with less, a
// provider's status, accounts and actions go under its name. By the card's own
// width (its title's), not the window's: the side bar takes from it.
const providersTitle = useTemplateRef<HTMLElement>('providersTitle')
const narrow = useContainerNarrow(providersTitle, 759)
const tableRef = useTemplateRef<{ doLayout: () => void }>('tableRef')
useTableRelayout(tableRef, narrow)

const list = useAsync(listProviders, { keepData: true })
const providers = computed(() => ordered(list.data.value?.providers))
const canAdd = computed(() => list.data.value?.can_add ?? false)
const redirectUri = computed(() => list.data.value?.redirect_uri ?? '')
const secretsKeyId = computed(() => list.data.value?.secrets_key_id ?? null)
const takenIds = computed(() => providers.value.map((p) => p.id))

const nameOf = (p: SsoProvider) => p.display_name || t('ssoAdmin.list.unnamed')

// --- Writes ---------------------------------------------------------------------------------
const setEnabled = useWrite('sso.set_enabled')
const remover = useWrite('sso.delete')
const busy = ref<string | null>(null)
const error = shallowRef<unknown>(null)

/**
 * A refusal: said above the list; the list read again when the provider moved
 * on (version_mismatch) or went, and the administrator told so.
 */
function onError(e: unknown) {
  if (isVersionMismatch(e)) {
    ElMessage({ type: 'warning', message: t('ssoAdmin.list.changedMeanwhile'), duration: 6000, showClose: true })
    void list.reload()
    return
  }
  if (isGone(e)) {
    ElMessage({ type: 'info', message: t('ssoAdmin.refusal.sso_provider_not_found'), showClose: true })
    void list.reload()
    return
  }
  if (reasonOf(e) === 'set_by_operator') void list.reload()
  error.value = e
}

async function confirmed(message: string, title: string, confirmButtonText: string, danger = true): Promise<boolean> {
  return ElMessageBox.confirm(message, title, {
    type: 'warning',
    confirmButtonText,
    cancelButtonText: t('common.actions.cancel'),
    confirmButtonClass: danger ? 'el-button--danger' : undefined,
  }).then(
    () => true,
    () => false,
  )
}

async function toggle(p: SsoProvider, on: string | number | boolean) {
  const enabled = on === true
  if (busy.value || !isEditable(p)) return
  // One switched on but not offered (its secret does not open, or its issuer
  // is not at a public address) has no button on the sign-in page, and nobody
  // signs in through it now: switching it off takes nothing from anyone.
  const offered = p.status === 'offered'
  if (!enabled && offered && p.linked_accounts > 0) {
    const ok = await confirmed(
      t('ssoAdmin.list.turnOff', { n: p.linked_accounts }, p.linked_accounts),
      t('ssoAdmin.list.turnOffTitle', { name: nameOf(p) }),
      t('ssoAdmin.list.turnOffConfirm'),
      false,
    )
    if (!ok) return
  }
  busy.value = p.id
  error.value = null
  try {
    const out = await setEnabled.run({ provider_id: p.id, enabled, version: p.version }, { notify: false })
    if (!out) return onError(setEnabled.lastError.value)
    // Switched on is not always offered: one whose issuer is plainly not at
    // a public address is switched on but not offered while the server is
    // held to public addresses (issuer_address_not_allowed).
    const now = out.status === 'executed' ? out.result.status : 'offered'
    if (enabled && now !== 'offered') {
      const status = te(`ssoAdmin.status.${now}`) ? t(`ssoAdmin.status.${now}`) : now
      ElMessage({
        type: 'warning',
        message: t('ssoAdmin.list.turnedOnNotOffered', { name: nameOf(p), status }),
        duration: 8000,
        showClose: true,
      })
      await list.reload()
      return
    }
    const words = enabled
      ? p.linked_accounts || p.link_by_email
        ? 'ssoAdmin.list.turnedOn'
        : 'ssoAdmin.list.turnedOnNobody'
      : offered
        ? 'ssoAdmin.list.turnedOff'
        : 'ssoAdmin.list.turnedOffNotOffered'
    ElMessage({ type: 'success', message: t(words, { name: nameOf(p) }), duration: 6000, showClose: true })
    await list.reload()
  } finally {
    busy.value = null
  }
}

/**
 * Deleting: asked first, saying how many accounts would no longer sign in
 * through it and that switching it off keeps them linked. With none linked it
 * is sent as it is; linked at, with force. Should accounts be linked
 * meanwhile (provider_in_use), it is asked again with Core's count.
 */
async function remove(p: SsoProvider) {
  if (busy.value || !isEditable(p)) return
  const title = t('ssoAdmin.list.deleteTitle', { name: nameOf(p) })
  const n = p.linked_accounts
  const body = n > 0 ? t('ssoAdmin.list.deleteLinked', { n }, n) : t('ssoAdmin.list.deleteNone')
  if (!(await confirmed(body, title, n > 0 ? t('ssoAdmin.list.deleteForce', { n }, n) : t('common.actions.delete')))) {
    return
  }
  busy.value = p.id
  error.value = null
  try {
    let out = await remover.run({ provider_id: p.id, version: p.version, force: n > 0 || undefined }, { notify: false })
    const e = remover.lastError.value
    if (!out && reasonOf(e) === 'provider_in_use') {
      const now = Number(e?.details?.linked_accounts) || 0
      const again = await confirmed(
        t('ssoAdmin.list.deleteLinked', { n: now }, now),
        title,
        t('ssoAdmin.list.deleteForce', { n: now }, now),
      )
      if (!again) return void list.reload()
      out = await remover.run({ provider_id: p.id, version: p.version, force: true }, { notify: false })
    }
    if (!out) return onError(remover.lastError.value)
    if (out.status !== 'executed') return void list.reload()
    const unlinked = out.result.unlinked_accounts
    ElMessage({
      type: 'success',
      message: t('ssoAdmin.list.deleted', { name: nameOf(p), n: unlinked }, unlinked),
      duration: 6000,
      showClose: true,
    })
    await list.reload()
  } finally {
    busy.value = null
  }
}

// --- The dialogs ----------------------------------------------------------------------------
const dialogOpen = ref(false)
const editing = shallowRef<SsoProvider | null>(null)
const testOpen = ref(false)
const testing = shallowRef<SsoProvider | null>(null)

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}
function openEdit(p: SsoProvider) {
  editing.value = p
  dialogOpen.value = true
}
function openTest(p: SsoProvider) {
  testing.value = p
  testOpen.value = true
}
</script>

<template>
  <div class="sso-admin">
    <PageHeader :title="t('ssoAdmin.title')" :subtitle="t('ssoAdmin.subtitle')">
      <el-button
        circle
        :loading="list.loading.value"
        :aria-label="t('common.actions.refresh')"
        class="sso-admin__refresh"
        @click="list.reload"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
      <el-button
        v-if="list.data.value"
        type="primary"
        :disabled="!canAdd"
        class="sso-admin__add"
        @click="openCreate"
      >
        <el-icon><Plus /></el-icon>
        <span>{{ t('ssoAdmin.add') }}</span>
      </el-button>
    </PageHeader>

    <AsyncState
      :loading="list.loading.value && !list.data.value"
      :error="list.data.value ? null : list.error.value"
      @retry="list.reload"
    >
      <template v-if="list.data.value">
        <el-alert
          v-if="!canAdd"
          type="warning"
          :closable="false"
          show-icon
          :title="t('ssoAdmin.refusal.secrets_key_missing')"
          class="sso-admin__alert sso-admin__no-key"
        >
          {{ t('ssoAdmin.noSecretsKey') }}<OperatorDetail :text="t('ssoAdmin.flags.secretsKey')" />
        </el-alert>

        <section class="app-card sso-admin__redirect">
          <RedirectUri :uri="redirectUri" />
        </section>

        <section class="app-card sso-admin__providers">
          <h2 ref="providersTitle" class="app-card__title">{{ t('ssoAdmin.list.title') }}</h2>
          <p class="sso-admin__intro">{{ t('ssoAdmin.list.intro') }}</p>

          <el-alert
            v-if="error"
            type="error"
            show-icon
            :title="ssoErrorText(error)"
            class="sso-admin__alert sso-admin__error"
            @close="error = null"
          />

          <el-empty v-if="!providers.length" :description="t('ssoAdmin.list.empty')" class="sso-admin__empty" />
          <el-table v-else ref="tableRef" :data="providers" row-key="id" class="sso-admin__table">
            <el-table-column :label="t('ssoAdmin.list.provider')" :min-width="narrow ? 220 : 240">
              <template #default="{ row }">
                <div class="sso-cell" :data-provider="row.id">
                  <span class="sso-cell__name" :class="{ 'is-unnamed': !row.display_name }">{{ nameOf(row) }}</span>
                  <code class="sso-cell__id">{{ row.id }}</code>
                  <span class="sso-cell__issuer">{{ row.issuer }}</span>
                  <template v-if="narrow">
                    <SsoStatus :provider="row" :secrets-key-id="secretsKeyId" />
                    <span class="sso-cell__linked">{{
                      t('ssoAdmin.list.linkedCount', { n: row.linked_accounts }, row.linked_accounts)
                    }}</span>
                    <div class="sso-cell__actions">
                      <el-button link type="primary" :disabled="!!busy" class="sso-cell__test" @click="openTest(row)">
                        {{ t('ssoAdmin.list.test') }}
                      </el-button>
                      <template v-if="isEditable(row)">
                        <el-button link type="primary" :disabled="!!busy" class="sso-cell__edit" @click="openEdit(row)">
                          {{ t('common.actions.edit') }}
                        </el-button>
                        <el-button link type="danger" :disabled="!!busy" class="sso-cell__delete" @click="remove(row)">
                          {{ t('common.actions.delete') }}
                        </el-button>
                      </template>
                    </div>
                  </template>
                </div>
              </template>
            </el-table-column>
            <el-table-column v-if="!narrow" :label="t('ssoAdmin.list.status')" min-width="190">
              <template #default="{ row }"><SsoStatus :provider="row" :secrets-key-id="secretsKeyId" /></template>
            </el-table-column>
            <el-table-column v-if="!narrow" :label="t('ssoAdmin.list.linked')" min-width="90" align="right">
              <template #default="{ row }">
                <span class="sso-cell__count">{{ row.linked_accounts }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('ssoAdmin.list.enabled')" :min-width="narrow ? 72 : 90">
              <template #default="{ row }">
                <span v-if="isOperator(row)" class="app-muted sso-cell__always">{{ t('ssoAdmin.list.always') }}</span>
                <el-switch
                  v-else
                  :model-value="row.enabled"
                  :loading="busy === row.id"
                  :disabled="!isEditable(row) || (!!busy && busy !== row.id)"
                  :aria-label="t('ssoAdmin.list.enabledLabel', { name: nameOf(row) })"
                  class="sso-cell__enabled"
                  @change="toggle(row, $event)"
                />
              </template>
            </el-table-column>
            <el-table-column v-if="!narrow" :label="t('ssoAdmin.list.actions')" min-width="150">
              <template #default="{ row }">
                <div class="sso-cell__actions">
                  <el-button link type="primary" :disabled="!!busy" class="sso-cell__test" @click="openTest(row)">
                    {{ t('ssoAdmin.list.test') }}
                  </el-button>
                  <template v-if="isEditable(row)">
                    <el-button link type="primary" :disabled="!!busy" class="sso-cell__edit" @click="openEdit(row)">
                      {{ t('common.actions.edit') }}
                    </el-button>
                    <el-button link type="danger" :disabled="!!busy" class="sso-cell__delete" @click="remove(row)">
                      {{ t('common.actions.delete') }}
                    </el-button>
                  </template>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </template>
    </AsyncState>

    <SsoProviderDialog
      v-model="dialogOpen"
      :provider="editing"
      :redirect-uri="redirectUri"
      :taken-ids="takenIds"
      :can-seal="canAdd"
      @saved="list.reload"
      @changed="list.reload"
    />
    <SsoTestDialog v-model="testOpen" :provider="testing" />
  </div>
</template>

<style scoped>
.sso-admin__alert {
  margin-bottom: 16px;
}
.sso-admin__intro {
  margin: -8px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.sso-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.sso-cell__name {
  font-weight: 600;
  word-break: break-word;
}
.sso-cell__name.is-unnamed {
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.sso-cell__id {
  font-size: 12px;
}
.sso-cell__issuer,
.sso-cell__linked {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.sso-cell__count {
  font-variant-numeric: tabular-nums;
}
.sso-cell__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.sso-cell__actions .el-button + .el-button {
  margin-left: 0;
}
.sso-cell__always {
  font-size: 12px;
}
</style>
