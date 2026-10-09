<script setup lang="ts">
// Where a student's or a group's work stands on the roster: a submission's
// state (StatusTag's submissionState), or, on a group assignment, a student
// in no group of its set (no_group), who hands nothing in until a teacher
// places them: amber, as what waits on someone, never the red of missing
// work, which it is not.
import { useI18n } from 'vue-i18n'
import AppTag from '@/components/AppTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import { NO_GROUP } from './rosterByGroup'

defineProps<{ value: string | null | undefined; size?: 'small' | 'default' | 'large' }>()
const { t } = useI18n()
</script>

<template>
  <AppTag v-if="value === NO_GROUP" tone="wait" :size="size ?? 'small'">{{ t('groupWork.states.no_group') }}</AppTag>
  <StatusTag v-else vocab="submissionState" :value="value" :size="size" />
</template>
