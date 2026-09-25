<script setup lang="ts">
// A course member by name, where the caller may read the member list; else
// "you" for the caller's own seat and a short id for anyone else.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import IdText from './IdText.vue'

const props = defineProps<{ id: string | null | undefined; showKind?: boolean }>()
const course = useCourseStore()
const { t } = useI18n()
onMounted(() => void course.ensureMembers())

const isMe = computed(() => !!props.id && props.id === course.myMemberId)
const member = computed(() => (props.id ? course.members.get(props.id) : undefined))
const name = computed(() => course.memberName(props.id))
</script>

<template>
  <span v-if="!id">—</span>
  <span v-else-if="name" class="member-name" :title="id">
    <el-icon v-if="showKind && member?.kind === 'agent'" class="member-name__agent"><Cpu /></el-icon>
    {{ name }}
    <span v-if="isMe" class="member-name__me">({{ t('common.labels.you') }})</span>
  </span>
  <IdText v-else :id="id" />
</template>

<style scoped>
.member-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.member-name__me {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.member-name__agent {
  color: var(--el-color-primary);
}
</style>
