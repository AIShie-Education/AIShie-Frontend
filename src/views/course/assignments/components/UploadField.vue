<script setup lang="ts">
// Picks files and uploads each at once (document.upload_url, then PUT);
// v-model is the list of files uploaded so far, each with the upload token to
// hand to the tool that attaches it.
//
// It is the shared FileUploader plus one thing this module needs and the
// shared one does not yet say: whether an upload is still in flight
// (v-model:uploading). Handing work in, or saving a form, while a file is
// still on its way would go ahead without that file.
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { uploadFile, type UploadKind, type UploadedFile } from '@/api/http'
import { notifyError } from '@/composables/useErrors'
import { formatBytes } from '@/utils/format'

const model = defineModel<UploadedFile[]>({ default: () => [] })
/** True while any picked file is still uploading. */
const uploading = defineModel<boolean>('uploading', { default: false })
const props = defineProps<{
  courseId: string
  kind: UploadKind
  multiple?: boolean
  disabled?: boolean
  accept?: string
}>()
const { t } = useI18n()

interface InFlight {
  key: number
  name: string
  progress: number
}
const inFlight = ref<InFlight[]>([])
const input = ref<HTMLInputElement | null>(null)
let seq = 0
watch(
  () => inFlight.value.length > 0,
  (v) => (uploading.value = v),
)
// Gone from the page, it no longer holds anything up: what is still on its
// way goes nowhere.
onBeforeUnmount(() => {
  if (uploading.value) uploading.value = false
})

async function onPick(ev: Event) {
  const el = ev.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''
  // Every picked file is in flight from now until its own upload ends, so
  // that "uploading" stays true from the first file to the last.
  const entries = files.map((file) => reactive<InFlight>({ key: ++seq, name: file.name, progress: 0 }))
  inFlight.value.push(...entries)
  for (const [i, file] of files.entries()) {
    const entry = entries[i]!
    try {
      const done = await uploadFile(props.courseId, props.kind, file, (f) => (entry.progress = Math.round(f * 100)))
      model.value = props.multiple ? [...model.value, done] : [done]
    } catch (e) {
      notifyError(e, file.name)
    } finally {
      inFlight.value = inFlight.value.filter((x) => x.key !== entry.key)
    }
  }
}

function remove(i: number) {
  model.value = model.value.filter((_, j) => j !== i)
}
</script>

<template>
  <div class="upload-field">
    <input ref="input" type="file" class="upload-field__input" :multiple="multiple" :accept="accept" @change="onPick" />
    <el-button :disabled="disabled || (!multiple && (model.length > 0 || inFlight.length > 0))" @click="input?.click()">
      <el-icon><Upload /></el-icon>
      <span>{{ t('common.actions.upload') }}</span>
    </el-button>
    <ul v-if="model.length || inFlight.length" class="upload-field__list">
      <li v-for="(f, i) in model" :key="f.uploadToken">
        <el-icon><Document /></el-icon>
        <span class="upload-field__name">{{ f.fileName }}</span>
        <span class="upload-field__size">{{ formatBytes(f.size) }}</span>
        <el-button link type="danger" :disabled="disabled" :aria-label="t('common.actions.remove')" @click="remove(i)">
          <el-icon><Close /></el-icon>
        </el-button>
      </li>
      <li v-for="f in inFlight" :key="f.key">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span class="upload-field__name">{{ f.name }}</span>
        <el-progress :percentage="f.progress" :stroke-width="4" class="upload-field__progress" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.upload-field__input {
  display: none;
}
.upload-field__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  width: 100%;
}
.upload-field__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 13px;
  min-width: 0;
}
.upload-field__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 320px;
}
.upload-field__size {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.upload-field__progress {
  width: 140px;
  flex-shrink: 0;
}
</style>
