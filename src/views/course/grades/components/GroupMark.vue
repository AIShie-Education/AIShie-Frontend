<script setup lang="ts">
// Beside a grade in a list: that it was given from a group's grade (the
// group's name), and that the member's score was set apart from the group's
// (adjusted, by a grader) or moved by peer evaluation, in words. What and
// why are on the grade's own page.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GradeSummary } from '@/api/types'
import { useUiStore } from '@/stores/ui'
import { joinParts } from '@/utils/parts'
import { isGraderAdjustment } from '@/views/course/submissions/components/groupGrading'
import GroupGlyph from './GroupGlyph.vue'

const props = defineProps<{ group: NonNullable<GradeSummary['group']> }>()
const { t } = useI18n()
const ui = useUiStore()

const text = computed(() => {
  void ui.locale
  const parts = [props.group.group_name ?? t('groupGrading.mark.group')]
  if (isGraderAdjustment(props.group.adjustment)) parts.push(t('groupGrading.mark.adjusted'))
  else if (props.group.adjustment?.kind === 'peer') parts.push(t('groupGrading.mark.peer'))
  return joinParts(parts)
})
</script>

<template>
  <span class="group-mark" :class="{ 'is-adjusted': isGraderAdjustment(group.adjustment) }">
    <GroupGlyph />
    <span class="group-mark__sr">{{ t('groupGrading.mark.group') }}</span>
    <span>{{ text }}</span>
  </span>
</template>

<style scoped>
.group-mark {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-xs);
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
  overflow-wrap: anywhere;
}
.group-mark.is-adjusted {
  color: var(--app-ink-2);
}
.group-mark__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
