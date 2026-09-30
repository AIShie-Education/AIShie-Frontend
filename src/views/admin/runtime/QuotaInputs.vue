<script setup lang="ts">
// A daily quota's two fields, in answers and in dollars, each empty for no
// limit, with what the server would have beside each (runtime.yaml's).
import { useI18n } from 'vue-i18n'
import type { DailyQuota } from '@/api/runtime-types'
import { QUOTA_MAX, usdShown, type QuotaFields } from './runtimeAdmin'

const model = defineModel<QuotaFields>({ required: true })
defineProps<{
  /** runtime.yaml's, shown beside each field; null where it has none. */
  server?: DailyQuota | null
  errors?: { answers?: string; usd?: string }
  disabled?: boolean
  /** Names the fields for whoever cannot see the headings they sit under. */
  label: string
}>()
const { t } = useI18n()
</script>

<template>
  <div class="quota-inputs">
    <el-form-item :error="errors?.answers" class="quota-inputs__answers">
      <el-input-number
        v-model="model.answers"
        :min="1"
        :max="QUOTA_MAX"
        :step="1"
        :precision="0"
        :value-on-clear="null"
        :placeholder="t('runtimeAdmin.money.noLimit')"
        :disabled="disabled"
        :aria-label="t('runtimeAdmin.money.answersOf', { what: label })"
        controls-position="right"
        class="quota-inputs__input"
      />
      <div v-if="server !== undefined" class="app-form-hint">
        {{
          server?.answers != null
            ? t('runtimeAdmin.money.serverAnswers', { n: server.answers })
            : t('runtimeAdmin.money.serverNone')
        }}
      </div>
    </el-form-item>
    <el-form-item :error="errors?.usd" class="quota-inputs__usd">
      <el-input
        v-model="model.usd"
        inputmode="decimal"
        :placeholder="t('runtimeAdmin.money.noLimit')"
        :disabled="disabled"
        :aria-label="t('runtimeAdmin.money.usdOf', { what: label })"
        class="quota-inputs__input"
      >
        <template #prepend>$</template>
      </el-input>
      <div v-if="server !== undefined" class="app-form-hint">
        {{
          server?.usd != null
            ? t('runtimeAdmin.money.serverUsd', { usd: usdShown(server.usd) })
            : t('runtimeAdmin.money.serverNone')
        }}
      </div>
    </el-form-item>
  </div>
</template>

<style scoped>
.quota-inputs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}
.quota-inputs__input {
  width: 100%;
}
.quota-inputs :deep(.el-form-item) {
  margin-bottom: 12px;
}
</style>
