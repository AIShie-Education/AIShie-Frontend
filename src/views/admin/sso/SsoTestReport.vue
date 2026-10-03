<script setup lang="ts">
// What sso.test found at an issuer: whether a sign-in could go through it,
// what stops one (problems, in red) and what may (warnings, in amber), each
// in Core's words, after the page's own for a reason it names
// (problemReason); the endpoints its discovery document names, its signing
// keys, and what it says it supports. Nobody was signed in and no secret was
// sent to find it, and the verdict says how much of the issuer was read
// (reportRead): nothing where the issuer itself or its discovery document
// was refused or not reached.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { problemReason, reportRead, type SsoReport } from './ssoAdmin'
import { formatList } from '@/utils/format'

const props = defineProps<{ report: SsoReport }>()
const { t } = useI18n()

const problems = computed(() => (props.report.problems ?? []).map((text) => ({ text, reason: problemReason(text) })))
const warnings = computed(() => props.report.warnings ?? [])
const endpoints = computed(() =>
  (
    [
      ['discovery', props.report.discovery_url],
      ['authorization', props.report.authorization_endpoint],
      ['token', props.report.token_endpoint],
      ['userinfo', props.report.userinfo_endpoint],
      ['endSession', props.report.end_session_endpoint],
      ['jwks', props.report.jwks_uri],
    ] as const
  ).map(([key, value]) => ({ key, value })),
)
const keys = computed(() => props.report.signing_keys ?? [])
const supported = computed(() =>
  (
    [
      ['signingAlgorithms', props.report.signing_algorithms],
      ['scopes', props.report.scopes_supported],
      ['claims', props.report.claims_supported],
      ['responseTypes', props.report.response_types_supported],
      ['grantTypes', props.report.grant_types_supported],
      ['tokenAuth', props.report.token_endpoint_auth_methods],
      ['subjectTypes', props.report.subject_types_supported],
      ['pkce', props.report.code_challenge_methods],
    ] as const
  ).map(([key, values]) => ({ key, values: values ?? [] })),
)
</script>

<template>
  <div class="sso-report" :data-ok="report.ok">
    <el-alert
      :type="report.ok ? 'success' : 'error'"
      :closable="false"
      show-icon
      :title="t(report.ok ? 'ssoAdmin.test.ok' : 'ssoAdmin.test.notOk')"
      :description="t(`ssoAdmin.test.read.${reportRead(report)}`, { issuer: report.issuer })"
      class="sso-report__verdict"
    />

    <div v-if="problems.length" class="sso-report__group sso-report__problems">
      <h4 class="sso-report__heading">{{ t('ssoAdmin.test.problems', problems.length) }}</h4>
      <ul>
        <li v-for="(p, i) in problems" :key="i">
          <el-icon class="sso-report__icon is-problem" aria-hidden="true"><CircleCloseFilled /></el-icon>
          <span v-if="p.reason" class="sso-report__problem" :data-reason="p.reason">
            {{ t(`ssoAdmin.test.reason.${p.reason}`) }}
            <span class="app-muted sso-report__core-words">{{ p.text }}</span>
          </span>
          <span v-else>{{ p.text }}</span>
        </li>
      </ul>
    </div>
    <div v-if="warnings.length" class="sso-report__group sso-report__warnings">
      <h4 class="sso-report__heading">{{ t('ssoAdmin.test.warnings', warnings.length) }}</h4>
      <ul>
        <li v-for="(w, i) in warnings" :key="i">
          <el-icon class="sso-report__icon is-warning" aria-hidden="true"><WarningFilled /></el-icon>
          <span>{{ w }}</span>
        </li>
      </ul>
    </div>

    <div class="sso-report__group sso-report__endpoints">
      <h4 class="sso-report__heading">{{ t('ssoAdmin.test.endpoints') }}</h4>
      <dl class="sso-report__list">
        <template v-for="e in endpoints" :key="e.key">
          <dt>{{ t(`ssoAdmin.test.endpoint.${e.key}`) }}</dt>
          <dd :class="`sso-report__endpoint-${e.key}`">
            <code v-if="e.value">{{ e.value }}</code>
            <span v-else class="app-muted">{{ t('ssoAdmin.test.none') }}</span>
          </dd>
        </template>
      </dl>
    </div>

    <div class="sso-report__group sso-report__keys">
      <h4 class="sso-report__heading">{{ t('ssoAdmin.test.keys', keys.length) }}</h4>
      <ul v-if="keys.length" class="sso-report__key-list">
        <li v-for="(k, i) in keys" :key="i" class="sso-report__key">
          <code>{{ k.alg || '—' }}</code>
          <span class="app-muted">{{ k.kty }}</span>
          <span v-if="k.kid" class="app-muted">{{ t('ssoAdmin.test.kid', { kid: k.kid }) }}</span>
          <span v-if="k.use" class="app-muted">{{ t('ssoAdmin.test.use', { use: k.use }) }}</span>
        </li>
      </ul>
    </div>

    <details class="sso-report__group sso-report__supported">
      <summary class="sso-report__heading">{{ t('ssoAdmin.test.supported') }}</summary>
      <dl class="sso-report__list">
        <template v-for="s in supported" :key="s.key">
          <dt>{{ t(`ssoAdmin.test.support.${s.key}`) }}</dt>
          <dd>
            <span v-if="s.values.length">{{ formatList(s.values) }}</span>
            <span v-else class="app-muted">{{ t('ssoAdmin.test.notSaid') }}</span>
          </dd>
        </template>
      </dl>
    </details>
  </div>
</template>

<style scoped>
.sso-report {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.sso-report__heading {
  margin: 0 0 6px;
  font-size: var(--app-text-sm);
  font-weight: var(--app-heading-weight);
}
.sso-report ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.sso-report__problems li,
.sso-report__warnings li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 4px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-ui);
  word-break: break-word;
}
.sso-report__core-words {
  display: block;
  font-size: var(--app-text-xs);
}
.sso-report__icon {
  flex-shrink: 0;
  margin-top: 3px;
}
.sso-report__icon.is-problem {
  color: var(--el-color-danger);
}
.sso-report__icon.is-warning {
  color: var(--el-color-warning);
}
.sso-report__list {
  display: grid;
  grid-template-columns: minmax(96px, max-content) minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-ui);
}
.sso-report__list dt {
  color: var(--el-text-color-secondary);
}
.sso-report__list dd {
  margin: 0;
  min-width: 0;
  word-break: break-all;
}
.sso-report__list code,
.sso-report__key code {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-xs);
}
.sso-report__key {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.sso-report__supported summary {
  cursor: pointer;
}
.sso-report__supported[open] summary {
  margin-bottom: 8px;
}
@media (max-width: 480px) {
  .sso-report__list {
    grid-template-columns: minmax(0, 1fr);
  }
  .sso-report__list dd {
    margin-bottom: 4px;
  }
}
</style>
