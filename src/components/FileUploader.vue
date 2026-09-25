<script setup lang="ts">
// Picks files and uploads each at once, the way Core takes files: an upload
// URL from document.upload_url, the bytes PUT there, and an upload token back
// to hand to whichever tool attaches the file. v-model is the list of files
// uploaded so far.
import { ref } from 'vue'
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
let seq = 0
const input = ref<HTMLInputElement | null>(null)

async function onPick(ev: Event) {
  const files = Array.from((ev.target as HTMLInputElement).files ?? [])
  ;(ev.target as HTMLInputElement).value = ''
  await Promise.all(files.map(upload))
}

// Each file in flight is kept by its key: the list is reactive, so what is
// read back from it is a proxy, never the object that was put in.
async function upload(file: File) {
  const key = ++seq
  inFlight.value = [...inFlight.value, { key, name: file.name, progress: 0 }]
  const setProgress = (f: number) => {
    const entry = inFlight.value.find((x) => x.key === key)
    if (entry) entry.progress = Math.round(f * 100)
  }
  try {
    const done = await uploadFile(props.courseId, props.kind, file, setProgress)
    inFlight.value = inFlight.value.filter((x) => x.key !== key)
    model.value = props.multiple ? [...model.value, done] : [done]
  } catch (e) {
    inFlight.value = inFlight.value.filter((x) => x.key !== key)
    notifyError(e, file.name)
  }
}

function remove(i: number) {
  model.value = model.value.filter((_, j) => j !== i)
}
</script>

<template>
  <div class="file-uploader">
    <input ref="input" type="file" class="file-uploader__input" :multiple="multiple" :accept="accept" @change="onPick" />
    <el-button
      :disabled="disabled || (!multiple && (model.length > 0 || inFlight.length > 0))"
      @click="input?.click()"
    >
      <el-icon><Upload /></el-icon>
      <span>{{ t('common.actions.upload') }}</span>
    </el-button>
    <ul v-if="model.length || inFlight.length" class="file-uploader__list">
      <li v-for="(f, i) in model" :key="f.uploadToken">
        <el-icon><Document /></el-icon>
        <span class="file-uploader__name">{{ f.fileName }}</span>
        <span class="file-uploader__size">{{ formatBytes(f.size) }}</span>
        <el-button link type="danger" :disabled="disabled" @click="remove(i)">
          <el-icon><Close /></el-icon>
        </el-button>
      </li>
      <li v-for="f in inFlight" :key="f.key">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span class="file-uploader__name">{{ f.name }}</span>
        <el-progress :percentage="f.progress" :stroke-width="4" class="file-uploader__progress" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.file-uploader__input {
  display: none;
}
.file-uploader__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  width: 100%;
}
.file-uploader__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 13px;
}
.file-uploader__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.file-uploader__size {
  color: var(--el-text-color-secondary);
}
.file-uploader__progress {
  width: 140px;
}
</style>
