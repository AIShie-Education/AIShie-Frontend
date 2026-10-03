<script setup lang="ts">
// member.set_role: a seat's roster role, between student, TA and instructor.
// The role is a fact of the roster and nothing more: it decides who is on the
// gradebook and hands work in, never what the seat may do. Its permissions and
// reach stay exactly as they are, and the dialog says so, with the ways to
// change those. Choosing a role and pressing the button that names it is the
// confirmation; Core's refusal is said here in words.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { Member } from '@/api/types'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import AppNote from '@/components/AppNote.vue'
import StatusTag from '@/components/StatusTag.vue'
import RefusalAlert from './RefusalAlert.vue'
import { ROSTER_ROLES, roleChangeEffect, type RosterRole } from './roles'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ courseId: string; member: Member }>()
const emit = defineEmits<{
  done: [status: 'executed' | 'proposed', actionId: string]
  /** The person wants to change what the seat may do, or reaches, instead or as well. */
  editPerms: []
  changeReach: []
}>()
const { t } = useI18n()
const course = useCourseStore()
const write = useWrite('member.set_role')

const role = ref<RosterRole | ''>('')
watch(
  open,
  (v) => {
    if (!v) return
    role.value = ''
    write.lastError.value = null
  },
  { immediate: true },
)

const current = computed(() => props.member.role)
const effect = computed(() => (role.value ? roleChangeEffect(current.value, role.value) : null))
const needsApproval = computed(() => course.needsApproval('member_manage'))
const name = computed(() => props.member.display_name)

async function submit() {
  if (!role.value || role.value === current.value) return
  const to = role.value
  const out = await write.run({ course_id: props.courseId, member_id: props.member.id, role: to }, { notify: false })
  if (!out) return
  if (out.status === 'executed' && !out.result.changed) {
    ElMessage({ type: 'info', message: t('members.role.unchanged', { name: name.value, role: t(`enums.role.${to}`) }) })
  } else {
    announce(out, { success: t('members.role.done', { name: name.value, role: t(`enums.role.${to}`) }) })
  }
  open.value = false
  emit('done', out.status, out.actionId)
}

function goPerms() {
  open.value = false
  emit('editPerms')
}
function goReach() {
  open.value = false
  emit('changeReach')
}
</script>

<template>
  <el-dialog v-model="open" :title="t('members.role.title', { name })" width="560px" destroy-on-close>
    <p class="role-dialog__lead">
      {{ t('members.role.current') }}
      <StatusTag vocab="role" :value="current" />
    </p>

    <AppNote class="role-dialog__only">
      <template #title>{{ t('members.role.onlyRoleTitle') }}</template>
      <p class="role-dialog__p">{{ t('members.role.onlyRole', { name }) }}</p>
      <div class="role-dialog__links">
        <el-button size="small" @click="goPerms">
          <el-icon><Edit /></el-icon><span>{{ t('members.detail.perms.edit') }}</span>
        </el-button>
        <el-button size="small" @click="goReach">
          <el-icon><Aim /></el-icon><span>{{ t('members.detail.scope.change') }}</span>
        </el-button>
      </div>
    </AppNote>

    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('members.role.newRole')">
        <el-radio-group v-model="role" class="role-dialog__roles" :aria-label="t('members.role.newRole')">
          <el-radio
            v-for="r in ROSTER_ROLES"
            :key="r"
            :value="r"
            :disabled="r === current"
            class="role-dialog__role"
            border
          >
            <span class="role-dialog__role-name">{{ t(`enums.role.${r}`) }}</span>
            <span v-if="r === current" class="role-dialog__role-note">{{ t('members.role.isCurrent') }}</span>
          </el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <el-alert
      v-if="effect === 'leavesRoster'"
      type="warning"
      :closable="false"
      show-icon
      class="role-dialog__effect"
      :title="t('members.role.effect.leavesRoster', { name })"
    />
    <AppNote v-else-if="effect" class="role-dialog__effect">{{ t(`members.role.effect.${effect}`, { name }) }}</AppNote>
    <AppNote v-if="needsApproval" class="role-dialog__effect">{{ t('members.detail.approvalNote') }}</AppNote>
    <RefusalAlert :error="write.lastError.value" class="role-dialog__refusal" @close="write.lastError.value = null" />

    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button
        type="primary"
        :disabled="!role || role === current || !course.writable"
        :loading="write.pending.value"
        @click="submit"
      >
        {{ role ? t('members.role.submit', { role: t(`enums.role.${role}`) }) : t('members.role.submitNone') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.role-dialog__lead {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
}
.role-dialog__only {
  margin-bottom: 16px;
  align-items: flex-start;
}
.role-dialog__p {
  margin: 4px 0 8px;
  line-height: 1.55;
}
.role-dialog__links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.role-dialog__links .el-button + .el-button {
  margin-left: 0;
}
.role-dialog__roles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.role-dialog__role {
  margin-right: 0;
  height: auto;
  padding-top: 8px;
  padding-bottom: 8px;
}
.role-dialog__role :deep(.el-radio__label) {
  display: inline-flex;
  flex-direction: column;
  line-height: 1.3;
}
.role-dialog__role-name {
  font-weight: 500;
}
.role-dialog__role-note {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.role-dialog__effect {
  margin-bottom: 12px;
}
.role-dialog__effect :deep(.el-alert__title) {
  line-height: var(--app-lh-ui);
}
.role-dialog__refusal {
  margin-top: 4px;
}
</style>
