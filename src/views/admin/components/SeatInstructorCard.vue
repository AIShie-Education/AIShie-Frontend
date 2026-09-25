<script setup lang="ts">
// course.seat_instructor: how a course gets its first member. The actor is
// looked up first (actor.get), so that the administrator sees who they are
// about to seat.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isApiError, read } from '@/api/http'
import type { Actor } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import { isUuid } from '@/utils/format'
import IdText from '@/components/IdText.vue'
import ActorSummary from './ActorSummary.vue'
import { useRecentActors } from './adminShared'

const props = defineProps<{ courseId: string; disabled?: boolean }>()
const emit = defineEmits<{ seated: [memberId: string, actorId: string] }>()
const { t } = useI18n()
const session = useSessionStore()
const { recent, remember } = useRecentActors()

const actorId = ref('')
const found = ref<Actor | null>(null)
const lookupError = ref<string | null>(null)
const looking = ref(false)
const seated = ref<{ memberId: string; name: string } | null>(null)
const { run, pending } = useWrite('course.seat_instructor')

watch(actorId, (v) => {
  if (found.value && found.value.id !== v.trim()) found.value = null
  lookupError.value = null
})

interface Suggestion {
  value: string
  name: string
  kind: string
}
function suggest(q: string, cb: (items: Suggestion[]) => void) {
  const needle = q.trim().toLowerCase()
  cb(
    recent.value
      .filter((a) => a.kind !== 'system')
      .filter((a) => !needle || `${a.display_name} ${a.email ?? ''} ${a.id}`.toLowerCase().includes(needle))
      .map((a) => ({ value: a.id, name: a.display_name, kind: a.kind })),
  )
}

async function lookUp() {
  const id = actorId.value.trim()
  found.value = null
  lookupError.value = null
  if (!isUuid(id)) {
    lookupError.value = t('admin.seat.invalidId')
    return
  }
  looking.value = true
  try {
    const a = await read('actor.get', { actor_id: id })
    found.value = a
    remember(a)
  } catch (e) {
    lookupError.value = isApiError(e) && e.isNotFound ? t('admin.seat.notFound') : errorMessage(e)
  } finally {
    looking.value = false
  }
}

function pickMe() {
  if (!session.me) return
  actorId.value = session.me.id
  void lookUp()
}

const blocker = computed(() => {
  const a = found.value
  if (!a) return null
  if (a.kind === 'system') return t('admin.seat.system')
  if (a.status !== 'active') return t('admin.seat.suspended')
  return null
})

async function seat() {
  const a = found.value
  if (!a || blocker.value) return
  const out = await run({ course_id: props.courseId, actor_id: a.id }, { success: t('admin.seat.done', { name: a.display_name }) })
  if (!out) return
  if (out.status === 'executed') {
    seated.value = { memberId: out.result.member_id, name: a.display_name }
    emit('seated', out.result.member_id, a.id)
    actorId.value = ''
    found.value = null
  }
}
</script>

<template>
  <section class="app-card">
    <h2 class="app-card__title">{{ t('admin.seat.title') }}</h2>
    <p class="app-muted seat__intro">{{ t('admin.seat.intro') }}</p>

    <el-alert v-if="disabled" type="info" :closable="false" show-icon :title="t('admin.seat.archived')" class="seat__alert" />

    <el-alert v-if="seated" type="success" show-icon class="seat__alert" @close="seated = null">
      <template #title>{{ t('admin.seat.done', { name: seated.name }) }}</template>
      <div class="seat__done">
        <span class="seat__done-label">{{ t('admin.seat.memberId') }}</span>
        <IdText :id="seated.memberId" full />
      </div>
      <div class="seat__done-hint">{{ t('admin.seat.doneHint') }}</div>
    </el-alert>

    <form class="seat__form" @submit.prevent="lookUp">
      <label class="seat__label" for="seat-actor-id">{{ t('admin.seat.actorId') }}</label>
      <div class="seat__row">
        <div class="seat__input">
          <el-autocomplete
            id="seat-actor-id"
            v-model="actorId"
            :fetch-suggestions="suggest"
            :placeholder="t('admin.seat.placeholder')"
            :disabled="disabled"
            clearable
            @select="lookUp"
          >
            <template #default="{ item }">
              <div class="seat__suggestion">
                <span>{{ item.name }}</span>
                <span class="app-muted seat__suggestion-kind">{{ t(`enums.actorKind.${item.kind}`) }}</span>
              </div>
            </template>
          </el-autocomplete>
        </div>
        <el-button native-type="submit" :loading="looking" :disabled="disabled || !actorId.trim()">
          <el-icon><Search /></el-icon>
          <span>{{ t('admin.seat.lookUp') }}</span>
        </el-button>
        <el-button v-if="session.me" text :disabled="disabled" @click="pickMe">{{ t('admin.seat.me') }}</el-button>
      </div>
      <div v-if="lookupError" class="seat__error">
        {{ lookupError }}
        <router-link :to="{ name: 'admin-actors' }">{{ t('admin.seat.registerFirst') }}</router-link>
      </div>
    </form>

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
        <el-button type="primary" :loading="pending" :disabled="disabled || !!blocker" @click="seat">
          <el-icon><UserFilled /></el-icon>
          <span>{{ t('admin.seat.submit') }}</span>
        </el-button>
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
.seat__input {
  flex: 1 1 280px;
  min-width: 0;
}
.seat__input :deep(.el-autocomplete) {
  width: 100%;
}
.seat__suggestion {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.seat__suggestion-kind {
  font-size: 12px;
}
.seat__error {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-color-danger);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
}
</style>
