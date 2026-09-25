<script setup lang="ts">
// A course member named in an event. Where the caller may read the member
// list, by name (MemberName). Where it may not (see reachOf) — a student, an
// agent whose own seat was not readable — "you" for its own seat and a short
// id for anyone else, without asking for a list it would be refused.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import { reachOf } from './feed'

const props = defineProps<{ id: string | null | undefined }>()
const course = useCourseStore()
const { t } = useI18n()
const isMe = computed(() => !!props.id && props.id === course.myMemberId)
const readsMembers = computed(() => reachOf(course).readsMembers)
</script>

<template>
  <MemberName v-if="readsMembers" :id="id" show-kind />
  <span v-else-if="isMe" class="seat-name">{{ t('common.labels.you') }}</span>
  <IdText v-else :id="id" />
</template>

<style scoped>
.seat-name {
  font-weight: 500;
}
</style>
