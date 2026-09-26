<script setup lang="ts">
// course.seat_instructor: how a course gets its first member. The instructor
// is found in the directory (actor.list) by a piece of their name or email,
// or by a pasted ID (actor.get), so that the administrator sees who they are
// about to seat. On a Core without the directory, a pasted ID is the way.
//
// Once the course is known to have members the card no longer offers the
// form first: it shows the instructors where the administrator's own seat
// may read the member list, or else whom they seated here, and the way to
// the course's Members page. An administrator without a seat cannot read
// the members of a course, so a course seated before this page was opened
// looks the same as a new one: the form is shown, with words true of both.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, read } from '@/api/http'
import type { Actor, MemberSummary } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import { shortId } from '@/utils/format'
import IdText from '@/components/IdText.vue'
import StatusTag from '@/components/StatusTag.vue'
import ActorSummary from './ActorSummary.vue'
import { probeActorList, useActorSearch } from './actorSearch'

const props = defineProps<{ courseId: string; disabled?: boolean }>()
const emit = defineEmits<{ seated: [memberId: string, actorId: string] }>()
const { t } = useI18n()
const session = useSessionStore()

const selectedId = ref('')
const found = ref<Actor | null>(null)
const pickError = ref<string | null>(null)
const seated = ref<{ memberId: string; name: string } | null>(null)
const { run, pending } = useWrite('course.seat_instructor')

// --- Who is seated already -------------------------------------------------------
/** The administrator's own seat here, if any: a course with one has members. */
const mySeat = computed(() => session.membershipFor(props.courseId))
/** Their seat, unless it has expired: Core seats no one twice, but seats again over an expired seat. */
const liveSeat = computed(() => {
  const s = mySeat.value
  return !!s && !(s.expires_at && Date.parse(s.expires_at) <= Date.now())
})
/** Seated from this card since the page was opened. */
const seatedHere = ref<{ memberId: string; actorId: string; name: string }[]>([])
/**
 * The administrator seated themselves from this card: they have a seat,
 * whether or not me.memberships has answered yet (or at all).
 */
const seatedSelf = computed(() => !!session.me && seatedHere.value.some((p) => p.actorId === session.me!.id))
/** The course's instructors, when the administrator's seat may read the member list; null when not known. */
const instructors = ref<MemberSummary[] | null>(null)
const instructorsRefused = ref(false)
const instructorsLoading = ref(false)

// Loads overlap when the seat changes while one is under way: only the latest counts.
let loads = 0
/** Reads the instructors again; `keep` leaves the list up until the answer is in. */
async function loadInstructors(keep = false) {
  const mine = ++loads
  if (!keep || !mySeat.value) {
    instructors.value = null
    instructorsRefused.value = false
  }
  if (!mySeat.value) {
    instructorsLoading.value = false
    return
  }
  instructorsLoading.value = true
  try {
    const out = await read('member.list', { course_id: props.courseId, role: 'instructor', limit: 50 })
    if (mine !== loads) return
    const now = Date.now()
    instructors.value = (out.members ?? []).filter(
      (m) => m.status !== 'removed' && !(m.expires_at && new Date(m.expires_at).getTime() <= now),
    )
    instructorsRefused.value = false
  } catch (e) {
    if (mine !== loads) return
    instructors.value = null
    instructorsRefused.value = e instanceof ApiError && e.isForbidden
  } finally {
    if (mine === loads) instructorsLoading.value = false
  }
}
// Keyed on the values, not on the seat object: me.memberships read again
// (after activating or archiving the course, say) gives a new object for the
// same seat, and the list then stays as it is.
watch([() => props.courseId, () => mySeat.value?.member_id, () => mySeat.value?.role], () => void loadInstructors(), {
  immediate: true,
})
watch(
  () => props.courseId,
  () => {
    seatedHere.value = []
    seated.value = null
    formOpen.value = false
  },
)

/** What to say about the instructors, where they are not listed. */
const rosterNote = computed(() => {
  // None: the intro says so (noInstructorsIntro).
  if (instructors.value) return null
  if (!mySeat.value) return seatedSelf.value ? null : t('admin.seat.notListed')
  return instructorsRefused.value ? t('admin.seat.cannotList') : t('admin.seat.listFailed')
})

/** The course certainly has members: the form gives way to who is seated. */
const hasMembers = computed(() => !!mySeat.value || seatedHere.value.length > 0 || !!instructors.value?.length)
/** "Seat another instructor" was asked for. */
const formOpen = ref(false)
const showForm = computed(() => !hasMembers.value || formOpen.value)
/** Members are known and none is an instructor: the course needs one, not "another". */
const noInstructor = computed(() => instructors.value?.length === 0)
/** The administrator has a seat here already, so "Me" is not offered. */
const selfSeated = computed(() => liveSeat.value || seatedSelf.value)

const { options, searching, error: searchError, search, onVisible, hasActorList } = useActorSearch()
/** This Core has no directory: the instructor is found by a pasted ID. */
const idOnly = computed(() => hasActorList.value === false)
onMounted(() => void probeActorList())

function pick(id: string | undefined) {
  pickError.value = null
  found.value = (id && options.value.find((a) => a.id === id)) || null
}

async function pickMe() {
  if (!session.me) return
  pickError.value = null
  try {
    const me = await read('actor.get', { actor_id: session.me.id })
    options.value = [me, ...options.value.filter((a) => a.id !== me.id)]
    selectedId.value = me.id
    found.value = me
  } catch (e) {
    pickError.value = errorMessage(e)
  }
}

const blocker = computed(() => {
  const a = found.value
  if (!a) return null
  if (a.kind === 'system') return t('admin.seat.system')
  if (a.status !== 'active') return t('admin.seat.suspended')
  if (a.id === session.me?.id && selfSeated.value) return t('admin.seat.alreadySeated')
  return null
})

async function seat() {
  const a = found.value
  if (!a || blocker.value) return
  const out = await run(
    { course_id: props.courseId, actor_id: a.id },
    { success: t('admin.seat.done', { name: a.display_name }) },
  )
  if (!out) return
  if (out.status === 'executed') {
    seated.value = { memberId: out.result.member_id, name: a.display_name }
    seatedHere.value = [...seatedHere.value, { memberId: out.result.member_id, actorId: a.id, name: a.display_name }]
    emit('seated', out.result.member_id, a.id)
    selectedId.value = ''
    found.value = null
    formOpen.value = false
    if (mySeat.value) void loadInstructors(true)
  }
}
</script>

<template>
  <section class="app-card">
    <h2 class="app-card__title">{{ hasMembers ? t('admin.seat.seatedTitle') : t('admin.seat.title') }}</h2>
    <p class="app-muted seat__intro">
      {{
        !hasMembers
          ? t('admin.seat.intro')
          : noInstructor
            ? t('admin.seat.noInstructorsIntro')
            : t('admin.seat.hasMembers')
      }}
    </p>

    <el-alert
      v-if="disabled"
      type="info"
      :closable="false"
      show-icon
      :title="t('admin.seat.archived')"
      class="seat__alert"
    />

    <el-alert v-if="seated" type="success" show-icon class="seat__alert" @close="seated = null">
      <template #title>{{ t('admin.seat.done', { name: seated.name }) }}</template>
      <div class="seat__done">
        <span class="seat__done-label">{{ t('admin.seat.memberId') }}</span>
        <IdText :id="seated.memberId" full />
      </div>
      <div class="seat__done-hint">{{ t('admin.seat.doneHint') }}</div>
    </el-alert>

    <template v-if="hasMembers">
      <!-- The instructors, as the administrator's seat reads them … -->
      <div v-if="instructorsLoading && !instructors" class="app-muted seat__note">{{ t('common.labels.loading') }}</div>
      <ul v-else-if="instructors?.length" class="seat__people">
        <li v-for="m in instructors" :key="m.id" class="seat__person">
          <el-icon class="seat__person-icon"><Cpu v-if="m.kind === 'agent'" /><User v-else /></el-icon>
          <router-link :to="{ name: 'admin-actor', params: { actorId: m.actor_id } }" class="seat__person-name">
            {{ m.display_name }}
          </router-link>
          <span v-if="m.actor_id === session.me?.id" class="app-muted">({{ t('common.labels.you') }})</span>
          <StatusTag v-if="m.status !== 'active'" vocab="memberStatus" :value="m.status" />
        </li>
      </ul>
      <!-- … or else whom they seated here. -->
      <template v-else>
        <ul v-if="seatedHere.length" class="seat__people">
          <li v-for="p in seatedHere" :key="p.memberId" class="seat__person">
            <el-icon class="seat__person-icon"><UserFilled /></el-icon>
            <router-link :to="{ name: 'admin-actor', params: { actorId: p.actorId } }" class="seat__person-name">
              {{ p.name }}
            </router-link>
            <span v-if="p.actorId === session.me?.id" class="app-muted">({{ t('common.labels.you') }})</span>
            <span class="app-muted">{{ t('admin.seat.seatedJustNow') }}</span>
          </li>
        </ul>
        <p v-if="rosterNote" class="app-form-hint seat__note">{{ rosterNote }}</p>
      </template>

      <div class="seat__next">
        <router-link v-if="mySeat || seatedSelf" :to="{ name: 'course-members', params: { courseId } }">
          <el-button type="primary" plain>
            <el-icon><User /></el-icon>
            <span>{{ t('admin.seat.membersPage') }}</span>
          </el-button>
        </router-link>
        <span v-else class="app-form-hint seat__no-seat">{{ t('admin.seat.membersPageNeedsSeat') }}</span>
        <el-button v-if="!formOpen" text :disabled="disabled" @click="formOpen = true">
          <el-icon><Plus /></el-icon>
          <span>{{ noInstructor ? t('admin.seat.title') : t('admin.seat.another') }}</span>
        </el-button>
      </div>
    </template>

    <div v-if="showForm" class="seat__form" :class="{ 'is-another': hasMembers }">
      <label class="seat__label" for="seat-actor">{{ t('admin.seat.who') }}</label>
      <div class="seat__row">
        <el-select
          id="seat-actor"
          v-model="selectedId"
          filterable
          remote
          remote-show-suffix
          clearable
          fit-input-width
          :remote-method="search"
          :loading="searching"
          :placeholder="idOnly ? t('admin.seat.placeholderId') : t('admin.seat.placeholder')"
          :disabled="disabled"
          class="seat__select"
          @change="pick"
          @visible-change="onVisible"
        >
          <el-option v-for="a in options" :key="a.id" :value="a.id" :label="a.display_name">
            <div class="seat__option">
              <span class="seat__option-name">{{ a.display_name }}</span>
              <span class="seat__option-meta">
                <StatusTag v-if="a.status !== 'active'" vocab="actorStatus" :value="a.status" />
                <span>{{ a.email ?? t(`enums.actorKind.${a.kind}`) }}</span>
                <!-- Two may share a name: the end of the ID, as People & agents shows it, tells them apart. -->
                <code class="app-mono seat__option-id">{{ shortId(a.id) }}</code>
              </span>
            </div>
          </el-option>
          <!-- el-select shows this slot while it loads too: no "no one" before Core has answered. -->
          <template #empty>
            <div v-if="searching" class="seat__empty">{{ t('common.labels.loading') }}</div>
            <div v-else class="seat__empty">
              <span>{{ searchError ?? (idOnly ? t('admin.seat.pasteId') : t('admin.seat.noMatch')) }}</span>
              <router-link :to="{ name: 'admin-actors' }">{{ t('admin.seat.registerFirst') }}</router-link>
            </div>
          </template>
        </el-select>
        <el-button v-if="session.me && !selfSeated" text :disabled="disabled" @click="pickMe">
          {{ t('admin.seat.me') }}
        </el-button>
      </div>
      <div v-if="idOnly" class="app-form-hint">{{ t('admin.seat.noSearch') }}</div>
      <div v-if="pickError" class="seat__error">{{ pickError }}</div>

      <div v-if="found" class="seat__found">
        <ActorSummary :actor="found" link />
        <el-alert v-if="blocker" type="warning" :closable="false" show-icon :title="blocker" class="seat__warn" />
        <el-alert
          v-else-if="found.kind === 'agent'"
          type="info"
          :closable="false"
          show-icon
          :title="t('admin.seat.agent')"
          class="seat__warn"
        />
        <div class="seat__actions">
          <el-button v-if="hasMembers" @click="formOpen = false">{{ t('common.actions.cancel') }}</el-button>
          <el-button type="primary" :loading="pending" :disabled="disabled || !!blocker" @click="seat">
            <el-icon><UserFilled /></el-icon>
            <span>{{ t('admin.seat.submit') }}</span>
          </el-button>
        </div>
      </div>
      <div v-if="hasMembers && !found" class="seat__actions seat__cancel">
        <el-button @click="formOpen = false">{{ t('common.actions.cancel') }}</el-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.seat__intro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
}
.seat__alert {
  margin-bottom: 16px;
}
.seat__done {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.seat__done-label {
  color: var(--el-text-color-regular);
}
.seat__done-hint {
  margin-top: 4px;
}
.seat__label {
  display: block;
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}
.seat__row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.seat__select {
  flex: 1 1 280px;
  min-width: 0;
}
.seat__option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.seat__option-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.seat__option-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* The email or kind; StatusTag is a span before it, the ID a code after it. */
.seat__option-meta > span:last-of-type {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.seat__option-id {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.seat__empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.seat__error {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-color-danger);
}
.seat__found {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.seat__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.seat__people {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.seat__person {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 14px;
}
.seat__person-icon {
  color: var(--el-text-color-secondary);
}
.seat__person-name {
  font-weight: 600;
  text-decoration: none;
  word-break: break-word;
}
.seat__person-name:hover {
  text-decoration: underline;
}
.seat__note {
  margin: 0 0 12px;
}
.seat__next {
  display: flex;
  align-items: center;
  gap: 8px 12px;
  flex-wrap: wrap;
}
.seat__no-seat {
  margin-top: 0;
  flex: 1 1 240px;
}
.seat__form.is-another {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.seat__cancel {
  margin-top: 12px;
}
</style>
