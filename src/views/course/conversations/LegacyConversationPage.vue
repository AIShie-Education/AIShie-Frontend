<script setup lang="ts">
// A stable address for one old Core conversation. The id is never handed to
// the AR chat store: the detail asks Core whether this reader may read it.
import { useI18n } from 'vue-i18n'
import LegacyConversationDetail from '@/components/chat/LegacyConversationDetail.vue'
import PageHeader from '@/components/PageHeader.vue'

defineProps<{ courseId: string; conversationId: string }>()
const { t } = useI18n()
</script>

<template>
  <div class="legacy-conversation-page">
    <PageHeader
      :title="t('legacyChat.title')"
      :subtitle="t('legacyChat.subtitle')"
      :back="{ name: 'course-overview', params: { courseId } }"
    />
    <LegacyConversationDetail :course-id="courseId" :conversation-id="conversationId" />
  </div>
</template>

<style scoped>
.legacy-conversation-page {
  min-width: 0;
}
</style>
