<script setup lang="ts">
// Testing a provider as it is set up (sso.test with its id): its issuer, and
// the scopes and claims it asks for, read at the issuer now. It signs nobody
// in, sends no secret and changes nothing, so it runs as the dialog opens, and
// again on asking.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SsoTestReport from './SsoTestReport.vue'
import { ssoErrorText, testProvider, type SsoProvider, type SsoReport } from './ssoAdmin'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ provider: SsoProvider | null }>()
const { t } = useI18n()

const report = shallowRef<SsoReport | null>(null)
const error = shallowRef<unknown>(null)
const testing = ref(false)
let generation = 0

async function run() {
  const p = props.provider
  if (!p) return
  const mine = ++generation
  testing.value = true
  error.value = null
  report.value = null
  try {
    const r = await testProvider({ provider_id: p.id })
    if (mine === generation) report.value = r
  } catch (e) {
    if (mine === generation) error.value = e
  } finally {
    if (mine === generation) testing.value = false
  }
}

watch(open, (v) => {
  if (v) void run()
  else generation++
})

const name = computed(() => props.provider?.display_name || props.provider?.id || '')
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('ssoAdmin.test.title', { name })"
    width="640px"
    destroy-on-close
    class="sso-test-dialog"
  >
    <div v-if="testing" v-loading="true" class="sso-test-dialog__loading" :aria-label="t('ssoAdmin.test.testing')" />
    <el-alert
      v-else-if="error"
      type="error"
      :closable="false"
      show-icon
      :title="ssoErrorText(error)"
      class="sso-test-dialog__error"
    />
    <SsoTestReport v-else-if="report" :report="report" />
    <template #footer>
      <el-button :loading="testing" class="sso-test-dialog__again" @click="run">
        {{ t('ssoAdmin.test.again') }}
      </el-button>
      <el-button type="primary" @click="open = false">{{ t('common.actions.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.sso-test-dialog__loading {
  min-height: 160px;
}
</style>
