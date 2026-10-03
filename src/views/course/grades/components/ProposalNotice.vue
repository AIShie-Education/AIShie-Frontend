<script setup lang="ts">
// Says that something the person did is now a proposal waiting for approval,
// and where to follow it. Nothing it would have made exists yet.
import { useI18n } from 'vue-i18n'

defineProps<{ courseId: string; title: string; body?: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
import AppNote from '@/components/AppNote.vue'
</script>

<template>
  <AppNote :title="title" class="proposal-notice" @close="emit('close')" closable>
    <p v-if="body" class="proposal-notice__body">{{ body }}</p>
    <router-link :to="{ name: 'course-my-actions', params: { courseId } }" class="proposal-notice__link">
      {{ t('grades.proposal.link') }}
    </router-link>
  </AppNote>
</template>

<style scoped>
.proposal-notice {
  margin-bottom: 16px;
}
.proposal-notice__body {
  margin: 0 0 4px;
}
.proposal-notice__link {
  font-weight: 500;
}
</style>
