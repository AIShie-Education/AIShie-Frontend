<script setup lang="ts">
// A student's groups, on their member page, for those who may read the
// member list (group_set.list names them the members of every group their
// scope reaches): the group the student is in in each set of the course, or
// that they are in none, each set a link to its page; and, opened set by
// set, who placed them where and when (group_set.get's history, the
// student's own stays alone). Nothing is shown in a course with no sets.
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import AsyncState from '@/components/AsyncState.vue'
import MemberName from '@/components/MemberName.vue'
import TimeText from '@/components/TimeText.vue'
import type { Stay } from './groupModel'

const props = defineProps<{ courseId: string; memberId: string }>()
const { t, te } = useI18n()

const list = useAsync(() => read('group_set.list', { course_id: props.courseId }).then((o) => o.sets ?? []), {
  watch: [() => props.memberId],
})
const rows = computed(() =>
  (list.data.value ?? []).map((s) => ({
    set: s,
    group: (s.groups ?? []).find((g) => !g.archived_at && g.members?.some((m) => m.member_id === props.memberId)),
  })),
)

/** Each set's history of this student, read when it is first opened. */
type Named = Stay & { groupName: string }
const history = reactive(new Map<string, { loading: boolean; stays: Named[] | null; failed: boolean }>())
async function toggle(setId: string) {
  if (history.has(setId)) {
    history.delete(setId)
    return
  }
  history.set(setId, { loading: true, stays: null, failed: false })
  try {
    const out = await read('group_set.get', { course_id: props.courseId, set_id: setId, include_history: true })
    const names = new Map((out.groups ?? []).map((g) => [g.id, g.name]))
    const stays = (out.history ?? []).filter((s) => s.member_id === props.memberId)
    history.set(setId, {
      loading: false,
      stays: stays.map((s) => ({ ...s, groupName: names.get(s.group_id) ?? '' })),
      failed: false,
    })
  } catch {
    history.set(setId, { loading: false, stays: null, failed: true })
  }
}
const how = (kind: 'joined' | 'left', v: string | null | undefined) =>
  v && te(`groups.history.${kind}How.${v}`) ? t(`groups.history.${kind}How.${v}`) : (v ?? '')
</script>

<template>
  <section v-if="list.error.value || rows.length" class="app-card member-groups" aria-labelledby="member-groups-title">
    <h2 id="member-groups-title" class="app-card__title">{{ t('groups.member.title') }}</h2>
    <AsyncState :loading="list.loading.value" :error="list.error.value" @retry="list.reload">
      <ul class="member-groups__list">
        <li v-for="r in rows" :key="r.set.id" class="member-groups__row">
          <div class="member-groups__line">
            <router-link
              :to="{ name: 'course-group-set', params: { courseId, setId: r.set.id } }"
              class="member-groups__set"
            >
              {{ r.set.name }}
            </router-link>
            <span :class="r.group ? 'member-groups__group' : 'member-groups__none'">
              {{ r.group ? r.group.name : t('groups.member.none') }}
            </span>
            <el-button
              link
              type="primary"
              class="member-groups__toggle"
              :aria-expanded="history.has(r.set.id) ? 'true' : 'false'"
              @click="toggle(r.set.id)"
            >
              {{ history.has(r.set.id) ? t('groups.member.hideHistory') : t('groups.member.history') }}
            </el-button>
          </div>
          <template v-if="history.get(r.set.id)">
            <p v-if="history.get(r.set.id)!.loading" class="member-groups__note">{{ t('common.labels.loading') }}</p>
            <p v-else-if="history.get(r.set.id)!.failed" class="member-groups__note">
              {{ t('groups.member.historyFailed') }}
            </p>
            <p v-else-if="!history.get(r.set.id)!.stays?.length" class="member-groups__note">
              {{ t('groups.member.noHistory') }}
            </p>
            <ol v-else class="member-groups__stays">
              <li v-for="s in history.get(r.set.id)!.stays!" :key="s.id">
                <span class="member-groups__stay-group">{{ s.groupName }}</span>
                <i18n-t keypath="groups.history.joined" tag="span" scope="global">
                  <template #how>{{ how('joined', s.joined_how) }}</template>
                  <template #at><TimeText :value="s.joined_at" /></template>
                  <template #by><MemberName :id="s.joined_by_member_id" /></template>
                </i18n-t>
                <i18n-t v-if="s.left_at" keypath="groups.history.left" tag="span" scope="global">
                  <template #how>{{ how('left', s.left_how) }}</template>
                  <template #at><TimeText :value="s.left_at" /></template>
                  <template #by><MemberName :id="s.left_by_member_id" /></template>
                </i18n-t>
              </li>
            </ol>
          </template>
        </li>
      </ul>
    </AsyncState>
  </section>
</template>

<style scoped>
.member-groups__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.member-groups__row + .member-groups__row {
  border-top: 1px solid var(--app-line);
}
.member-groups__row {
  padding: var(--app-space-sm) 0;
}
.member-groups__line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--app-space-xs) var(--app-space-md);
}
.member-groups__set {
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.member-groups__none {
  color: var(--app-ink-3);
}
.member-groups__toggle {
  margin-inline-start: auto;
}
.member-groups__note {
  margin: var(--app-space-xs) 0 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
}
.member-groups__stays {
  margin: var(--app-space-xs) 0 0;
  padding-inline-start: 1.25em;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
  line-height: var(--app-lh-ui);
}
.member-groups__stays li {
  display: flex;
  flex-direction: column;
}
.member-groups__stay-group {
  color: var(--app-ink);
  font-weight: var(--app-weight-strong);
}
</style>
