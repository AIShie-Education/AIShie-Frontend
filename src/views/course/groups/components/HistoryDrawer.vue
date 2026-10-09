<script setup lang="ts">
// Who was in which group of a set, and when (group_set.get with
// include_history, for those who may read the member list): every stay in
// one of its groups, the newest first, when it began and how (placed by
// hand, by a random split, or signed up), by whom, and when it ended and
// how (moved, taken out, dealt again by a split, left, or switched), by
// whom. Stays are never deleted: it is a record. A search keeps one
// student's. Back closes it, as it closes everything laid over a page.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useBackCloses } from '@/composables/useBackCloses'
import AsyncState from '@/components/AsyncState.vue'
import MemberName from '@/components/MemberName.vue'
import TimeText from '@/components/TimeText.vue'
import type { Stay } from './groupModel'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ courseId: string; setId: string }>()
const { t, te } = useI18n()
useBackCloses(open, () => (open.value = false))

const history = useAsync(
  () => read('group_set.get', { course_id: props.courseId, set_id: props.setId, include_history: true }),
  { immediate: false },
)
watch(open, (on) => {
  if (on) void history.reload()
})
const groupName = (id: string) => history.data.value?.groups?.find((g) => g.id === id)?.name ?? ''

const q = ref('')
const stays = computed<Stay[]>(() => {
  const all = history.data.value?.history ?? []
  const needle = q.value.trim().toLowerCase()
  return needle ? all.filter((s) => s.display_name.toLowerCase().includes(needle)) : all
})
const how = (kind: 'joined' | 'left', v: string | null | undefined) =>
  v && te(`groups.history.${kind}How.${v}`) ? t(`groups.history.${kind}How.${v}`) : (v ?? '')
</script>

<template>
  <el-drawer
    v-model="open"
    :title="t('groups.history.title')"
    size="min(560px, 100vw)"
    destroy-on-close
    class="history-drawer"
  >
    <el-input
      v-model="q"
      :placeholder="t('groups.history.search')"
      :aria-label="t('groups.history.search')"
      clearable
      class="history-drawer__search"
    >
      <template #prefix
        ><el-icon aria-hidden="true"><Search /></el-icon
      ></template>
    </el-input>
    <AsyncState
      :loading="history.loading.value"
      :error="history.error.value"
      :empty="!stays.length"
      :empty-text="q ? t('groups.history.noMatch') : t('groups.history.empty')"
      @retry="history.reload"
    >
      <ol class="history-drawer__list">
        <li v-for="s in stays" :key="s.id" class="history-drawer__stay">
          <p class="history-drawer__who">
            <span class="history-drawer__name">{{ s.display_name }}</span>
            <span class="history-drawer__group">{{ groupName(s.group_id) }}</span>
          </p>
          <p class="history-drawer__line">
            <i18n-t keypath="groups.history.joined" tag="span" scope="global">
              <template #how>{{ how('joined', s.joined_how) }}</template>
              <template #at><TimeText :value="s.joined_at" /></template>
              <template #by><MemberName :id="s.joined_by_member_id" /></template>
            </i18n-t>
          </p>
          <p v-if="s.left_at" class="history-drawer__line">
            <i18n-t keypath="groups.history.left" tag="span" scope="global">
              <template #how>{{ how('left', s.left_how) }}</template>
              <template #at><TimeText :value="s.left_at" /></template>
              <template #by><MemberName :id="s.left_by_member_id" /></template>
            </i18n-t>
          </p>
          <p v-else class="history-drawer__line history-drawer__now">{{ t('groups.history.still') }}</p>
        </li>
      </ol>
    </AsyncState>
  </el-drawer>
</template>

<style scoped>
.history-drawer__search {
  margin-bottom: var(--app-space-md);
}
.history-drawer__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.history-drawer__stay {
  padding: var(--app-space-sm) 0;
  border-top: 1px solid var(--app-line);
}
.history-drawer__stay:first-child {
  border-top: 0;
}
.history-drawer__who {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--app-space-xs) var(--app-space-md);
  margin: 0;
}
.history-drawer__name {
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.history-drawer__group {
  color: var(--app-ink-2);
  overflow-wrap: anywhere;
}
.history-drawer__line {
  margin: 2px 0 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
  line-height: var(--app-lh-ui);
}
.history-drawer__now {
  color: var(--app-ink-3);
}
</style>
