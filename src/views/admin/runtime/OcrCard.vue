<script setup lang="ts">
// Reading scanned documents (OCR), as the site sets it (GET and PATCH
// admin/settings): whether the runtime recognizes the text of scanned files
// and images for models that cannot read them, and in which of the languages
// installed on the server, in the order it reads them. The operator's
// environment is the ceiling: where OCR cannot run (OCR=off, or its programs
// or languages missing), the card says why, and offers only what the runtime
// takes then (turning it off, the server's languages again), which is kept
// for when it can. The switch saves at once; the languages when saved.
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatList } from '@/utils/format'
import { ElMessage } from 'element-plus'
import { isRuntimeError, runtimeAdmin } from '@/api/runtime'
import type { OcrSettings, RuntimeSettings, RuntimeSettingsPatch } from '@/api/runtime-types'
import { useAsync } from '@/composables/useAsync'
import OperatorDetail from '../components/OperatorDetail.vue'
import ChangedBy from './ChangedBy.vue'
import RuntimeAsync from './RuntimeAsync.vue'
import { OCR_MAX_LANGUAGES, adminErrorText, languageName, sameLanguages } from './runtimeAdmin'

const { t } = useI18n()

const settings = useAsync(() => runtimeAdmin.settings().then((r) => r.data), { keepData: true })
const ocr = computed<OcrSettings | null>(() => settings.data.value?.ocr ?? null)

type Tone = 'success' | 'info' | 'warning'
const state = computed<{ key: 'on' | 'off' | 'unavailable'; tone: Tone } | null>(() => {
  const o = ocr.value
  if (!o) return null
  if (!o.available) return { key: 'unavailable', tone: 'warning' }
  return o.enabled ? { key: 'on', tone: 'success' } : { key: 'off', tone: 'info' }
})

/** The languages ticked, in the order they are read: those in force, then each one ticked after. */
const chosen = ref<string[]>([])
// Taken afresh when the languages in force change, and not when only the switch did.
watch(
  () => (ocr.value?.languages ?? []).join('+'),
  () => (chosen.value = [...(ocr.value?.languages ?? [])]),
  { immediate: true },
)
const changed = computed(() => !!ocr.value && !sameLanguages(chosen.value, ocr.value.languages))
const isDefault = computed(() => !!ocr.value && sameLanguages(ocr.value.languages, ocr.value.default_languages))
const languageProblem = computed(() => {
  if (!changed.value) return ''
  if (!chosen.value.length) return t('runtimeAdmin.ocr.none')
  if (chosen.value.length > OCR_MAX_LANGUAGES) return t('runtimeAdmin.ocr.tooMany')
  return ''
})
const listOf = (codes: readonly string[]) => formatList(codes.map((c) => languageName(c, t)))

const saving = ref<'enabled' | 'languages' | 'default' | null>(null)
const error = shallowRef<unknown>(null)

async function patch(
  what: 'enabled' | 'languages' | 'default',
  body: RuntimeSettingsPatch,
  done: (s: RuntimeSettings) => string,
) {
  if (saving.value) return
  saving.value = what
  error.value = null
  try {
    const r = await runtimeAdmin.updateSettings(body)
    settings.data.value = r.data
    ElMessage({ type: 'success', message: done(r.data) })
  } catch (e) {
    error.value = e
    // The operator's environment may have changed since it was read: read it again.
    if (isRuntimeError(e) && e.reason === 'ocr_unavailable') void settings.reload()
  } finally {
    saving.value = null
  }
}

function setEnabled(on: string | number | boolean) {
  const enabled = on === true
  void patch('enabled', { ocr: { enabled } }, () =>
    t(enabled ? 'runtimeAdmin.ocr.turnedOn' : 'runtimeAdmin.ocr.turnedOff'),
  )
}
function saveLanguages() {
  if (languageProblem.value) return
  void patch('languages', { ocr: { languages: [...chosen.value] } }, (s) =>
    t('runtimeAdmin.ocr.languagesSaved', { list: listOf(s.ocr.languages) }),
  )
}
function useDefault() {
  void patch('default', { ocr: { languages: null } }, () => t('runtimeAdmin.ocr.defaultRestored'))
}
function undo() {
  chosen.value = [...(ocr.value?.languages ?? [])]
}
</script>

<template>
  <section class="app-card ocr-card">
    <h2 class="app-card__title ocr-card__title">
      <span>{{ t('runtimeAdmin.ocr.title') }}</span>
      <AppTag v-if="state" size="default" :tone="toneOf(state.tone)" class="ocr-card__state">
        {{ t(`runtimeAdmin.ocr.state.${state.key}`) }}
      </AppTag>
    </h2>
    <p class="ocr-card__intro">{{ t('runtimeAdmin.ocr.intro') }}</p>

    <RuntimeAsync
      :loading="settings.loading.value && !settings.data.value"
      :error="settings.data.value ? null : settings.error.value"
      @retry="settings.reload"
    >
      <template v-if="ocr">
        <el-alert
          v-if="!ocr.available"
          type="warning"
          :closable="false"
          show-icon
          :title="t(`runtimeAdmin.ocr.unavailable.${ocr.unavailable_reason ?? 'not_installed'}`)"
          class="ocr-card__alert ocr-card__unavailable"
        >
          <OperatorDetail v-if="ocr.unavailable_reason === 'operator_off'" :text="t('runtimeAdmin.flags.ocrOff')" />
          <details v-if="ocr.unavailable_detail" class="ocr-card__details">
            <summary>{{ t('runtimeAdmin.ocr.details') }}</summary>
            <code>{{ ocr.unavailable_detail }}</code>
          </details>
        </el-alert>

        <div class="ocr-card__switch">
          <el-switch
            :model-value="ocr.enabled"
            :loading="saving === 'enabled'"
            :disabled="(!ocr.available && !ocr.enabled) || (!!saving && saving !== 'enabled')"
            id="ocr-enabled"
            class="ocr-card__enabled"
            @change="setEnabled"
          />
          <div>
            <label for="ocr-enabled" class="ocr-card__switch-label">{{ t('runtimeAdmin.ocr.enabled') }}</label>
            <p class="app-form-hint">{{ t('runtimeAdmin.ocr.enabledHint') }}</p>
          </div>
        </div>

        <fieldset class="ocr-card__languages">
          <legend class="ocr-card__legend">{{ t('runtimeAdmin.ocr.languages') }}</legend>
          <template v-if="ocr.available">
            <el-checkbox-group v-model="chosen" :disabled="!!saving" class="ocr-card__choices">
              <el-checkbox v-for="code in ocr.available_languages" :key="code" :value="code" class="ocr-card__choice">
                <span class="ocr-card__name">{{ languageName(code, t) }}</span>
                <code class="ocr-card__code">{{ code }}</code>
                <AppTag v-if="ocr.default_languages.includes(code)" variant="outline" class="ocr-card__default">
                  {{ t('runtimeAdmin.ocr.serverDefault') }}
                </AppTag>
              </el-checkbox>
            </el-checkbox-group>
            <p class="app-form-hint">{{ t('runtimeAdmin.ocr.languagesHint') }}</p>
            <p v-if="chosen.length" class="ocr-card__order">
              {{ t('runtimeAdmin.ocr.order', { list: listOf(chosen) }) }}
            </p>
          </template>
          <p v-else class="ocr-card__order ocr-card__kept">
            {{ t('runtimeAdmin.ocr.kept', { list: listOf(ocr.languages) }) }}
          </p>
          <p v-if="languageProblem" class="ocr-card__problem" role="alert">{{ languageProblem }}</p>
          <div class="ocr-card__actions">
            <template v-if="changed">
              <el-button
                type="primary"
                :loading="saving === 'languages'"
                :disabled="!!languageProblem || (!!saving && saving !== 'languages')"
                class="ocr-card__save"
                @click="saveLanguages"
              >
                {{ t('runtimeAdmin.ocr.saveLanguages') }}
              </el-button>
              <el-button :disabled="!!saving" class="ocr-card__undo" @click="undo">
                {{ t('common.actions.cancel') }}
              </el-button>
            </template>
            <el-button
              v-if="!isDefault"
              :loading="saving === 'default'"
              :disabled="!!saving && saving !== 'default'"
              class="ocr-card__use-default"
              @click="useDefault"
            >
              {{ t('runtimeAdmin.ocr.useDefault') }}
            </el-button>
          </div>
          <p v-if="!isDefault" class="app-form-hint">
            {{ t('runtimeAdmin.ocr.useDefaultHint', { list: listOf(ocr.default_languages) }) }}
          </p>
        </fieldset>

        <el-alert
          v-if="error"
          type="error"
          show-icon
          :title="adminErrorText(error, t)"
          class="ocr-card__alert ocr-card__error"
          @close="error = null"
        />

        <p class="app-muted ocr-card__changed">
          <ChangedBy v-if="ocr.updated_at" :by="ocr.updated_by" :at="ocr.updated_at" />
          <span v-else>{{ t('runtimeAdmin.ocr.neverChanged') }}</span>
        </p>
      </template>
    </RuntimeAsync>
  </section>
</template>

<style scoped>
.ocr-card__title {
  justify-content: flex-start;
  flex-wrap: wrap;
}
.ocr-card__intro {
  margin: -8px 0 16px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.ocr-card__alert {
  margin-bottom: 16px;
}
.ocr-card__details {
  margin-top: 6px;
}
.ocr-card__details summary {
  cursor: pointer;
}
.ocr-card__details code {
  display: block;
  margin-top: 4px;
  word-break: break-word;
  white-space: pre-wrap;
}
.ocr-card__switch {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}
.ocr-card__switch-label {
  font-size: var(--app-text-md);
  font-weight: var(--app-weight-strong);
}
.ocr-card__switch .app-form-hint {
  margin: 2px 0 0;
}
.ocr-card__languages {
  margin: 0 0 16px;
  padding: 0;
  border: 0;
  min-width: 0;
}
.ocr-card__legend {
  padding: 0;
  margin-bottom: 8px;
  font-weight: var(--app-weight-strong);
}
.ocr-card__choices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 4px 16px;
}
.ocr-card__choice {
  margin-right: 0;
  height: auto;
  min-height: 32px;
  white-space: normal;
}
.ocr-card__choice :deep(.el-checkbox__label) {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.ocr-card__code {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.ocr-card__order {
  margin: 8px 0 0;
  font-size: var(--app-text-sm);
}
.ocr-card__problem {
  margin: 6px 0 0;
  font-size: var(--app-text-xs);
  color: var(--el-color-danger);
}
.ocr-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.ocr-card__actions .el-button + .el-button {
  margin-left: 0;
}
.ocr-card__changed {
  margin: 0;
  font-size: var(--app-text-xs);
}
</style>
