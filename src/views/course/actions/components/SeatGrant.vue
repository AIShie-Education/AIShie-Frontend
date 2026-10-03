<script setup lang="ts">
// What approving a member.add would seat: the preset it names, as it stands
// now (Core copies it when the proposal is carried out), with the proposal's
// own settings laid over it — the role, the reach, and every permission, the
// ones changed from the preset marked. A proposal carries only the changes,
// which on their own say nothing of whether the seat is an observer's or an
// instructor's.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { PERMS, type AutonomyLevel, type Perm, type PermLevels } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { presetLabel } from '@/views/course/members/components/seat'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import PermEditor from '@/components/PermEditor.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { isObject, payloadOf, presetOf, str, type ActionRow } from './actionText'
import { useLookup, useSpecs } from './lookups'

const props = defineProps<{ action: ActionRow; courseId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const specs = useSpecs()
onMounted(() => void course.ensureAssignments())

const p = computed(() => payloadOf(props.action))
const presets = useLookup(() => specs.presets(props.courseId))
const preset = computed(() => presetOf(presets.value?.value, p.value))
const presetMissing = computed(() => presets.value?.state === 'ok' && !preset.value)

const overrides = computed<PermLevels>(() => (isObject(p.value.perms) ? (p.value.perms as PermLevels) : {}))
const perms = computed<PermLevels>(() => {
  const base = (preset.value?.perms ?? {}) as PermLevels
  const out: PermLevels = {}
  for (const k of PERMS) out[k] = (overrides.value[k] ?? base[k] ?? 'denied') as AutonomyLevel
  return out
})
/** Permissions the proposal sets differently from the preset. */
const changed = computed<Perm[]>(() =>
  PERMS.filter(
    (k) =>
      overrides.value[k] !== undefined &&
      overrides.value[k] !== ((preset.value?.perms?.[k] as AutonomyLevel | undefined) ?? 'denied'),
  ),
)

const role = computed(() => str(p.value.role) ?? preset.value?.role)
const roleChanged = computed(() => !!str(p.value.role) && str(p.value.role) !== preset.value?.role)
const studentScope = computed(() => str(p.value.student_scope) ?? preset.value?.student_scope)
const assignmentScope = computed(() => str(p.value.assignment_scope) ?? preset.value?.assignment_scope)
const listedStudents = computed(() =>
  Array.isArray(p.value.listed_students) ? p.value.listed_students.map(String) : [],
)
const listedAssignments = computed(() =>
  Array.isArray(p.value.listed_assignments) ? p.value.listed_assignments.map(String) : [],
)
const expiresAt = computed(() => str(p.value.expires_at))
/** A student listed to nobody is listed to themselves once seated (Core does this). */
const listsItself = computed(
  () => role.value === 'student' && studentScope.value === 'listed' && !listedStudents.value.length,
)
</script>

<template>
  <div class="seat-grant">
    <p class="seat-grant__help">{{ t('actions.grant.help') }}</p>
    <el-alert v-if="presetMissing" type="warning" :closable="false" show-icon class="seat-grant__alert">
      {{ t('actions.grant.presetMissing') }}
    </el-alert>

    <dl class="seat-grant__facts">
      <div>
        <dt>{{ t('actions.fields.preset') }}</dt>
        <dd class="seat-grant__inline">
          <template v-if="preset">
            <strong>{{ presetLabel(preset) }}</strong>
            <el-tag v-if="preset.dept_id" size="small" type="info" effect="plain">{{
              t('actions.grant.deptPreset')
            }}</el-tag>
          </template>
          <span v-else-if="str(p.preset)">{{ str(p.preset) }}</span>
          <IdText v-else-if="str(p.preset_id)" :id="str(p.preset_id)" />
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.fields.role') }}</dt>
        <dd class="seat-grant__inline">
          <StatusTag v-if="role" vocab="role" :value="role" />
          <span v-else>—</span>
          <el-tag v-if="roleChanged" size="small" type="warning" effect="light" round>{{
            t('common.labels.changed')
          }}</el-tag>
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.fields.student_scope') }}</dt>
        <dd class="seat-grant__inline">
          <StatusTag v-if="studentScope" vocab="scope" :value="studentScope" />
          <template v-if="studentScope === 'listed'">
            <span v-if="listsItself" class="seat-grant__muted">{{ t('actions.grant.listsItself') }}</span>
            <span v-else-if="!listedStudents.length" class="seat-grant__muted">{{ t('actions.grant.nobody') }}</span>
            <MemberName v-for="id in listedStudents" :key="id" :id="id" />
          </template>
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.fields.assignment_scope') }}</dt>
        <dd class="seat-grant__inline">
          <StatusTag v-if="assignmentScope" vocab="scope" :value="assignmentScope" />
          <template v-if="assignmentScope === 'listed'">
            <span v-if="!listedAssignments.length" class="seat-grant__muted">{{ t('actions.grant.nothing') }}</span>
            <span v-for="id in listedAssignments" :key="id">{{ course.assignmentTitle(id) ?? id }}</span>
          </template>
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.fields.expires_at') }}</dt>
        <dd>
          <TimeText v-if="expiresAt" :value="expiresAt" />
          <span v-else class="seat-grant__muted">{{ t('actions.grant.noExpiry') }}</span>
        </dd>
      </div>
    </dl>

    <h3 class="seat-grant__title">
      {{ t('actions.grant.perms') }}
      <span v-if="changed.length" class="seat-grant__muted">{{
        t('actions.grant.changedCount', { n: changed.length }, changed.length)
      }}</span>
    </h3>
    <PermEditor v-if="preset" :model-value="perms" readonly size="small" :changed="changed" />
    <p v-else class="seat-grant__muted">{{ t('actions.grant.permsUnknown') }}</p>
  </div>
</template>

<style scoped>
.seat-grant {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.seat-grant__help {
  margin: 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-secondary);
}
.seat-grant__alert {
  margin: 4px 0;
}
.seat-grant__facts {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.seat-grant__facts > div {
  display: grid;
  grid-template-columns: minmax(96px, 30%) minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  align-items: baseline;
}
.seat-grant__facts dt {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-sm);
}
.seat-grant__facts dd {
  margin: 0;
  min-width: 0;
  font-size: var(--app-text-md);
  word-break: break-word;
}
.seat-grant__inline {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.seat-grant__title {
  margin: 8px 0 0;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.seat-grant__muted {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  font-weight: normal;
}
@media (max-width: 600px) {
  .seat-grant__facts > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
