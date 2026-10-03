<script setup lang="ts">
// How an identity provider stands, in tags, and why where it is not offered:
// switched off, its id the operator's provider's (id_taken), its client
// secret one the server's keys no longer open (secret_unavailable), or its
// issuer at an address that is plainly not public while the server is held
// to public ones (issuer_address_not_allowed); whether it is the operator's,
// whether it links by email, and whether its secret waits to be sealed again
// under the server's newer key.
import { Message } from '@element-plus/icons-vue'
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import OperatorDetail from '../components/OperatorDetail.vue'
import { isOperator, sealedByOlderKey, type SsoProvider } from './ssoAdmin'

const props = defineProps<{ provider: SsoProvider; secretsKeyId?: string | null }>()
const { t, te } = useI18n()

const TAG: Record<string, 'success' | 'info' | 'danger'> = {
  offered: 'success',
  disabled: 'info',
  id_taken: 'danger',
  secret_unavailable: 'danger',
  issuer_address_not_allowed: 'danger',
}
const status = computed(() => props.provider.status)
const statusText = computed(() =>
  te(`ssoAdmin.status.${status.value}`) ? t(`ssoAdmin.status.${status.value}`) : status.value,
)
const why = computed(() =>
  status.value !== 'offered' && te(`ssoAdmin.statusWhy.${status.value}`) ? t(`ssoAdmin.statusWhy.${status.value}`) : '',
)
const olderKey = computed(() => sealedByOlderKey(props.provider, props.secretsKeyId))
</script>

<template>
  <div class="sso-status">
    <div class="sso-status__tags">
      <AppTag :tone="toneOf(TAG[status] ?? 'info')" class="sso-status__status" :data-status="status">
        {{ statusText }}
      </AppTag>
      <AppTag v-if="isOperator(provider)" variant="outline" class="sso-status__operator">
        {{ t('ssoAdmin.list.operator') }}
      </AppTag>
      <AppTag v-if="provider.link_by_email" variant="outline" :icon="Message" class="sso-status__by-email">
        {{ t('ssoAdmin.list.linksByEmail') }}
      </AppTag>
      <AppTag v-if="olderKey" tone="wait" class="sso-status__older-key">
        {{ t('ssoAdmin.list.olderKey') }}
      </AppTag>
    </div>
    <span v-if="isOperator(provider)" class="sso-status__why"
      >{{ t('ssoAdmin.list.operatorWhy') }}<OperatorDetail :text="t('ssoAdmin.flags.oidc')"
    /></span>
    <span v-if="why" class="sso-status__why"
      >{{ why
      }}<OperatorDetail v-if="status === 'issuer_address_not_allowed'" :text="t('ssoAdmin.flags.privateIssuers')"
    /></span>
    <span v-if="olderKey" class="sso-status__why"
      >{{ t('ssoAdmin.list.olderKeyWhy') }}<OperatorDetail :text="t('ssoAdmin.flags.rewrap')"
    /></span>
  </div>
</template>

<style scoped>
.sso-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.sso-status__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sso-status__why {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
</style>
