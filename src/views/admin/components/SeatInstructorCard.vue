<script setup lang="ts">
// course.seat_instructor: how a course gets its first member. The instructor
// is found in the directory (actor.list) by a piece of their name or email,
// or by a pasted ID (actor.get), so that the administrator sees who they are
// about to seat. On a Core without the directory, a pasted ID is the way.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { Actor } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
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
    emit('seated', out.result.member_id, a.id)
    selectedId.value = ''
    found.value = null
  }
}
</script>

<template>
  <section class="app-card">
    <h2 class="app-card__title">{{ t('admin.seat.title') }}</h2>
    <p class="app-muted seat__intro">{{ t('admin.seat.intro') }}</p>

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
      <el-button v-if="session.me" text :disabled="disabled" @click="pickMe">{{ t('admin.seat.me') }}</el-button>
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
.seat__option-meta > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
}
</style>
