<script setup lang="ts">
// A UUID shown short, in full on hover, with a copy button. Quiet: an id is
// there for an administrator to find or paste, and is no person's name.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { shortId } from '@/utils/format'
defineProps<{ id: string | null | undefined; full?: boolean }>()
const { t } = useI18n()
const copied = ref(false)
async function copy(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* clipboard refused: the id is still selectable */
  }
}
</script>

<template>
  <span v-if="id" class="id-text">
    <el-tooltip :content="id" placement="top" :disabled="full">
      <code class="id-text__code">{{ full ? id : shortId(id) }}</code>
    </el-tooltip>
    <el-tooltip :content="copied ? t('common.actions.copied') : t('common.copyId')" placement="top">
      <el-icon class="id-text__copy" @click.stop="copy(id)"><CopyDocument /></el-icon>
    </el-tooltip>
  </span>
  <span v-else class="id-text id-text--none">—</span>
</template>

<style scoped>
.id-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
/* An id is there to be found or pasted, not read: quiet, 12px, in the third ink, never a chip. */
.id-text__code {
  font-family: var(--app-font-mono);
  font-size: 12px;
  color: var(--app-ink-3);
  user-select: all;
}
.id-text__copy {
  cursor: pointer;
  color: var(--app-ink-3);
}
/* Where there is a pointer, the copy button shows on the row or the id it is for. */
@media (hover: hover) {
  .id-text__copy {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .id-text:hover .id-text__copy,
  .el-table__row:hover .id-text__copy {
    opacity: 1;
  }
}
.id-text__copy:hover {
  color: var(--el-color-primary);
}
</style>
