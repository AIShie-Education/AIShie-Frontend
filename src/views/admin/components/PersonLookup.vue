<script setup lang="ts">
// Finds a person by their whole email address, or their whole student or
// staff number (a login ID) (actor.lookup_by_email): how a department's
// administrator finds anyone, since there is no directory for them and no
// partial search. What it shows is what Core says of the person: who they
// are, whether they can sign in yet, and whether an invitation of theirs is
// waiting. What to do with them is the page's (the default slot, given the
// person); so is what to offer when nobody has that email (the `missing`
// slot, given the email). Nobody found by a number is given no email, since
// an invitation goes to one.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, read } from '@/api/http'
import type { ActorLookup } from '@/api/types'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import TimeText from '@/components/TimeText.vue'
import ActorSummary from './ActorSummary.vue'
import { isLoginId } from '@/utils/loginId'
import { EMAIL_RE } from './adminShared'

const props = defineProps<{ disabled?: boolean; missingText?: string }>()
const emit = defineEmits<{ found: [person: ActorLookup, email: string]; missing: [email: string]; cleared: [] }>()
const { t } = useI18n()
const session = useSessionStore()
const inputId = `lookup-${useId()}`

const email = ref('')
const person = ref<ActorLookup | null>(null)
/** The email or number just looked up, with the person found (or nobody). */
const lookedUp = ref('')
/** Whether that was an email, so the person's email is known. */
const lookedUpEmail = ref(false)
const missing = ref(false)
const error = ref<string | null>(null)
const searching = ref(false)
let asks = 0

/** Typing another email puts what was found away: it was someone else's. */
const stale = computed(() => !!lookedUp.value && email.value.trim().toLowerCase() !== lookedUp.value.toLowerCase())

async function find(value?: string) {
  if (value !== undefined) email.value = value
  const e = email.value.trim()
  error.value = null
  const byEmail = EMAIL_RE.test(e)
  if (!byEmail && !isLoginId(e)) {
    error.value = t('deptAdmin.lookup.invalid')
    return
  }
  const mine = ++asks
  searching.value = true
  person.value = null
  missing.value = false
  lookedUp.value = ''
  try {
    const p = await read('actor.lookup_by_email', byEmail ? { email: e } : { login_id: e })
    if (mine !== asks) return
    person.value = p
    lookedUp.value = e
    lookedUpEmail.value = byEmail
    emit('found', p, byEmail ? e : '')
  } catch (err) {
    if (mine !== asks) return
    if (err instanceof ApiError && err.isNotFound) {
      missing.value = true
      lookedUp.value = e
      lookedUpEmail.value = byEmail
      emit('missing', byEmail ? e : '')
    } else {
      error.value = errorMessage(err)
    }
  } finally {
    if (mine === asks) searching.value = false
  }
}

/** Shows someone the page already knows (the caller, say) as if found. */
function show(p: ActorLookup, withEmail = '') {
  asks++
  searching.value = false
  error.value = null
  missing.value = false
  email.value = withEmail
  lookedUp.value = withEmail
  lookedUpEmail.value = !!withEmail
  person.value = p
  emit('found', p, withEmail)
}

function clear() {
  asks++
  searching.value = false
  email.value = ''
  lookedUp.value = ''
  person.value = null
  missing.value = false
  error.value = null
  emit('cleared')
}

defineExpose({ find, show, clear })
</script>

<template>
  <div class="lookup">
    <form class="lookup__form" @submit.prevent="find()">
      <label class="lookup__label" :for="inputId">{{ t('deptAdmin.lookup.email') }}</label>
      <div class="lookup__row">
        <el-input
          :id="inputId"
          v-model="email"
          name="lookup-email"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="t('deptAdmin.lookup.placeholder')"
          :disabled="disabled"
          class="lookup__input"
        />
        <el-button native-type="submit" :loading="searching" :disabled="disabled || !email.trim()">
          <el-icon><Search /></el-icon>
          <span>{{ t('deptAdmin.lookup.find') }}</span>
        </el-button>
        <slot name="beside" />
      </div>
      <div class="app-form-hint">{{ t('deptAdmin.lookup.hint') }}</div>
      <div v-if="error" class="lookup__error" role="alert">{{ error }}</div>
    </form>

    <div v-if="missing && !stale" class="lookup__missing">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        :title="
          lookedUpEmail ? (missingText ?? t('deptAdmin.lookup.notFoundPlain')) : t('deptAdmin.lookup.notFoundLoginId')
        "
      />
      <slot name="missing" :email="lookedUpEmail ? lookedUp : ''" />
    </div>

    <div v-if="person && !stale" class="lookup__found">
      <ActorSummary
        :actor="{
          id: person.actor_id,
          display_name: person.display_name,
          kind: person.kind,
          status: person.status,
          email: lookedUpEmail ? lookedUp : null,
        }"
        :link="session.isAdmin"
      >
        <template v-if="!person.can_sign_in" #meta>
          <span>{{ t('deptAdmin.lookup.notSignedIn') }}</span>
          <template v-if="person.invite_expires_at">
            ·
            <i18n-t
              :keypath="Date.parse(person.invite_expires_at) > Date.now() ? 'deptAdmin.lookup.invitePending' : 'deptAdmin.lookup.inviteExpired'"
              tag="span"
              scope="global"
            >
              <template #date><TimeText :value="person.invite_expires_at" /></template>
            </i18n-t>
          </template>
        </template>
      </ActorSummary>
      <slot :person="person" :email="lookedUpEmail ? lookedUp : ''" />
    </div>
  </div>
</template>

<style scoped>
.lookup__label {
  display: block;
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}
.lookup__row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.lookup__input {
  flex: 1 1 260px;
  min-width: 0;
}
.lookup__error {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-color-danger);
}
.lookup__missing {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.lookup__missing :deep(.el-alert) {
  width: 100%;
}
.lookup__found {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
