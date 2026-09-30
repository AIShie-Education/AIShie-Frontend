<script setup lang="ts">
// Creating material. Files come first: it opens on a drop zone, and each file
// dropped (or chosen, or pasted, or dropped on the materials list, which opens
// it) becomes material of its own, document.create (kind material) with the
// file as its first version, titled from the file's name until its title is
// changed, and listed in the order the files are, numbered on from the sort
// order given. Writing text is the second choice ("Write text instead"): one
// document, with a title and Markdown.
//
// Material starts unpublished; publishing is a second call (document.publish)
// for each, and when a creation became a proposal there is nothing to publish
// yet. Each file keeps its own idempotency key until Core has answered for
// it, and what was created is taken off the list, so that pressing Create
// again after a failure creates only what is left.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useUploadQueue, type UploadItem } from '@/composables/useUploadQueue'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { titleFromFileName } from '@/utils/format'
import FileDropZone from '@/components/FileDropZone.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  courseId: string
  suggestedOrder: number
  /** Files dropped on the materials list, to start with. */
  files?: File[]
}>()
const emit = defineEmits<{
  created: [documentIds: string[]]
  proposed: [info: { titles: string[]; publish: boolean }]
}>()
const { t } = useI18n()
const course = useCourseStore()

type Mode = 'upload' | 'text'
const mode = ref<Mode>('upload')
const formRef = ref<FormInstance>()
const form = reactive({
  title: '',
  sortOrder: 1,
  body: '',
  publish: false,
})

// --- Files: one material each --------------------------------------------------
const queue = useUploadQueue({ courseId: () => props.courseId, kind: 'material' })
/** Each file's title, by its item. */
const titles = reactive<Record<number, string>>({})
watch(
  () => queue.items.map((i) => i.id),
  () => {
    for (const item of queue.items) if (titles[item.id] === undefined) titles[item.id] = titleFromFileName(item.name)
  },
)
const ready = computed(() => queue.items.filter((i) => i.status === 'done' && i.result))
const leftOut = computed(() => queue.items.filter((i) => i.status === 'failed' || i.status === 'cancelled').length)
const untitled = computed(() => ready.value.some((i) => !(titles[i.id] ?? '').trim()))

function onAdded() {
  // Files dropped while writing text: they are what is wanted after all.
  mode.value = 'upload'
}

function reset() {
  mode.value = 'upload'
  form.title = ''
  form.sortOrder = props.suggestedOrder
  form.body = ''
  form.publish = false
  queue.clear()
  for (const k of Object.keys(titles)) delete titles[Number(k)]
  if (props.files?.length) queue.add(props.files)
}
watch(
  visible,
  (v) => {
    if (v) reset()
    // Closed, whatever is still on its way goes nowhere.
    else queue.clear()
  },
  { immediate: true },
)

const hasText = computed(() => form.body.trim() !== '')
const canPublish = computed(() => (mode.value === 'upload' ? ready.value.length > 0 : hasText.value))
watch(canPublish, (can) => {
  if (!can) form.publish = false
})

const rules = computed<FormRules>(() => ({
  title: [{ required: true, whitespace: true, message: t('common.errors.required'), trigger: 'blur' }],
}))

/** Why Create cannot be pressed now, or null. */
const blocked = computed<string | null>(() => {
  if (mode.value === 'text') return null
  if (queue.busy.value) {
    const n = queue.items.filter((i) => i.status === 'queued' || i.status === 'uploading').length
    return t('materials.create.waitForUploads', { n }, n)
  }
  if (!ready.value.length) return t('materials.create.noFiles')
  if (untitled.value) return t('materials.create.untitled')
  return null
})
const submitLabel = computed(() =>
  mode.value === 'upload' && ready.value.length > 1
    ? t('materials.create.submitMany', { n: ready.value.length })
    : t('materials.create.submit'),
)

// Each file's own writes, and so its own idempotency key while it is retried.
const writers = new Map<number, { create: ReturnType<typeof useWrite<'document.create'>> }>()
const writerOf = (id: number) => {
  let w = writers.get(id)
  if (!w) writers.set(id, (w = { create: useWrite('document.create') }))
  return w
}
const textCreate = useWrite('document.create')
const publisher = useWrite('document.publish')
const submitting = ref(false)
const pending = computed(() => submitting.value || textCreate.pending.value || publisher.pending.value)

async function publishEach(created: { id: string; versionId?: string }[]): Promise<boolean> {
  let all = true
  for (const c of created) {
    if (!c.versionId) continue
    const p = await publisher.run(
      { course_id: props.courseId, document_id: c.id, version_id: c.versionId },
      { success: false },
    )
    if (!p) all = false
  }
  return all
}

async function submitText() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const title = form.title.trim()
  const wantsPublish = form.publish && hasText.value
  const out = await textCreate.run(
    {
      course_id: props.courseId,
      kind: 'material',
      title,
      sort_order: form.sortOrder,
      body_md: hasText.value ? form.body : undefined,
    },
    // When it is to be published as well, the publish call says how it went.
    { success: wantsPublish ? false : t('materials.create.done') },
  )
  if (!out) return
  if (out.status === 'proposed') {
    // Nothing exists yet, so there is nothing to publish either.
    visible.value = false
    emit('proposed', { titles: [title], publish: wantsPublish })
    return
  }
  const documentId = out.result.document_id
  if (wantsPublish && out.result.version_id) {
    const p = await publisher.run(
      { course_id: props.courseId, document_id: documentId, version_id: out.result.version_id },
      { success: t('materials.create.donePublished') },
    )
    if (!p) ElMessage({ type: 'warning', message: t('materials.create.notPublished'), duration: 6000, showClose: true })
  }
  visible.value = false
  emit('created', [documentId])
}

async function submitFiles() {
  if (blocked.value) return
  const wantsPublish = form.publish
  const items: UploadItem[] = [...ready.value]
  const start = form.sortOrder
  const created: { id: string; versionId?: string }[] = []
  const proposed: string[] = []
  let completed = true
  submitting.value = true
  try {
    for (const [i, item] of items.entries()) {
      const title = (titles[item.id] ?? '').trim()
      const out = await writerOf(item.id).create.run(
        {
          course_id: props.courseId,
          kind: 'material',
          title,
          sort_order: start + i,
          upload_token: item.result!.uploadToken,
        },
        { success: false },
      )
      // Refused or failed: said already. What was created is off the list,
      // and what is left is created by pressing Create again, numbered on.
      if (!out) {
        form.sortOrder = start + i
        completed = false
        break
      }
      writers.delete(item.id)
      queue.remove(item.id)
      if (out.status === 'proposed') proposed.push(title)
      else created.push({ id: out.result.document_id, versionId: out.result.version_id ?? undefined })
    }
  } finally {
    submitting.value = false
  }
  const published = wantsPublish && created.length ? await publishEach(created) : true
  if (created.length) {
    const n = created.length
    ElMessage({
      type: 'success',
      message:
        wantsPublish && published
          ? t('materials.create.donePublishedMany', { n }, n)
          : t('materials.create.doneMany', { n }, n),
    })
    if (!published)
      ElMessage({ type: 'warning', message: t('materials.create.notPublished'), duration: 6000, showClose: true })
  }
  if (proposed.length) emit('proposed', { titles: proposed, publish: wantsPublish })
  if (created.length)
    emit(
      'created',
      created.map((c) => c.id),
    )
  // Every file there was went (those that did not upload were said to be left out).
  if (completed) visible.value = false
}

function submit() {
  return mode.value === 'text' ? submitText() : submitFiles()
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('materials.create.title')"
    width="680px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <el-alert
      v-if="course.needsApproval('document_write')"
      type="warning"
      :closable="false"
      show-icon
      class="create-dialog__approval"
      :title="t('materials.create.approvalNote')"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <!-- Files first. Kept while text is written, so that files dropped then come here. -->
      <div v-show="mode === 'upload'" class="create-dialog__upload">
        <FileDropZone
          :queue="queue"
          :course-id="courseId"
          kind="material"
          multiple
          page-drop
          :disabled="!course.writable || pending"
          :label="t('materials.create.dropLabel')"
          @added="onAdded"
        >
          <template #item="{ item }">
            <el-input
              v-if="item && item.status !== 'failed' && item.status !== 'cancelled'"
              v-model="titles[item.id]"
              size="small"
              maxlength="300"
              class="create-dialog__file-title"
              :placeholder="t('materials.create.namePlaceholder')"
              :aria-label="t('materials.create.titleOf', { name: item.name })"
              :disabled="pending"
            >
              <template #prepend>{{ t('materials.create.name') }}</template>
            </el-input>
          </template>
        </FileDropZone>
        <div class="create-dialog__switch">
          <el-button link type="primary" @click="mode = 'text'">
            <el-icon><EditPen /></el-icon>
            <span>{{ t('materials.create.writeInstead') }}</span>
          </el-button>
        </div>
        <p v-if="leftOut" class="app-form-hint create-dialog__left-out">
          {{ t('materials.create.leftOut', { n: leftOut }, leftOut) }}
        </p>
      </div>

      <template v-if="mode === 'text'">
        <div class="create-dialog__row">
          <el-form-item :label="t('materials.create.name')" prop="title" class="create-dialog__title">
            <el-input v-model="form.title" :placeholder="t('materials.create.namePlaceholder')" maxlength="300" />
          </el-form-item>
          <el-form-item :label="t('materials.create.sortOrder')" prop="sortOrder" class="create-dialog__order">
            <el-input-number
              v-model="form.sortOrder"
              :step="1"
              step-strictly
              :min="-100000"
              :max="100000"
              controls-position="right"
            />
          </el-form-item>
        </div>
        <p class="app-form-hint create-dialog__hint">{{ t('materials.create.sortOrderHint') }}</p>

        <el-form-item :label="t('materials.create.body')">
          <MarkdownEditor v-model="form.body" :rows="10" />
          <div class="create-dialog__switch">
            <el-button link type="primary" @click="mode = 'upload'">
              <el-icon><Upload /></el-icon>
              <span>{{ t('materials.create.uploadInstead') }}</span>
            </el-button>
          </div>
        </el-form-item>
      </template>

      <el-form-item v-else :label="t('materials.create.sortOrder')" class="create-dialog__order-upload">
        <div class="create-dialog__stack">
          <el-input-number
            v-model="form.sortOrder"
            :step="1"
            step-strictly
            :min="-100000"
            :max="100000"
            controls-position="right"
          />
          <div class="app-form-hint">
            {{ ready.length > 1 ? t('materials.create.sortOrderMany') : t('materials.create.sortOrderHint') }}
          </div>
        </div>
      </el-form-item>

      <el-form-item>
        <div class="create-dialog__stack">
          <el-checkbox v-model="form.publish" :disabled="!canPublish" :label="t('materials.create.publish')" />
          <div class="app-form-hint">
            {{
              canPublish
                ? t('materials.create.publishHint')
                : mode === 'upload'
                  ? t('materials.create.publishNeedsFile')
                  : t('materials.create.publishNeedsContent')
            }}
          </div>
        </div>
      </el-form-item>

      <el-alert
        v-if="mode === 'text' && !hasText"
        type="info"
        :closable="false"
        :title="t('materials.create.emptyNote')"
        class="create-dialog__empty"
      />
    </el-form>
    <template #footer>
      <div class="create-dialog__footer">
        <span v-if="blocked && !pending" class="create-dialog__why">{{ blocked }}</span>
        <span class="create-dialog__buttons">
          <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
          <el-button type="primary" :loading="pending" :disabled="!course.writable || !!blocked" @click="submit">
            {{ submitLabel }}
          </el-button>
        </span>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.create-dialog__approval {
  margin-bottom: 16px;
}
.create-dialog__upload {
  margin-bottom: 18px;
}
.create-dialog__switch {
  margin-top: 8px;
}
.create-dialog__left-out {
  margin: 4px 0 0;
}
.create-dialog__file-title {
  margin-top: 2px;
}
.create-dialog__row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.create-dialog__title {
  flex: 1 1 260px;
  margin-bottom: 0;
}
.create-dialog__order {
  flex: 0 0 150px;
  margin-bottom: 0;
}
.create-dialog__hint {
  margin: 4px 0 18px;
}
.create-dialog__stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}
.create-dialog__empty {
  margin-top: -4px;
}
.create-dialog__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.create-dialog__why {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: left;
}
/* The buttons keep together at the right, under the reason where there is no room beside it. */
.create-dialog__buttons {
  display: inline-flex;
  gap: 12px;
  margin-left: auto;
}
.create-dialog__buttons .el-button + .el-button {
  margin-left: 0;
}
</style>
