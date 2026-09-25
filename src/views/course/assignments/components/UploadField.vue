<script setup lang="ts">
// The shared FileUploader, as this module needs it until the shared one is
// fixed: an upload in progress is kept as a reactive entry, so that its
// progress shows and it leaves the list once done. (The shared component
// pushes a plain object into a ref'd array and later filters by identity
// against the array's proxies, so finished uploads stay listed as in flight.)
//
// Picks files and uploads each at once (document.upload_url, then PUT);
// v-model is the list of files uploaded so far, each with the upload token to
// hand to the tool that attaches it.
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { uploadFile, type UploadKind, type UploadedFile } from '@/api/http'
import { notifyError } from '@/composables/useErrors'
import { formatBytes } from '@/utils/format'

const model = defineModel<UploadedFile[]>({ default: () => [] })
const props = defineProps<{ courseId: string; kind: UploadKind; multiple?: boolean; disabled?: boolean; accept?: string }>()
const { t } = useI18n()

interface InFlight {
  key: number
  name: string
  progress: number
}
const inFlight = ref<InFlight[]>([])
const input = ref<HTMLInputElement | null>(null)
let seq = 0

async function onPick(ev: Event) {
  const el = ev.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''
  for (const file of files) {
    const entry = reactive<InFlight>({ key: ++seq, name: file.name, progress: 0 })
    inFlight.value.push(entry)
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
