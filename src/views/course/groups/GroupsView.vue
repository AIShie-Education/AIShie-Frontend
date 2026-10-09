<script setup lang="ts">
// A course's group sets (分組), the Groups tab (group_set.list), for every
// reader of the course. Each set holds groups that group assignments use,
// one set serving many. Staff see each set's groups, how many students are
// in none (of those their seat reaches, and said so, where it is listed to
// some), whether students may sign themselves up and until when, and the
// assignments using it; those who write assignments make a new one. A student sees their own group in each set and whether they may
// sign up to one: never another group's members, which the server does not
// show them; so does a student's own agent, for its student. Staff who neither
// read the member list nor form groups see the staff's page, read only.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { read, type WriteOutcome } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { intlLocale } from '@/i18n'
import { formatList } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import StatusTag from '@/components/StatusTag.vue'
import SetFormDialog from './components/SetFormDialog.vue'
import SignupLine from './components/SignupLine.vue'
import { forgetGroupNames } from './components/groupNames'
import { byName, listParts, liveGroups, reachesEveryStudent, type GroupSetSummary } from './components/groupModel'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const router = useRouter()
const course = useCourseStore()
const ui = useUiStore()

/** Forming groups is part of setting group work: those who write assignments do it. */
const canForm = computed(() => course.can('assignment_write'))
/**
 * A student's page: their own group in each set, and sign-up. A student's,
 * or a delegate's that neither forms groups nor reads the member list (a
 * student's own agent); staff without either see the staff's, read only.
 */
const studentView = computed(
  () => course.role === 'student' || (course.isDelegate && !(canForm.value || course.can('member_read'))),
)

/**
 * The reader's seat surely reaches every student: how many are in no group
 * is of all of them. Else it is of those it reaches, and said so.
 */
const reachesAll = computed(() =>
  reachesEveryStudent({
    student_scope: (course.seat ?? course.membership)?.student_scope,
    delegate: course.isDelegate,
  }),
)

const showArchived = ref(false)
const list = useAsync(
  () =>
    read('group_set.list', { course_id: props.courseId, include_archived: showArchived.value || undefined }).then(
      (o) => o.sets ?? [],
    ),
  { watch: [showArchived], keepData: true },
)
const sets = computed(() => list.data.value ?? [])

function myGroupName(s: GroupSetSummary): string | null {
  return s.groups?.find((g) => g.id === s.my_group_id)?.name ?? null
}
/** The others in the reader's own group, by name: the server names them to their groupmates alone. */
function groupmates(s: GroupSetSummary): string {
  void ui.locale
  const mine = s.groups?.find((g) => g.id === s.my_group_id)
  const names = byName(mine?.members ?? [], ui.locale)
    .filter((m) => m.member_id !== course.myMemberId && m.member_id !== course.principalMemberId)
    .map((m) => m.display_name ?? t('common.labels.someMember'))
  return formatList(names)
}
/** The assignments using a set, as a list in the reader's language, each a link. */
function usedBy(s: GroupSetSummary) {
  return listParts(s.assignments ?? [], (a) => a.title, intlLocale(ui.locale))
}
function groupCount(s: GroupSetSummary): number {
  return liveGroups(s).length
}

const formOpen = ref(false)
const proposed = ref<string | null>(null)
function onSaved(out: WriteOutcome<unknown>, id: string | null) {
  if (out.status === 'proposed') {
    proposed.value = out.actionId
    return
  }
  forgetGroupNames(props.courseId)
  if (id) void router.push({ name: 'course-group-set', params: { courseId: props.courseId, setId: id } })
  else void list.reload()
}
</script>

<template>
  <div class="groups">
    <PageHeader
      :title="t('groups.title')"
      :subtitle="studentView ? t('groups.subtitle.student') : t('groups.subtitle.staff')"
    >
      <template v-if="canForm && !studentView">
        <el-tooltip :content="t('common.archivedCourse')" :disabled="course.writable" placement="bottom">
          <el-button type="primary" :disabled="!course.writable" @click="formOpen = true">
            <el-icon><Plus /></el-icon>
            <span>{{ t('groups.newSet') }}</span>
          </el-button>
        </el-tooltip>
        <StatusTag
          v-if="course.needsApproval('assignment_write')"
          vocab="level"
          value="confirm_required"
          size="default"
        />
      </template>
    </PageHeader>

    <AppNote v-if="proposed" :title="t('groups.proposed.title')" class="groups__note" closable @close="proposed = null">
      <router-link :to="{ name: 'course-action', params: { courseId, actionId: proposed } }">
        {{ t('groups.proposed.view') }}
      </router-link>
    </AppNote>

    <section class="app-card">
      <div class="app-toolbar">
        <h2 class="groups__heading">{{ t('groups.list.heading') }}</h2>
        <span class="app-toolbar__spacer" />
        <el-checkbox v-if="!studentView" v-model="showArchived" :label="t('groups.list.showArchived')" border />
        <RefreshButton :loading="list.loading.value && !!list.data.value" @click="list.reload" />
      </div>
      <AsyncState
        :loading="list.loading.value && !list.data.value"
        :error="list.error.value"
        :empty="!sets.length"
        :empty-text="studentView ? t('groups.empty.student') : t('groups.empty.staff')"
        @retry="list.reload"
      >
        <ul class="groups__list">
          <li v-for="s in sets" :key="s.id" class="groups__row" :class="{ 'is-archived': !!s.archived_at }">
            <div class="groups__row-head">
              <router-link :to="{ name: 'course-group-set', params: { courseId, setId: s.id } }" class="groups__name">
                {{ s.name }}
              </router-link>
              <AppTag v-if="s.archived_at">{{ t('groups.archived') }}</AppTag>
            </div>
            <p v-if="s.description" class="groups__description">{{ s.description }}</p>
            <p class="groups__facts">
              <template v-if="studentView">
                <span v-if="myGroupName(s)" class="groups__mine">
                  {{ t('groups.list.yourGroup', { name: myGroupName(s) }) }}
                  <span v-if="groupmates(s)" class="groups__mates">{{
                    t('groups.list.with', { names: groupmates(s) })
                  }}</span>
                </span>
                <span v-else>{{ t('groups.list.noGroup') }}</span>
              </template>
              <template v-else>
                <span>{{ t('groups.list.groups', { n: groupCount(s) }, groupCount(s)) }}</span
                ><template v-if="s.unassigned_count !== undefined && s.unassigned_count !== null"
                  >{{ t('common.sep')
                  }}<span :class="{ groups__unassigned: s.unassigned_count > 0 }">{{
                    s.unassigned_count > 0
                      ? t(
                          reachesAll ? 'groups.list.unassigned' : 'groups.list.unassignedReached',
                          { n: s.unassigned_count },
                          s.unassigned_count,
                        )
                      : t(reachesAll ? 'groups.list.allPlaced' : 'groups.list.allPlacedReached')
                  }}</span></template
                >
              </template>
            </p>
            <p class="groups__signup"><SignupLine :signup="s.signup" :staff="!studentView" /></p>
            <i18n-t v-if="s.assignments?.length" keypath="common.pair" tag="p" scope="global" class="groups__used">
              <template #label>{{ t('groups.list.usedBy') }}</template>
              <template #value>
                <template v-for="part in usedBy(s)" :key="part.key">
                  <template v-if="'item' in part"
                    ><router-link
                      :to="{ name: 'course-assignment', params: { courseId, assignmentId: part.item.assignment_id } }"
                      >{{ part.item.title }}</router-link
                    ><span v-if="!part.item.published" class="groups__unpublished">{{
                      t('common.bracketed', { text: t('groups.list.unpublished') })
                    }}</span></template
                  ><template v-else>{{ part.text }}</template>
                </template>
              </template>
            </i18n-t>
            <p v-else-if="!studentView" class="groups__used app-muted">{{ t('groups.list.notUsed') }}</p>
          </li>
        </ul>
      </AsyncState>
    </section>

    <SetFormDialog v-if="canForm" v-model="formOpen" :course-id="courseId" @saved="onSaved" />
  </div>
</template>

<style scoped>
.groups__note {
  margin-bottom: 16px;
}
.groups__heading {
  margin: 0;
  font-size: var(--app-text-lg);
  font-weight: var(--app-weight-strong);
}
.groups__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.groups__row {
  padding: var(--app-space-md) 0;
  border-top: 1px solid var(--app-line);
}
.groups__row:first-child {
  border-top: 0;
  padding-top: 0;
}
.groups__row.is-archived .groups__name {
  color: var(--app-ink-2);
}
.groups__row-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-sm);
}
.groups__name {
  font-size: var(--app-text-lg);
  font-weight: var(--app-weight-strong);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.groups__name:hover {
  text-decoration: underline;
}
.groups__description {
  margin: var(--app-space-xs) 0 0;
  color: var(--app-ink-2);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.groups__facts,
.groups__signup,
.groups__used {
  margin: var(--app-space-xs) 0 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-ui);
}
.groups__mates {
  color: var(--app-ink-2);
}
.groups__unassigned {
  font-weight: var(--app-weight-strong);
}
.groups__unpublished {
  color: var(--app-ink-3);
}
</style>
