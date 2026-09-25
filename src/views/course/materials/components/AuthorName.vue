<script setup lang="ts">
// Who wrote a version. Names come from the member list, which only members
// with member_read may read; for anyone else the list is not asked for (it
// would only be refused): their own versions are "you", and another author is
// left unnamed rather than shown as an id that means nothing to them.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import MemberName from '@/components/MemberName.vue'

const props = defineProps<{ id: string }>()
const course = useCourseStore()
const session = useSessionStore()
const { t } = useI18n()

const readsMembers = computed(() => course.can('member_read'))
const isMe = computed(() => props.id === course.myMemberId)
</script>

<template>
  <MemberName v-if="readsMembers" :id="id" />
  <span v-else-if="isMe" class="author-name">
    {{ session.me?.display_name ?? t('common.labels.you') }}
    <span v-if="session.me?.display_name" class="author-name__me">({{ t('common.labels.you') }})</span>
  </span>
</template>

<style scoped>
.author-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.author-name__me {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
