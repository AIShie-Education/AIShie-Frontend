<script setup lang="ts">
// Where one of the caller's agents is seated (agent.get's seats), with what
// it may do there now (its own levels, capped by the caller's seat), and
// taking it out (agent.withdraw); and the requests to seat it that wait for
// an instructor (agent.get's requests), each of which the caller may take
// back (action.withdraw). What it proposes in a course, or does under review,
// waits for the caller in that course's queue of their agents' actions, where
// they decide it, where they could have done it themselves, or take it back.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { AgentFull, AgentRequest, AgentSeat } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { seatPurpose } from '@/utils/agents'
import PermEditor from '@/components/PermEditor.vue'
import LevelIcon from '@/components/LevelIcon.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { grantedPerms, toPermLevels } from './agents'

const props = defineProps<{ agent: AgentFull }>()
const emit = defineEmits<{ changed: [] }>()
const { t, te } = useI18n()

const seats = computed(() =>
  [...(props.agent.seats ?? [])].sort((a, b) => `${a.code}${a.section}`.localeCompare(`${b.code}${b.section}`)),
)
const requests = computed(() => props.agent.requests ?? [])

function courseName(s: { code: string; section: string }): string {
  return s.section ? `${s.code} · ${s.section}` : s.code
}

/** A preset Core names that is not a built-in one is shown by its own name. */
function isBuiltinPreset(name: string | null | undefined): boolean {
  return !!name && te(`enums.preset.${name}`)
}

// --- Taking it out of a course ---------------------------------------------------
const withdrawW = useWrite('agent.withdraw')
const withdrawing = ref<string | null>(null)

async function withdraw(s: AgentSeat) {
  const ok = await ElMessageBox.confirm(
    t('agents.seats.withdrawBody', { name: props.agent.display_name, course: courseName(s) }),
    t('agents.seats.withdrawTitle', { course: courseName(s) }),
    {
      type: 'warning',
      confirmButtonText: t('agents.seats.withdraw'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    },
  ).catch(() => false)
  if (!ok) return
  withdrawing.value = s.member_id
  const out = await withdrawW.run({ actor_id: props.agent.actor_id, course_id: s.course_id }, { success: false })
  withdrawing.value = null
  if (!out) return
  if (out.status === 'executed') {
    const n = out.result.cancelled_proposals
    ElMessage({
      type: 'success',
      message: n
        ? t('agents.seats.withdrawnCancelled', { course: courseName(s), n }, n)
        : t('agents.seats.withdrawn', { course: courseName(s) }),
    })
  }
  emit('changed')
}

// --- Taking back a request ---------------------------------------------------------
const takeBackW = useWrite('action.withdraw')
const takingBack = ref<string | null>(null)

async function takeBack(r: AgentRequest) {
  const ok = await ElMessageBox.confirm(
    t('agents.requests.takeBackBody', { name: props.agent.display_name, course: courseName(r) }),
    t('agents.requests.takeBackTitle'),
    {
      type: 'warning',
      confirmButtonText: t('agents.requests.takeBack'),
      cancelButtonText: t('common.actions.cancel'),
    },
  ).catch(() => false)
  if (!ok) return
  takingBack.value = r.action_id
  const out = await takeBackW.run(
    { course_id: r.course_id, action_id: r.action_id },
    { success: t('agents.requests.takenBack', { course: courseName(r) }) },
  )
  takingBack.value = null
  // Also when refused, most likely because it was decided meanwhile: the page shows how it stands now.
  if (out || takeBackW.lastError.value) emit('changed')
}
</script>

<template>
  <section class="app-card seats-card">
    <h2 class="app-card__title">{{ t('agents.seats.title') }}</h2>
    <p class="app-form-hint seats-card__sub">{{ t('agents.seats.intro') }}</p>

    <p v-if="!seats.length && !requests.length" class="app-muted seats-card__empty">{{ t('agents.seats.empty') }}</p>

    <ul v-if="seats.length" class="agent-seats">
      <li v-for="s in seats" :key="s.member_id" class="agent-seat">
        <div class="agent-seat__head">
          <router-link :to="{ name: 'course-overview', params: { courseId: s.course_id } }" class="agent-seat__course">
            <span class="agent-seat__code"
              >{{ s.code }}<template v-if="s.section"><span class="app-sep">·</span>{{ s.section }}</template></span
            >
            <span class="agent-seat__title">{{ s.title }}</span>
          </router-link>
          <div class="agent-seat__tags">
            <StatusTag v-if="seatPurpose(s)" vocab="seatPurpose" :value="seatPurpose(s)" />
            <template v-if="s.preset && seatPurpose({ preset: s.preset }) !== seatPurpose(s)">
              <StatusTag v-if="isBuiltinPreset(s.preset)" vocab="preset" :value="s.preset" />
              <el-tag v-else type="info" size="small" disable-transitions>{{ s.preset }}</el-tag>
            </template>
            <StatusTag v-if="s.status !== 'active'" vocab="memberStatus" :value="s.status" />
            <StatusTag v-if="s.course_status !== 'active'" vocab="courseStatus" :value="s.course_status" />
          </div>
        </div>
        <div class="agent-seat__meta">
          <span>
            <span class="agent-seat__k">{{ t('agents.seats.students') }}</span>
            {{ t(`enums.scope.${s.student_scope}`) }}
          </span>
          <span>
            <span class="agent-seat__k">{{ t('agents.seats.assignments') }}</span>
            {{ t(`enums.scope.${s.assignment_scope}`) }}
          </span>
          <span>
            <span class="agent-seat__k">{{ t('agents.seats.ends') }}</span>
            <TimeText v-if="s.expires_at" :value="s.expires_at" />
            <template v-else>{{ t('agents.seats.noEnd') }}</template>
          </span>
        </div>
        <div class="agent-seat__perms">
          <span class="agent-seat__k">{{ t('agents.seats.mayNow') }}</span>
          <template v-if="grantedPerms(s.perms).length">
            <el-tag
              v-for="g in grantedPerms(s.perms)"
              :key="g.perm"
              :class="['app-level-tag', `is-${g.level}`]"
              size="small"
              :title="t(`enums.level.${g.level}`)"
              disable-transitions
            >
              <LevelIcon :level="g.level" />{{ t(`enums.perm.${g.perm}`) }}
            </el-tag>
          </template>
          <span v-else class="app-muted">
            {{
              s.status !== 'active' || s.course_status === 'archived'
                ? t('agents.seats.nothingNow')
                : t('agents.seats.nothing')
            }}
          </span>
        </div>
        <details class="agent-seat__details">
          <summary>{{ t('agents.seats.allPerms') }}</summary>
          <p class="app-form-hint">{{ t('agents.seats.cappedHint') }}</p>
          <PermEditor :model-value="toPermLevels(s.perms)" readonly size="small" />
        </details>
        <div class="agent-seat__actions">
          <router-link :to="{ name: 'course-approvals', params: { courseId: s.course_id } }" class="agent-seat__queue">
            <el-button size="small">
              <el-icon><Stamp /></el-icon>
              <span>{{ t('agents.seats.proposals') }}</span>
            </el-button>
          </router-link>
          <el-tooltip :disabled="s.course_status !== 'archived'" :content="t('agents.seats.archived')" placement="top">
            <span>
              <el-button
                type="danger"
                plain
                size="small"
                :disabled="s.course_status === 'archived'"
                :loading="withdrawing === s.member_id"
                @click="withdraw(s)"
              >
                {{ t('agents.seats.withdraw') }}
              </el-button>
            </span>
          </el-tooltip>
        </div>
      </li>
    </ul>

    <template v-if="requests.length">
      <h3 class="seats-card__subhead">{{ t('agents.requests.title') }}</h3>
      <p class="app-form-hint seats-card__sub">{{ t('agents.requests.intro') }}</p>
      <ul class="agent-requests">
        <li v-for="r in requests" :key="r.action_id" class="agent-request">
          <el-icon class="agent-request__icon"><Clock /></el-icon>
          <div class="agent-request__main">
            <router-link
              :to="{ name: 'course-overview', params: { courseId: r.course_id } }"
              class="agent-request__course"
            >
              {{ r.code }}<template v-if="r.section"><span class="app-sep">·</span>{{ r.section }}</template>
              <span class="agent-request__title">{{ r.title }}</span>
            </router-link>
            <div class="agent-request__meta">
              {{ t('agents.requests.since') }}
              <TimeText :value="r.created_at" relative />
            </div>
          </div>
          <el-button size="small" :loading="takingBack === r.action_id" @click="takeBack(r)">
            {{ t('agents.requests.takeBack') }}
          </el-button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.seats-card__sub {
  margin: -6px 0 12px;
}
.seats-card__empty {
  margin: 0;
  padding: 4px 0;
}
.seats-card__subhead {
  margin: 20px 0 10px;
  font-size: 14px;
  font-weight: 600;
}
.agent-seats,
.agent-requests {
  list-style: none;
  margin: 0;
  padding: 0;
}
.agent-seat {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.agent-seat:first-child {
  padding-top: 0;
}
.agent-seat:last-child {
  border-bottom: none;
}
.agent-seat__head {
  display: flex;
  justify-content: space-between;
  gap: 8px 12px;
  flex-wrap: wrap;
}
.agent-seat__course {
  display: flex;
  flex-direction: column;
  min-width: 0;
  text-decoration: none;
  color: inherit;
}
.agent-seat__course:hover .agent-seat__title {
  color: var(--el-color-primary);
}
.agent-seat__code {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.agent-seat__title {
  font-weight: 500;
  word-break: break-word;
}
.agent-seat__tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.agent-seat__meta,
.agent-seat__perms {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.agent-seat__perms {
  gap: 4px 6px;
}
.agent-seat__k {
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}
.agent-seat__details {
  margin-top: 8px;
  font-size: 13px;
}
.agent-seat__details summary {
  cursor: pointer;
  color: var(--el-color-primary);
}
.agent-seat__details .app-form-hint {
  margin: 6px 0;
}
.agent-seat__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.agent-seat__queue {
  text-decoration: none;
}
.agent-request {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.agent-request:last-child {
  border-bottom: none;
}
.agent-request__icon {
  flex-shrink: 0;
  color: var(--el-color-warning);
}
.agent-request__main {
  flex: 1;
  min-width: 0;
}
.agent-request__course {
  font-weight: 600;
  text-decoration: none;
  word-break: break-word;
}
.agent-request__title {
  font-weight: 400;
  color: var(--el-text-color-regular);
}
.agent-request__meta {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
