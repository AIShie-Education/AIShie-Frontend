<script setup lang="ts">
// What approving a deletion of an assignment for good (assignment.delete)
// takes, said where Approve is pressed: on its card in the approvals queue
// and in the Decide card of its page alike (DecidePanel). It cannot be
// undone; what goes with it is listed as the dialog lists it, as it would go
// now where that was read and the counts the proposer was shown otherwise;
// and where more would go now than they were shown, approving it is said to
// fail (confirm_stale). The whole comparison is on its page
// (DeletionProposal).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { goesLines } from '@/views/course/assignments/components/deletion'
import type { ActionRow } from './actionText'
import { useDeletionNow } from './deletionNow'

const props = defineProps<{ action: ActionRow; courseId: string }>()
const { t, locale } = useI18n()

const { was, current, grown, gone } = useDeletionNow(
  () => props.action,
  () => props.courseId,
)

/** Whether what is listed is what would go now, as read; else the counts the proposer was shown. */
const isNow = computed(() => !grown.value && !!current.value)
/** The counts approving it would take: those of now, unless approving would fail, and those confirmed otherwise. */
const counts = computed(() => (isNow.value ? current.value : was.value))
const lines = computed<string[]>(() => {
  const c = counts.value
  if (!c) return []
  // Intl's list is the language's, and Intl is not reactive.
  void locale.value
  return goesLines(c, (key, named, n) => (n === undefined ? t(key, named) : t(key, named, n)))
})
</script>

<template>
  <div class="deletion-stake">
    <p v-if="gone" class="deletion-stake__gone">{{ t('actions.deletion.gone') }}</p>
    <el-alert v-else type="warning" :closable="false" show-icon class="deletion-stake__alert">
      <template #title>{{ t('actions.deletion.approveLead') }}</template>
      <ul v-if="lines.length" class="deletion-stake__lines">
        <li v-for="line in lines" :key="line">{{ line }}</li>
      </ul>
      <p v-else-if="counts" class="deletion-stake__p">
        {{ isNow ? t('assignments.delete.nothing') : t('actions.deletion.nothing') }}
      </p>
    </el-alert>
    <el-alert v-if="grown" type="warning" :closable="false" show-icon class="deletion-stake__alert">
      <template #title>{{ t('actions.deletion.staleProposal') }}</template>
    </el-alert>
  </div>
</template>

<style scoped>
.deletion-stake {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.deletion-stake__lines {
  margin: 4px 0 0;
  padding-left: 18px;
  line-height: var(--app-lh-text);
}
.deletion-stake__p,
.deletion-stake__gone {
  margin: 4px 0 0;
  line-height: var(--app-lh-text);
}
.deletion-stake__gone {
  margin: 0;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
</style>
