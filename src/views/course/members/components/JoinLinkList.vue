<script setup lang="ts">
// A course's invite links (course.join_link_list): what state each is in and,
// while it works, how long it has left; how many have joined through it, out
// of how many it allows; whom it lets in, and who created it. Never a link's
// address: Core keeps only its token's hash.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TimeText from '@/components/TimeText.vue'
import { formatNumber } from '@/utils/format'
import { formatCountdown, remainingMs } from '@/utils/countdown'
import { useCoreNow } from '@/composables/useCountdown'
import type { JoinLink } from '@/api/types'
import { compareJoinLinks, JOIN_LINK_STATUS_TAG, joinLinkStatus, type JoinLinkStatus } from './joinLinks'

const props = defineProps<{
  courseId: string
  links: JoinLink[]
  /** The link being revoked, whose button waits. */
  revoking?: string | null
  /** Whether revoking is offered (member_invite, in a course that is not archived). */
  canRevoke: boolean
  /** The link shown above the list, the one just created. */
  currentId?: string | null
}>()
const emit = defineEmits<{ revoke: [link: JoinLink]; leave: [] }>()
const { t, te } = useI18n()
const now = useCoreNow()

const showEnded = ref(false)
const all = computed(() =>
  props.links.map((l) => ({ l, status: joinLinkStatus(l, now.value), created_at: l.created_at })),
)
const endedCount = computed(() => all.value.filter((x) => x.status !== 'live').length)
const shown = computed(() =>
  all.value.filter((x) => showEnded.value || x.status === 'live').sort(compareJoinLinks),
)

function uses(l: JoinLink): string {
  return l.max_uses
    ? t('join.links.usesOf', { uses: formatNumber(l.uses, 0), max: formatNumber(l.max_uses, 0) })
    : t('join.links.usesNoLimit', { uses: formatNumber(l.uses, 0) })
}
function left(l: JoinLink): string {
  return formatCountdown(remainingMs(l.expires_at, now.value))
}
/** Why a link that has not ended lets nobody in now (the course archived, its creator's authority gone); null when it does. */
function stopped(l: JoinLink, s: JoinLinkStatus): string | null {
  if (s !== 'live' || l.joinable !== false) return null
  const key = `join.links.stopped.${l.reason}`
  return l.reason && te(key) ? t(key) : t('join.links.stopped.other')
}
</script>

<template>
  <div class="join-list">
    <div v-if="endedCount" class="join-list__toolbar">
      <el-switch v-model="showEnded" :active-text="t('join.links.list.showEnded', { n: endedCount })" />
    </div>
    <el-empty
      v-if="!shown.length"
      :image-size="64"
      :description="links.length ? t('join.links.list.noneLive') : t('join.links.list.empty')"
    />
    <ul v-else class="join-list__items">
      <li
        v-for="{ l, status } in shown"
        :key="l.id"
        class="join-link"
        :class="{ 'is-ended': status !== 'live' }"
        :data-link-id="l.id"
      >
        <div class="join-link__head">
          <el-tag :type="JOIN_LINK_STATUS_TAG[status]" size="small" effect="light">
            {{ t(`join.links.status.${status}`) }}
          </el-tag>
          <el-tag v-if="stopped(l, status)" type="warning" size="small" effect="plain">{{ stopped(l, status) }}</el-tag>
          <el-tag v-if="l.id === currentId" size="small" effect="plain">{{ t('join.links.list.shownAbove') }}</el-tag>
          <span v-if="status === 'live'" class="join-link__left">
            <el-icon><Timer /></el-icon>
            <span class="join-link__left-label">{{ t('join.links.list.timeLeft') }}</span>
            <span class="join-link__clock">{{ left(l) }}</span>
          </span>
          <span class="app-toolbar__spacer" />
          <el-button
            v-if="canRevoke && status === 'live'"
            size="small"
            type="danger"
            plain
            :loading="revoking === l.id"
            @click="emit('revoke', l)"
          >
            {{ t('join.links.revoke') }}
          </el-button>
        </div>
        <dl class="join-link__facts">
          <div>
            <dt>{{ t('join.links.list.uses') }}</dt>
            <dd>
              <span class="join-link__uses">{{ uses(l) }}</span>
              <router-link
                v-if="l.uses > 0"
                :to="{ name: 'course-members', params: { courseId }, query: { link: l.id } }"
                class="join-link__who"
                @click="emit('leave')"
              >
                {{ t('join.seeWho') }}
              </router-link>
            </dd>
          </div>
          <div>
            <dt>{{ t('join.links.list.domains') }}</dt>
            <dd class="join-link__domains">
              <template v-if="l.allowed_email_domains?.length">
                <el-tag v-for="d in l.allowed_email_domains" :key="d" size="small" type="info">@{{ d }}</el-tag>
              </template>
              <span v-else>{{ t('join.links.anyEmail') }}</span>
            </dd>
          </div>
          <div>
            <dt>{{ t('join.links.list.createdBy') }}</dt>
            <dd>{{ l.created_by_name || '—' }}{{ t('common.sep') }}<TimeText :value="l.created_at" relative /></dd>
          </div>
          <div v-if="status === 'revoked' && l.revoked_at">
            <dt>{{ t('join.links.list.revokedBy') }}</dt>
            <dd>{{ l.revoked_by_name || '—' }}{{ t('common.sep') }}<TimeText :value="l.revoked_at" relative /></dd>
          </div>
          <div v-else-if="status === 'expired'">
            <dt>{{ t('join.links.list.ended') }}</dt>
            <dd><TimeText :value="l.expires_at" relative cutoff /></dd>
          </div>
        </dl>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.join-list__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.join-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.join-link {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-card, 8px);
  padding: 10px 12px;
}
.join-link.is-ended {
  opacity: 0.72;
}
.join-link__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.join-link__left {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-regular);
}
.join-link__left-label {
  color: var(--el-text-color-secondary);
}
.join-link__clock {
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
  color: var(--el-color-primary);
}
.join-link__uses {
  font-variant-numeric: tabular-nums;
}
.join-link__who {
  margin-left: 8px;
}
.join-link__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px 16px;
  margin: 8px 0 0;
  font-size: var(--app-text-sm);
}
.join-link__facts dt {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.join-link__facts dd {
  margin: 2px 0 0;
}
.join-link__domains {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
