<script setup lang="ts">
// Who made an action: the seat by name (with an agent's mark), or, for a row
// made from no seat (the system's sweeps, a platform administrator), the actor.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'

const props = defineProps<{ memberId?: string | null; actorId?: string | null; showKind?: boolean }>()
const course = useCourseStore()
const { t } = useI18n()
onMounted(() => void course.ensureMembers())

const kind = computed(() => (props.memberId ? course.members.get(props.memberId)?.kind : undefined))
</script>

<template>
  <span class="action-actor">
    <template v-if="memberId">
      <MemberName :id="memberId" show-kind />
      <StatusTag v-if="showKind && kind === 'agent'" vocab="actorKind" :value="kind" />
    </template>
    <template v-else>
      <el-tooltip :content="t('actions.summary.noActor')" placement="top">
        <el-icon class="action-actor__system"><Monitor /></el-icon>
      </el-tooltip>
      <IdText :id="actorId" />
    </template>
  </span>
</template>

<style scoped>
.action-actor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.action-actor__system {
  color: var(--el-text-color-secondary);
}
</style>
