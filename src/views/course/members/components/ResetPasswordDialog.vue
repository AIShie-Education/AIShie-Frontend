<script setup lang="ts">
// member.reset_password: a student who has forgotten their password, and has
// no email to reset it by, is given a temporary one by whoever manages the
// course's members without approval. The dialog says first what it does —
// every session of theirs ends, and they must choose their own at the next
// sign-in — then shows the temporary password once, with what they sign in
// with, to hand on in person. It is kept nowhere but this dialog, and goes
// when it closes. Core's refusals are said in words.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { ToolOut } from '@/api/http'
import type { Member } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import AppNote from '@/components/AppNote.vue'
import RefusalAlert from './RefusalAlert.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ courseId: string; member: Member }>()
const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const course = useCourseStore()
const write = useWrite('member.reset_password')

/** What Core answered: shown once, and forgotten when the dialog closes. */
const result = ref<ToolOut<'member.reset_password'> | null>(null)
const copied = ref(false)
watch(open, (v) => {
  if (v) return
  result.value = null
  copied.value = false
  write.lastError.value = null
})
const name = computed(() => props.member.display_name)

async function reset() {
  const out = await write.run({ course_id: props.courseId, member_id: props.member.id }, { notify: false })
  if (!out) return
  // Never a proposal (not_by_proposal): executed, or refused.
  if (out.status === 'executed') {
    result.value = out.result
    emit('done')
  }
}

async function copy() {
  const p = result.value?.temporary_password
  if (!p) return
  try {
    await navigator.clipboard.writeText(p)
    copied.value = true
    ElMessage({ type: 'success', message: t('members.reset.copied') })
  } catch {
    ElMessage({ type: 'warning', message: t('members.reset.copyFailed') })
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="result ? t('members.reset.resultTitle', { name }) : t('members.reset.title', { name })"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!result && !write.pending.value"
    class="reset-dialog"
  >
    <template v-if="!result">
      <p class="reset-dialog__p">{{ t('members.reset.intro', { name }) }}</p>
      <ul class="reset-dialog__list">
        <li>{{ t('members.reset.sessions', { name }) }}</li>
        <li>{{ t('members.reset.mustChange', { name }) }}</li>
        <li>{{ t('members.reset.shownOnce') }}</li>
      </ul>
      <p class="app-form-hint reset-dialog__p">{{ t('members.reset.onlyStudents') }}</p>
      <RefusalAlert :error="write.lastError.value" @close="write.lastError.value = null" />
    </template>

    <template v-else>
      <el-alert type="warning" :closable="false" show-icon class="reset-dialog__alert">
        <template #title>{{ t('members.reset.onceTitle') }}</template>
        {{ t('members.reset.once') }}
      </el-alert>
      <dl v-if="result.temporary_password" class="reset-dialog__facts">
        <dt>{{ t('members.reset.signInWith') }}</dt>
        <dd>
          <code v-if="result.login_id" class="reset-dialog__login">{{ result.login_id }}</code>
          <span v-else>{{ t('members.reset.theirEmail') }}</span>
        </dd>
        <dt>{{ t('members.reset.password') }}</dt>
        <dd class="reset-dialog__secret">
          <code class="reset-dialog__password" data-test="temporary-password">{{ result.temporary_password }}</code>
          <el-button size="small" @click="copy">
            <el-icon><Check v-if="copied" /><CopyDocument v-else /></el-icon>
            <span>{{ copied ? t('members.reset.copiedShort') : t('common.actions.copy') }}</span>
          </el-button>
        </dd>
      </dl>
      <AppNote v-else>{{ t('members.reset.replayed') }}</AppNote>
      <p class="app-form-hint reset-dialog__p">
        {{ t('members.reset.ended', { n: result.sessions_ended }, result.sessions_ended) }}
        {{ t('members.reset.next', { name }) }}
      </p>
    </template>

    <template #footer>
      <template v-if="!result">
        <el-button :disabled="write.pending.value" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="danger" :loading="write.pending.value" :disabled="!course.writable" @click="reset">
          <el-icon><Key /></el-icon><span>{{ t('members.reset.submit') }}</span>
        </el-button>
      </template>
      <el-button v-else type="primary" @click="open = false">{{ t('members.reset.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.reset-dialog__p {
  margin: 0 0 10px;
  line-height: var(--app-lh-text);
}
.reset-dialog__list {
  margin: 0 0 12px;
  padding-left: 20px;
  line-height: var(--app-lh-text);
}
.reset-dialog__alert {
  margin-bottom: 16px;
}
.reset-dialog__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 10px 16px;
  align-items: center;
  margin: 0 0 12px;
}
.reset-dialog__facts dt {
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
.reset-dialog__facts dd {
  margin: 0;
  min-width: 0;
}
.reset-dialog__secret {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.reset-dialog__password,
.reset-dialog__login {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-xl);
  letter-spacing: 0.04em;
  padding: 6px 10px;
  border-radius: var(--app-radius-control);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  word-break: break-all;
  user-select: all;
}
.reset-dialog__login {
  font-size: var(--app-text-lg);
}
@media (max-width: 480px) {
  .reset-dialog__facts {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
