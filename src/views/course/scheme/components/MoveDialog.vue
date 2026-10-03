<script setup lang="ts">
// Moves a component, with everything beneath it, under another parent
// (component.move). A component cannot go beneath itself, nor under one that
// is graded directly or holds assignments; Core refuses these too. Once a
// grade has been entered beneath it, moving it writes again, at once, every
// posted total it changes, which the dialog says, and how many it wrote. A
// place that may hold assignments the caller cannot see is offered with a
// caution.
import { Location } from '@element-plus/icons-vue'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useWrite } from '@/composables/useWrite'
import { formatDecimal } from '@/utils/format'
import {
  gradedBeneath,
  moveBlock,
  nodeName,
  pct,
  shareWith,
  type GradeFacts,
  type Scheme,
  type SchemeNode,
} from './schemeModel'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  courseId: string
  scheme: Scheme
  target: SchemeNode | null
  facts: GradeFacts | null
  needsApproval: boolean
}>()
const emit = defineEmits<{
  done: [status: 'executed' | 'proposed']
  /** Core refused by a rule: what the page knows may be out of date. */
  refused: []
}>()
const { t } = useI18n()
/** A node's name as shown: the root still named by Core, in the reader's words. */
const nameOf = (n: SchemeNode) => nodeName(n, t('scheme.rootName'))
const { run, pending, lastError } = useWrite('component.move')

const newParentId = ref<string>('')

watch(visible, (open) => {
  if (open) newParentId.value = ''
})

/** Offered as a new place, but it may hold assignments the caller cannot see, and then Core refuses. */
function cautionText(to: SchemeNode): string | null {
  return to.kind === 'unseen' ? t('scheme.reasons.unseen', { name: nameOf(to) }) : null
}

const options = computed(() => {
  const n = props.target
  if (!n) return []
  return props.scheme.nodes.map((to) => {
    const b = moveBlock(n, to)
    const why =
      b === 'self'
        ? t('scheme.reasons.self')
        : b === 'current'
          ? t('scheme.move.current')
          : b
            ? t(`scheme.reasons.${b}`, { name: nameOf(to) })
            : (cautionText(to) ?? '')
    return { node: to, disabled: !!b, why, current: b === 'current' }
  })
})
const anywhere = computed(() => options.value.some((o) => !o.disabled))
const graded = computed(() => !!props.target && gradedBeneath(props.target, props.facts))
const newParent = computed(() => (newParentId.value ? (props.scheme.byId.get(newParentId.value) ?? null) : null))
/** What is known now about the chosen place: the assignments may have been read again since it was chosen. */
const newParentOption = computed(() => options.value.find((o) => o.node.id === newParentId.value) ?? null)

const preview = computed(() => {
  const n = props.target
  const p = newParent.value
  if (!n || !p) return null
  const share = shareWith(p.children, n.id, n.weight)
  return share === null
    ? t('scheme.form.shareNone')
    : t('scheme.move.sharePreview', { weight: formatDecimal(n.c.weight, 4), share: pct(share), parent: nameOf(p) })
})

async function submit() {
  const n = props.target
  if (!n || !newParentId.value || newParentOption.value?.disabled) return
  const out = await run(
    { course_id: props.courseId, component_id: n.id, new_parent_id: newParentId.value },
    { success: false, reasons: 'grades.pointsChange.refusal' },
  )
  if (!out) {
    const err = lastError.value
    if (err && (err.code === 'failed_precondition' || err.code === 'conflict')) emit('refused')
    return
  }
  if (out.status === 'executed' && !out.replayed) {
    ElMessage({
      type: 'success',
      message: out.result.snapshots
        ? t('scheme.outcome.movedTotals', { n: out.result.snapshots })
        : t('scheme.outcome.moved'),
    })
  }
  visible.value = false
  emit('done', out.status)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('scheme.move.title', { name: target ? nameOf(target) : '' })"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
    append-to-body
  >
    <AppNote v-if="needsApproval" class="md-alert">{{ t('scheme.form.needsApproval') }}</AppNote>
    <el-alert
      v-if="graded"
      type="warning"
      :closable="false"
      show-icon
      :title="t('scheme.move.graded')"
      class="md-alert"
    />
    <AppNote v-if="!anywhere" class="md-alert">{{ t('scheme.move.noTarget') }}</AppNote>
    <p class="md-help">{{ t('scheme.move.help') }}</p>
    <el-form label-position="top" :disabled="pending" @submit.prevent="submit">
      <el-form-item :label="t('scheme.move.newParent')" required>
        <el-select v-model="newParentId" filterable :placeholder="t('common.actions.select')">
          <el-option
            v-for="o in options"
            :key="o.node.id"
            :value="o.node.id"
            :label="nameOf(o.node)"
            :disabled="o.disabled"
            class="md-item"
          >
            <div class="md-option" :style="{ paddingLeft: `${o.node.depth * 14}px` }">
              <span class="md-option__name">
                {{ nameOf(o.node) }}
                <AppTag v-if="o.current" variant="outline" :icon="Location">{{ t('scheme.move.current') }}</AppTag>
              </span>
              <span v-if="o.why && !o.current" class="md-option__why">{{ o.why }}</span>
            </div>
          </el-option>
        </el-select>
        <div v-if="preview" class="app-form-hint md-preview">{{ preview }}</div>
        <div v-if="newParentOption?.why" class="app-form-hint md-caution">
          <el-icon><Warning /></el-icon>{{ newParentOption.why }}
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="pending" @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="pending"
        :disabled="!newParentId || newParentOption?.disabled"
        @click="submit"
      >
        {{ t('scheme.move.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.md-item {
  height: auto;
  min-height: 34px;
  line-height: 1.3;
}
.md-alert {
  margin-bottom: 12px;
}
.md-help {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-sm);
}
.md-option {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  padding-top: 4px;
  padding-bottom: 4px;
}
.md-option__name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.md-option__why {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  white-space: normal;
}
.md-preview {
  color: var(--el-text-color-regular);
  font-weight: 500;
}
.md-caution {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.md-caution .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--el-color-warning);
}
</style>
