<script setup lang="ts">
// The course's members, people and agents alike (member.list), and adding one
// (member.add). Each row is a seat: its roster role, status, reach, lifetime
// and the preset its levels were copied from, and for a person who has one,
// the student or staff number they sign in with.
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { read } from '@/api/http'
import { isUuid } from '@/utils/format'
import { ROLES, type Member, type MemberSummary } from '@/api/types'
import { usePaged } from '@/composables/useAsync'
import { useContainerNarrow, useTableRelayout } from '@/composables/useContainerWidth'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AgentBadge from '@/components/AgentBadge.vue'
import AgentName from '@/components/AgentName.vue'
import AgentSeatIcon from '@/components/AgentSeatIcon.vue'
import AsyncState from '@/components/AsyncState.vue'
import HostingTag from '@/components/HostingTag.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import RoleTag from '@/components/RoleTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import AddMemberDialog from './components/AddMemberDialog.vue'
import JoinLinksDialog from './components/JoinLinksDialog.vue'
import ScopeSummary from './components/ScopeSummary.vue'
import { isExpired, presetLabel, usePresets } from './components/seat'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const course = useCourseStore()
const session = useSessionStore()
// Role and status go under the name, and the preset and dates are left out
// (they are on the member's page), where the page is narrower than 720 px (the
// list's toolbar 669 px or less), by its own width, not the window's: the side
// bar takes from it. Wider, every column, the table scrolling sideways where
// they do not all fit.
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const narrow = useContainerNarrow(toolbar, 669)
const tableRef = useTemplateRef<{ doLayout: () => void }>('tableRef')
useTableRelayout(tableRef, narrow)
const presets = usePresets()

const PAGE = 100
const roleFilter = ref<string>('')
const includeRemoved = ref(false)
const kind = ref<'all' | 'human' | 'agent'>('all')
/** The invite link whose joiners alone are listed (?link=, from the invite links' list). */
const linkFilter = computed(() => {
  const v = route.query.link
  return typeof v === 'string' && isUuid(v) ? v : null
})
function clearLinkFilter() {
  const { link: _link, ...rest } = route.query
  void router.replace({ query: rest })
}

const list = usePaged<MemberSummary>(
  (after) =>
    read('member.list', {
      course_id: props.courseId,
      role: roleFilter.value || undefined,
      include_removed: includeRemoved.value || undefined,
      join_link_id: linkFilter.value ?? undefined,
      limit: PAGE,
      after,
    }).then((o) => ({ items: o.members, next: o.next })),
  { watch: [roleFilter, includeRemoved, linkFilter] },
)

const counts = computed(() => {
  const all = list.items.value
  return {
    all: all.length,
    human: all.filter((m) => m.kind !== 'agent').length,
    agent: all.filter((m) => m.kind === 'agent').length,
  }
})
const rows = computed(() =>
  list.items.value.filter(
    (m) => kind.value === 'all' || (kind.value === 'agent' ? m.kind === 'agent' : m.kind !== 'agent'),
  ),
)
// member.list has no kind filter, so People and Agents are picked out of the
// pages loaded so far. Nobody of that kind among them says nothing about the
// pages not yet loaded: then the empty state says so and offers the rest.
const emptyText = computed(() => {
  if (list.hasMore.value && kind.value !== 'all') {
    const n = list.items.value.length
    return kind.value === 'agent' ? t('members.emptyAgentsSoFar', { n }) : t('members.emptyPeopleSoFar', { n })
  }
  return kind.value === 'agent' ? t('members.emptyAgents') : t('members.empty')
})
/** A tab's count, marked as a lower bound while there are pages not yet loaded. */
function count(n: number): string {
  return list.hasMore.value ? `${n}+` : String(n)
}

// member.list does not carry the listed students and assignments; member.get
// does. They are fetched for the listed seats on the page — the few that are
// not students' own first (tutors, graders, TAs with a list), then students'
// — a few at a time and at most DETAIL_BUDGET per visit, so that a large class
// does not become hundreds of calls. A seat not fetched shows "listed".
const DETAIL_BUDGET = 60
const details = reactive(new Map<string, Member>())
const asked = new Set<string>()
watch(
  () => list.items.value,
  async (items) => {
    const listedSeats = items.filter(
      (m) =>
        m.status !== 'removed' && (m.student_scope === 'listed' || m.assignment_scope === 'listed') && !asked.has(m.id),
    )
    const queue = [
      ...listedSeats.filter((m) => m.role !== 'student'),
      ...listedSeats.filter((m) => m.role === 'student'),
    ].slice(0, Math.max(0, DETAIL_BUDGET - asked.size))
    queue.forEach((m) => asked.add(m.id))
    const worker = async () => {
      for (let m = queue.shift(); m; m = queue.shift()) {
        try {
          details.set(m.id, await read('member.get', { course_id: props.courseId, member_id: m.id }))
        } catch {
          /* the count stays unknown; the member's own page says why */
        }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
  },
)
function listed(m: MemberSummary, which: 'students' | 'assignments'): string[] | null | undefined {
  const d = details.get(m.id)
  if (!d) return undefined
  return which === 'students' ? (d.listed_students ?? []) : (d.listed_assignments ?? [])
}

function presetName(id: string | null | undefined): string | null {
  if (!id) return null
  const p = presets.byId.value.get(id)
  return p ? presetLabel(p) : null
}

const canManage = computed(() => course.can('member_manage'))
// Invite links are their own permission (member_invite), which a seat may
// hold without managing members, or manage members without.
const canInvite = computed(() => course.can('member_invite'))
const addOpen = ref(false)
const linksOpen = ref(false)
const proposedAction = ref<string | null>(null)

function onAdded(out: { status: 'executed'; memberId: string } | { status: 'proposed'; actionId: string }) {
  course.invalidate('members')
  if (out.status === 'executed') {
    router.push({ name: 'course-member', params: { courseId: props.courseId, memberId: out.memberId } })
    return
  }
  proposedAction.value = out.actionId
  void list.reload()
}

/** The caller's own agent. */
function mine(row: MemberSummary): boolean {
  return !!row.owner_actor_id && row.owner_actor_id === session.me?.id
}

function open(row: MemberSummary) {
  router.push({ name: 'course-member', params: { courseId: props.courseId, memberId: row.id } })
}
function rowClass({ row }: { row: MemberSummary }) {
  return row.status === 'removed' || isExpired(row.expires_at) ? 'members__row--gone' : ''
}
</script>

<template>
  <div class="members">
    <PageHeader :title="t('members.title')" :subtitle="t('members.subtitle')">
      <div v-if="canManage || canInvite" class="members__add">
        <el-button v-if="canInvite" class="members__invite" @click="linksOpen = true">
          <el-icon><Link /></el-icon>
          <span>{{ t('join.links.button') }}</span>
        </el-button>
        <el-tooltip
          v-if="canManage"
          :content="t('common.archivedCourse')"
          :disabled="course.writable"
          placement="bottom"
        >
          <el-button type="primary" :disabled="!course.writable" @click="addOpen = true">
            <el-icon><Plus /></el-icon>
            <span>{{ t('members.addMember') }}</span>
          </el-button>
        </el-tooltip>
        <StatusTag
          v-if="canManage && course.needsApproval('member_manage')"
          vocab="level"
          value="confirm_required"
          size="default"
        />
      </div>
    </PageHeader>

    <el-alert
      v-if="proposedAction"
      type="info"
      show-icon
      class="members__notice"
      :title="t('members.proposed.add')"
      @close="proposedAction = null"
    >
      <router-link :to="{ name: 'course-action', params: { courseId, actionId: proposedAction } }">
        {{ t('members.proposed.view') }}
      </router-link>
      ·
      <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
        t('members.proposed.mine')
      }}</router-link>
    </el-alert>

    <div class="app-card">
      <div v-if="!list.error.value?.isForbidden" ref="toolbar" class="app-toolbar">
        <el-radio-group v-model="kind" size="default">
          <el-radio-button value="all">{{ t('members.tabs.all') }} · {{ count(counts.all) }}</el-radio-button>
          <el-radio-button value="human">
            <el-icon class="members__tab-icon"><User /></el-icon>{{ t('members.tabs.people') }} ·
            {{ count(counts.human) }}
          </el-radio-button>
          <el-radio-button value="agent">
            <el-icon class="members__tab-icon"><AgentSeatIcon /></el-icon>{{ t('members.tabs.agents') }} ·
            {{ count(counts.agent) }}
          </el-radio-button>
        </el-radio-group>
        <span class="app-toolbar__spacer" />
        <el-tag v-if="linkFilter" closable type="primary" effect="plain" size="large" @close="clearLinkFilter">
          <el-icon class="members__tab-icon"><Link /></el-icon>{{ t('join.filtered') }}
        </el-tag>
        <el-select v-model="roleFilter" class="members__role" :placeholder="t('members.filters.anyRole')" clearable>
          <el-option value="" :label="t('members.filters.anyRole')" />
          <el-option v-for="r in ROLES" :key="r" :value="r" :label="t(`enums.role.${r}`)" />
        </el-select>
        <el-checkbox v-model="includeRemoved" :label="t('members.filters.includeRemoved')" border />
      </div>

      <AsyncState
        :loading="list.loading.value && !list.items.value.length"
        :error="list.error.value"
        :empty="!rows.length"
        :empty-text="emptyText"
        @retry="list.reload"
      >
        <template #empty>
          <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
        </template>
        <el-table
          ref="tableRef"
          :data="rows"
          row-key="id"
          class="members__table"
          :row-class-name="rowClass"
          @row-click="open"
        >
          <el-table-column
            prop="display_name"
            :label="t('members.columns.name')"
            :min-width="narrow ? 170 : 180"
            sortable
          >
            <template #default="{ row }">
              <div class="members__name">
                <!-- The avatar, the name and its "AI" never part: the name is cut short instead. -->
                <span v-if="row.kind === 'agent'" class="members__agent">
                  <AgentAvatar :name="row.display_name" size="small" />
                  <AgentName :name="row.display_name" ellipsis class="members__name-text" />
                </span>
                <template v-else>
                  <el-icon class="members__kind-icon"><User /></el-icon>
                  <!-- 「（你）」 is with the name, not a flex item after it: the line's gap would part them. -->
                  <span class="members__who"
                    ><span class="members__name-text">{{ row.display_name }}</span
                    ><span v-if="row.id === course.myMemberId" class="members__me app-you">{{
                      t('common.labels.youTag')
                    }}</span></span
                  >
                </template>
                <el-tooltip v-if="row.login_id" :content="t('members.loginId')" placement="top">
                  <code class="members__login-id" tabindex="0">{{ row.login_id }}</code>
                </el-tooltip>
                <AgentBadge v-if="row.kind === 'agent'" :owner-name="row.owner_name" :mine="mine(row)" no-ai />
                <HostingTag v-if="row.kind === 'agent'" :hosting="row.hosting" :site-chat="row.site_chat" />
                <el-tooltip v-if="row.join_link_id" :content="t('join.viaHint')" placement="top">
                  <el-tag size="small" type="info" effect="plain" class="members__via" tabindex="0">
                    <el-icon><Link /></el-icon>{{ t('join.via') }}
                  </el-tag>
                </el-tooltip>
              </div>
              <div v-if="narrow" class="members__stack">
                <RoleTag :member="row" />
                <StatusTag v-if="row.status !== 'active'" vocab="memberStatus" :value="row.status" />
                <el-tag v-if="row.status !== 'removed' && isExpired(row.expires_at)" size="small" type="info">
                  {{ t('members.expired') }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" prop="role" :label="t('members.columns.role')" min-width="150" sortable>
            <template #default="{ row }"><RoleTag :member="row" /></template>
          </el-table-column>
          <el-table-column v-if="!narrow" prop="status" :label="t('members.columns.status')" min-width="100">
            <template #default="{ row }">
              <div class="members__tags">
                <StatusTag vocab="memberStatus" :value="row.status" />
                <el-tag v-if="row.status !== 'removed' && isExpired(row.expires_at)" size="small" type="info">
                  {{ t('members.expired') }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('members.columns.scope')" :min-width="narrow ? 150 : 170">
            <template #default="{ row }">
              <ScopeSummary
                :student-scope="row.student_scope"
                :assignment-scope="row.assignment_scope"
                :students="listed(row, 'students')"
                :assignments="listed(row, 'assignments')"
                :self-id="row.id"
              />
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('members.columns.preset')" min-width="120">
            <template #default="{ row }">
              <span v-if="presetName(row.preset_id)">{{ presetName(row.preset_id) }}</span>
              <span v-else class="app-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="!narrow"
            prop="created_at"
            :label="t('members.columns.dates')"
            min-width="185"
            sortable
          >
            <template #default="{ row }">
              <div class="members__dates">
                <span class="members__date-label">{{ t('members.columns.added') }}</span>
                <TimeText :value="row.created_at" relative />
                <span class="members__date-label">{{ t('members.columns.expires') }}</span>
                <TimeText v-if="row.expires_at" :value="row.expires_at" relative />
                <span v-else class="app-muted">{{ t('members.detail.noExpiry') }}</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
        <p v-if="list.hasMore.value && kind !== 'all'" class="app-form-hint">{{ t('members.partialCounts') }}</p>
        <p v-if="kind === 'agent' && canManage" class="app-form-hint members__agents-link">
          {{ t('members.agentsHint') }}
          <router-link :to="{ name: 'course-agents', params: { courseId } }">{{ t('members.agentsPage') }}</router-link>
        </p>
      </AsyncState>
    </div>

    <AddMemberDialog
      v-if="canManage"
      v-model="addOpen"
      :course-id="courseId"
      :presets="presets.presets.value"
      :presets-loading="presets.loading.value"
      :presets-error="presets.error.value"
      @done="onAdded"
      @retry-presets="presets.reload"
    />
    <JoinLinksDialog v-if="canInvite" v-model="linksOpen" :course-id="courseId" />
  </div>
</template>

<style scoped>
.members__add {
  display: flex;
  align-items: center;
  gap: 8px;
}
.members__notice {
  margin-bottom: 16px;
}
.members__tab-icon {
  margin-right: 4px;
  vertical-align: -2px;
}
.members__role {
  width: 180px;
}
.members__table :deep(.el-table__row) {
  cursor: pointer;
}
.members__table :deep(.members__row--gone) {
  opacity: 0.6;
}
.members__name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  min-width: 0;
}
.members__agent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}
/* The name and 「（你）」 after it, with no gap between them: the name is cut short first. */
.members__who {
  display: flex;
  align-items: baseline;
  min-width: 0;
}
.members__name-text {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.members__kind-icon {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.members__via :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.members__login-id {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.members__me {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  white-space: nowrap;
}
.members__dates {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
}
.members__date-label {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.members__agents-link {
  margin-top: 12px;
}
.members__stack,
.members__tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.members__tags {
  margin-top: 0;
}
@media (max-width: 600px) {
  .members__role {
    width: 100%;
  }
  .app-card {
    padding: 12px;
  }
}
</style>
