<script setup lang="ts">
// What approving a member.add_delegate would seat: an agent a person owns,
// brought in as that person's delegate. Core writes the whole seat into the
// proposal when it is made (the preset cut down to what the owner holds, the
// reach, the end), with the agent's and the owner's names, and works it out
// again when it is approved: anything that would then be wider is refused.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { OfficeBuilding } from '@element-plus/icons-vue'
import { PERMS, type AutonomyLevel, type Perm, type PermLevels } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { seatPurpose } from '@/utils/agents'
import { presetDescription, presetLabel } from '@/views/course/members/components/seat'
import AppTag from '@/components/AppTag.vue'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AgentBadge from '@/components/AgentBadge.vue'
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

const p = computed(() => payloadOf(props.action))
const presets = useLookup(() => specs.presets(props.courseId))
const preset = computed(() => presetOf(presets.value?.value, p.value))
// What it is for: whom it answers, as the proposal records it
// (answers_course); in one made before Core recorded that, the built-in
// preset it names.
const purpose = computed(() =>
  seatPurpose({
    answers_course: typeof p.value.answers_course === 'boolean' ? p.value.answers_course : null,
    preset: preset.value ? (preset.value.dept_id ? null : preset.value.name) : str(p.value.preset),
  }),
)

/** The preset's name is worth showing beside the purpose unless it is the built-in one that purpose stands for. */
const presetSaysMore = computed(
  () =>
    !purpose.value ||
    !preset.value ||
    !!preset.value.dept_id ||
    seatPurpose({ preset: preset.value.name }) !== purpose.value,
)

const agentName = computed(() => str(p.value.agent_display_name))
/** The owner's name as the proposal has it; else their seat (who proposed it) by name. */
const ownerName = computed(() => str(p.value.owner_display_name))
const ownerSeat = computed(() => props.action.member_id ?? undefined)
const ownerText = computed(
  () => ownerName.value ?? course.memberName(ownerSeat.value) ?? t('actions.delegate.theOwner'),
)

const perms = computed<PermLevels>(() => {
  const given = isObject(p.value.perms) ? (p.value.perms as PermLevels) : {}
  const out: PermLevels = {}
  for (const k of PERMS) out[k] = (given[k] ?? 'denied') as AutonomyLevel
  return out
})
/** Levels set lower than the preset's: cut down to what the owner holds, or narrowed on purpose. */
const changed = computed<Perm[]>(() => {
  const base = preset.value?.perms as PermLevels | undefined
  if (!base) return []
  return PERMS.filter((k) => (base[k] ?? 'denied') !== perms.value[k])
})
const allowed = computed(() => PERMS.filter((k) => perms.value[k] !== 'denied'))

const studentScope = computed(() => str(p.value.student_scope) ?? preset.value?.student_scope)
const assignmentScope = computed(() => str(p.value.assignment_scope) ?? preset.value?.assignment_scope)
const listedStudents = computed(() =>
  Array.isArray(p.value.listed_students) ? p.value.listed_students.map(String) : [],
)
const listedAssignments = computed(() =>
  Array.isArray(p.value.listed_assignments) ? p.value.listed_assignments.map(String) : [],
)
/** A student's assistant is listed to its owner alone: it reads the owner's own work. */
const ownerOnly = computed(
  () =>
    studentScope.value === 'listed' && listedStudents.value.length === 1 && listedStudents.value[0] === ownerSeat.value,
)
const expiresAt = computed(() => str(p.value.expires_at))
</script>

<template>
  <div class="delegate-grant">
    <p class="delegate-grant__help">{{ t('actions.delegate.help', { owner: ownerText }) }}</p>
    <el-alert
      v-if="purpose"
      :type="purpose === 'course' ? 'warning' : 'info'"
      :closable="false"
      show-icon
      class="delegate-grant__alert"
      :title="t(`actions.delegate.purpose.${purpose}`, { owner: ownerText })"
    />

    <dl class="delegate-grant__facts">
      <div>
        <dt>{{ t('actions.fields.agent_display_name') }}</dt>
        <dd class="delegate-grant__inline">
          <AgentAvatar v-if="agentName" :name="agentName" size="small" />
          <strong v-if="agentName">{{ agentName }}</strong>
          <IdText v-else :id="str(p.actor_id) ?? action.target_id" />
          <AgentBadge :owner-name="ownerName" />
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.fields.owner_display_name') }}</dt>
        <dd class="delegate-grant__inline">
          <MemberName v-if="ownerSeat" :id="ownerSeat" />
          <span v-else>{{ ownerText }}</span>
          <span class="delegate-grant__muted">{{ t('actions.delegate.ownerSeat') }}</span>
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.delegate.as') }}</dt>
        <dd>
          <div class="delegate-grant__inline">
            <StatusTag v-if="purpose" vocab="seatPurpose" :value="purpose" />
            <strong v-if="preset && presetSaysMore">{{ presetLabel(preset) }}</strong>
            <IdText v-else-if="!preset && !purpose && str(p.preset_id)" :id="str(p.preset_id)" />
            <AppTag v-if="preset?.dept_id" variant="outline" :icon="OfficeBuilding">{{
              t('actions.grant.deptPreset')
            }}</AppTag>
          </div>
          <div v-if="preset && presetDescription(preset)" class="delegate-grant__muted">
            {{ presetDescription(preset) }}
          </div>
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.delegate.work') }}</dt>
        <dd class="delegate-grant__inline">
          <template v-if="studentScope === 'all'">{{ t('members.scope.all.students') }}</template>
          <template v-else-if="ownerOnly">{{ t('actions.delegate.ownerOnly', { owner: ownerText }) }}</template>
          <template v-else-if="!listedStudents.length">{{ t('actions.delegate.nobody') }}</template>
          <template v-else><MemberName v-for="id in listedStudents" :key="id" :id="id" /></template>
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.fields.assignment_scope') }}</dt>
        <dd class="delegate-grant__inline">
          <StatusTag v-if="assignmentScope" vocab="scope" :value="assignmentScope" />
          <template v-if="assignmentScope === 'listed'">
            <span v-if="!listedAssignments.length" class="delegate-grant__muted">{{ t('actions.grant.nothing') }}</span>
            <span v-for="id in listedAssignments" :key="id">{{ course.assignmentTitle(id) ?? id }}</span>
          </template>
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.fields.expires_at') }}</dt>
        <dd>
          <TimeText v-if="expiresAt" :value="expiresAt" />
          <span v-else class="delegate-grant__muted">{{ t('actions.delegate.noExpiry', { owner: ownerText }) }}</span>
        </dd>
      </div>
      <div>
        <dt>{{ t('actions.delegate.can') }}</dt>
        <dd class="delegate-grant__inline">
          <span v-for="k in allowed" :key="k" class="delegate-grant__perm">
            {{ t(`enums.perm.${k}`) }} <StatusTag vocab="level" :value="perms[k]" />
          </span>
          <span v-if="!allowed.length" class="delegate-grant__muted">{{ t('common.labels.none') }}</span>
        </dd>
      </div>
    </dl>

    <el-collapse class="delegate-grant__all">
      <el-collapse-item name="perms">
        <template #title>
          <span class="delegate-grant__title">
            {{ t('actions.grant.perms') }}
            <span v-if="changed.length" class="delegate-grant__muted">{{
              t('actions.delegate.clipped', { n: changed.length }, changed.length)
            }}</span>
          </span>
        </template>
        <PermEditor :model-value="perms" readonly size="small" :changed="changed" />
      </el-collapse-item>
    </el-collapse>
    <p class="delegate-grant__muted delegate-grant__again">
      {{ t('actions.delegate.checkedAgain', { owner: ownerText }) }}
    </p>
  </div>
</template>

<style scoped>
.delegate-grant {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.delegate-grant__help {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.delegate-grant__alert :deep(.el-alert__title) {
  line-height: 1.5;
}
.delegate-grant__facts {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.delegate-grant__facts > div {
  display: grid;
  grid-template-columns: minmax(96px, 30%) minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  align-items: baseline;
}
.delegate-grant__facts dt {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.delegate-grant__facts dd {
  margin: 0;
  min-width: 0;
  font-size: 14px;
  word-break: break-word;
}
.delegate-grant__inline {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.delegate-grant__perm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.delegate-grant__title {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  font-weight: 600;
}
.delegate-grant__muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: normal;
}
.delegate-grant__again {
  margin: 0;
  line-height: 1.6;
}
@media (max-width: 600px) {
  .delegate-grant__facts > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
