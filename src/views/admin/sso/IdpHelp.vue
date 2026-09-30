<script setup lang="ts">
// Where the redirect URI goes at the identity providers schools use most, and
// which form of issuer URL each takes: short, and only what each one's own
// console and discovery document say.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const open = ref<string[]>([])

const IDPS: { key: string; name: string; issuer: string }[] = [
  { key: 'adfs', name: 'AD FS', issuer: 'https://adfs.example.edu/adfs' },
  { key: 'entra', name: 'Microsoft Entra ID', issuer: 'https://login.microsoftonline.com/<tenant-id>/v2.0' },
  { key: 'google', name: 'Google Workspace', issuer: 'https://accounts.google.com' },
  { key: 'keycloak', name: 'Keycloak', issuer: 'https://keycloak.example.edu/realms/<realm>' },
]
</script>

<template>
  <div class="idp-help">
    <p class="idp-help__intro">{{ t('ssoAdmin.help.intro') }}</p>
    <el-collapse v-model="open" class="idp-help__list">
      <el-collapse-item v-for="idp in IDPS" :key="idp.key" :name="idp.key" :title="idp.name" :class="`idp-help__${idp.key}`">
        <p class="idp-help__where">{{ t(`ssoAdmin.help.${idp.key}.where`) }}</p>
        <p class="idp-help__issuer">
          <span>{{ t('ssoAdmin.help.issuer') }}</span>
          <code>{{ idp.issuer }}</code>
        </p>
        <p class="idp-help__note">{{ t(`ssoAdmin.help.${idp.key}.note`) }}</p>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.idp-help__intro {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.idp-help__list :deep(.el-collapse-item__header) {
  font-size: 13px;
}
.idp-help p {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}
.idp-help__issuer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  align-items: baseline;
}
.idp-help__issuer code {
  font-family: var(--app-font-mono);
  font-size: 12px;
  word-break: break-all;
}
.idp-help__note {
  color: var(--el-text-color-secondary);
}
</style>
