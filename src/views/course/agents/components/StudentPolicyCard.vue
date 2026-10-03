<script setup lang="ts">
// Whether students may bring their own agents (agent_delegate: off, needs
// approval, allowed) and start conversations (conversation_ask: on or off),
// set on every current student's seat at once with member.update_perms_bulk.
// What the seats hold now is read from the member list: what most students
// hold is shown as the current choice, and anyone set otherwise is counted.
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import StatusTag from '@/components/StatusTag.vue'
import type { AutonomyLevel, MemberSummary, Perm } from '@/api/types'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import RefusalAlert from '@/views/course/members/components/RefusalAlert.vue'
import {
  levelRank,
  policyOf,
  POLICY_LEVEL,
  STUDENT_AGENT_POLICIES,
  tallyLevels,
  type LevelTally,
  type StudentAgentPolicy,
} from './courseAgents'
import { joinParts } from '@/utils/parts'

const props = defineProps<{
  courseId: string
  members: MemberSummary[]
  /** Every member was read (a very large course is read only in part). */
  complete: boolean
}>()
const emit = defineEmits<{ changed: [status: 'executed' | 'proposed', actionId: string] }>()
const { t } = useI18n()
const course = useCourseStore()

const agentsWrite = useWrite('member.update_perms_bulk')
const chatWrite = useWrite('member.update_perms_bulk')

const agents = computed(() => tallyLevels(props.members, 'student', 'agent_delegate', { exceptId: course.myMemberId }))
const chat = computed(() => tallyLevels(props.members, 'student', 'conversation_ask', { exceptId: course.myMemberId }))

const currentPolicy = computed(() => policyOf(agents.value.majority))
/** Chat counts as on when most students may ask at any level. */
const chatOn = computed(() => (chat.value.majority ? chat.value.majority !== 'denied' : null))

const canChange = computed(() => course.can('member_manage') && course.writable)
const approval = computed(() => course.needsApproval('member_manage'))

/** Raising a level is a grant: the caller must hold it at least that high themselves (when that is known). */
function aboveMine(p: Perm, l: AutonomyLevel): boolean {
  if (course.permsSource !== 'exact') return false
  return levelRank(l) > levelRank(course.level(p))
}

function levelName(l: string): string {
  return t(`enums.level.${l}`)
}

/** "Needs approval for 28 of 30 students", or how they differ. */
function describe(tally: LevelTally, name: (l: AutonomyLevel) => string): string {
  if (!tally.total) return t('courseAgents.policy.nobody')
  if (tally.majority && !tally.others)
    return t('courseAgents.policy.currentAll', { level: name(tally.majority), total: tally.total })
  if (tally.majority)
    return t('courseAgents.policy.current', {
      level: name(tally.majority),
      n: tally.total - tally.others,
      total: tally.total,
    })
  const parts = (Object.entries(tally.counts) as [AutonomyLevel, number][])
    .sort((a, b) => levelRank(a[0]) - levelRank(b[0]))
    .map(([l, n]) => `${name(l)} ${n}`)
  return t('courseAgents.policy.mixed', { summary: joinParts(parts) })
}
const agentsText = computed(() =>
  describe(agents.value, (l) => {
    const p = policyOf(l)
    return p ? t(`courseAgents.policy.agents.options.${p}`) : levelName(l)
  }),
)
const chatText = computed(() =>
  describe(chat.value, (l) =>
    l === 'denied'
      ? t('courseAgents.policy.chat.off')
      : l === 'autonomous'
        ? t('courseAgents.policy.chat.on')
        : levelName(l),
  ),
)

function paragraphs(ps: string[]) {
  return h(
    'div',
    ps.map((p) => h('p', { style: 'margin: 0 0 8px; line-height: var(--app-lh-text)' }, p)),
  )
}

async function confirm(title: string, ps: string[], ok: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(paragraphs(ps), title, {
      type: 'warning',
      confirmButtonText: ok,
      cancelButtonText: t('common.actions.cancel'),
    })
    return true
  } catch {
    return false
  }
}

async function apply(
  w: ReturnType<typeof useWrite<'member.update_perms_bulk'>>,
  perm: Perm,
  level: AutonomyLevel,
  lines: { title: string; what: string; extra: string[] },
) {
  const n = perm === 'agent_delegate' ? agents.value.total : chat.value.total
  const ps = [
    t('courseAgents.policy.confirm', { what: lines.what, n }, n),
    ...lines.extra,
    t('courseAgents.policy.future'),
  ]
  if (!props.complete) ps.push(t('courseAgents.policy.partialConfirm'))
  if (approval.value) ps.push(t('members.detail.approvalNote'))
  if (!(await confirm(lines.title, ps, t('courseAgents.policy.apply')))) return
  const out = await w.run({ course_id: props.courseId, role: 'student', perms: { [perm]: level } }, { notify: false })
  if (!out) return
  const updated = out.status === 'executed' ? out.result.updated : 0
  announce(out, { success: t('courseAgents.policy.success', { n: updated }, updated) })
  emit('changed', out.status, out.actionId)
}

async function choosePolicy(v: string | number | boolean | undefined) {
  const p = v as StudentAgentPolicy
  if (!STUDENT_AGENT_POLICIES.includes(p) || p === currentPolicy.value) return
  const extra = [t(`courseAgents.policy.agents.optionHelp.${p}`)]
  if (p === 'off') extra.push(t('courseAgents.policy.agents.offKeeps'))
  await apply(agentsWrite, 'agent_delegate', POLICY_LEVEL[p], {
    title: t('courseAgents.policy.agents.confirmTitle'),
    what: t(`courseAgents.policy.agents.options.${p}`),
    extra,
  })
}

async function chooseChat(v: string | number | boolean) {
  const on = !!v
  if (on === chatOn.value) return
  await apply(chatWrite, 'conversation_ask', on ? 'autonomous' : 'denied', {
    title: t('courseAgents.policy.chat.confirmTitle'),
    what: on ? t('courseAgents.policy.chat.on') : t('courseAgents.policy.chat.off'),
    extra: [on ? t('courseAgents.policy.chat.onHelp') : t('courseAgents.policy.chat.offHelp')],
  })
}
</script>

<template>
  <section class="app-card student-policy">
    <h2 class="app-card__title">
      <span>{{ t('courseAgents.policy.title') }}</span>
      <StatusTag v-if="approval" vocab="level" value="confirm_required" size="default" />
    </h2>
    <p class="app-form-hint student-policy__help">{{ t('courseAgents.policy.help') }}</p>
    <el-alert
      v-if="!complete"
      type="warning"
      :closable="false"
      show-icon
      class="student-policy__alert"
      :title="t('courseAgents.policy.partial')"
    />

    <div class="student-policy__item">
      <div class="student-policy__text">
        <h3 class="student-policy__label">{{ t('courseAgents.policy.agents.label') }}</h3>
        <p class="student-policy__desc">{{ t('courseAgents.policy.agents.help') }}</p>
        <p class="student-policy__now">{{ agentsText }}</p>
      </div>
      <div class="student-policy__control">
        <el-radio-group
          :model-value="currentPolicy ?? undefined"
          :disabled="!canChange || agentsWrite.pending.value || !agents.total"
          @update:model-value="choosePolicy"
        >
          <el-radio-button
            v-for="p in STUDENT_AGENT_POLICIES"
            :key="p"
            :value="p"
            :disabled="aboveMine('agent_delegate', POLICY_LEVEL[p])"
          >
            {{ t(`courseAgents.policy.agents.options.${p}`) }}
          </el-radio-button>
        </el-radio-group>
        <span v-if="agentsWrite.pending.value" class="app-muted">{{ t('common.labels.loading') }}</span>
      </div>
    </div>
    <p v-if="currentPolicy" class="app-form-hint student-policy__option-help">
      {{ t(`courseAgents.policy.agents.optionHelp.${currentPolicy}`) }}
    </p>
    <RefusalAlert :error="agentsWrite.lastError.value" @close="agentsWrite.lastError.value = null" />

    <div class="student-policy__item student-policy__item--sep">
      <div class="student-policy__text">
        <h3 class="student-policy__label">{{ t('courseAgents.policy.chat.label') }}</h3>
        <p class="student-policy__desc">{{ t('courseAgents.policy.chat.help') }}</p>
        <p class="student-policy__now">{{ chatText }}</p>
      </div>
      <div class="student-policy__control">
        <el-switch
          :model-value="chatOn ?? false"
          :loading="chatWrite.pending.value"
          :disabled="!canChange || !chat.total || (chatOn === false && aboveMine('conversation_ask', 'autonomous'))"
          :active-text="t('courseAgents.policy.chat.on')"
          :inactive-text="t('courseAgents.policy.chat.off')"
          inline-prompt
          size="large"
          @update:model-value="chooseChat"
        />
      </div>
    </div>
    <RefusalAlert :error="chatWrite.lastError.value" @close="chatWrite.lastError.value = null" />
  </section>
</template>

<style scoped>
.student-policy__help {
  margin: -4px 0 12px;
}
.student-policy__alert {
  margin-bottom: 12px;
}
.student-policy__item {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
}
.student-policy__item--sep {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.student-policy__text {
  flex: 1 1 280px;
  min-width: 0;
}
.student-policy__label {
  margin: 0 0 4px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.student-policy__desc {
  margin: 0 0 6px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.student-policy__now {
  margin: 0;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
.student-policy__control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.student-policy__option-help {
  margin: 8px 0 0;
}
.student-policy :deep(.refusal) {
  margin-top: 12px;
}
</style>
