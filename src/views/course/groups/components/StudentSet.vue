<script setup lang="ts">
// A set as a student sees it: their own group and its members by name (the
// server names a group's members to its own members alone), or that they
// are in none; and, while the teacher has opened it, sign-up
// (group.sign_up): each group's name, how many are in it and how many it
// takes, with Join, Switch or Leave, and the time left before it closes,
// counted down. What the server refuses is said in words (groups.refusal):
// a group that filled up meanwhile, sign-up closed, a group that has handed
// work in. Nothing of another group but its name and its size is shown.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import AppEmpty from '@/components/AppEmpty.vue'
import AppTag from '@/components/AppTag.vue'
import { errorMessage } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import SignupLine from './SignupLine.vue'
import {
  byName,
  GROUP_REFUSALS,
  liveGroups,
  nameOf,
  signupBlocked,
  signupMove,
  type Group,
  type GroupSet,
} from './groupModel'

const props = defineProps<{ courseId: string; set: GroupSet }>()
const emit = defineEmits<{ changed: [proposedActionId: string | null] }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()
const w = useWrite('group.sign_up')

const groups = computed(() => liveGroups(props.set))
const mine = computed(() => groups.value.find((g) => g.id === props.set.my_group_id) ?? null)
const myId = computed(() => course.principalMemberId ?? course.myMemberId)
const mates = computed(() => byName(mine.value?.members ?? [], ui.locale))
const showSignup = computed(() => props.set.signup.open && !props.set.archived_at)

/** The refusal of the last ask, in words; it stays until the next. */
const refusal = ref<string | null>(null)
/** The group being asked for now. */
const asking = ref<string | null>(null)

function sizeOf(g: Group): string {
  return g.capacity
    ? t('groups.card.sizeOf', { n: g.size, of: g.capacity })
    : t('groups.card.size', { n: g.size }, g.size)
}
function blockedWords(g: Group): string | null {
  const why = signupBlocked(props.set, g)
  return why ? t(`groups.refusal.${why}`) : null
}

async function ask(g: Group) {
  const move = signupMove(props.set, g)
  if (move === 'leave') {
    try {
      await ElMessageBox.confirm(t('groups.signup.leaveConfirm', { name: g.name }), t('groups.signup.leaveTitle'), {
        confirmButtonText: t('groups.signup.leave'),
        cancelButtonText: t('common.actions.cancel'),
      })
    } catch {
      return
    }
  }
  refusal.value = null
  asking.value = g.id
  try {
    const out = await w.run(
      { course_id: props.courseId, set_id: props.set.id, group_id: move === 'leave' ? undefined : g.id },
      { notify: false },
    )
    if (!out) {
      refusal.value = errorMessage(w.lastError.value, { reasons: GROUP_REFUSALS })
      emit('changed', null)
      return
    }
    announce(out, {
      success:
        move === 'leave'
          ? t('groups.signup.done.leave', { name: g.name })
          : move === 'switch'
            ? t('groups.signup.done.switch', { name: g.name })
            : t('groups.signup.done.join', { name: g.name }),
    })
    emit('changed', out.status === 'proposed' ? out.actionId : null)
  } finally {
    asking.value = null
  }
}
</script>

<template>
  <div class="student-set app-column">
    <section class="app-card student-set__mine" aria-labelledby="student-set-mine">
      <h2 id="student-set-mine" class="app-card__title">{{ t('groups.mine.title') }}</h2>
      <template v-if="mine">
        <p class="student-set__group">{{ mine.name }}</p>
        <ul class="student-set__mates" :aria-label="t('groups.mine.members')">
          <li v-for="m in mates" :key="m.member_id">
            {{ nameOf(m, t('common.labels.someMember'))
            }}<span v-if="m.member_id === myId" class="app-you">{{ t('common.labels.youTag') }}</span>
          </li>
        </ul>
      </template>
      <AppEmpty
        v-else
        :text="
          set.signup.joinable
            ? t('groups.mine.noneSignup')
            : set.signup.open
              ? t('groups.mine.noneClosed')
              : t('groups.mine.noneTeacher')
        "
      />
    </section>

    <section v-if="showSignup" class="app-card student-set__signup" aria-labelledby="student-set-signup">
      <h2 id="student-set-signup" class="app-card__title">{{ t('groups.signup.title') }}</h2>
      <p class="student-set__state">
        <SignupLine :signup="set.signup" countdown @ended="emit('changed', null)" />
      </p>
      <p v-if="set.signup.joinable" class="student-set__hint">{{ t('groups.signup.hint') }}</p>
      <el-alert v-if="refusal" type="error" :title="refusal" :closable="false" show-icon class="student-set__refusal" />
      <ul class="student-set__groups">
        <li v-for="g in groups" :key="g.id" class="student-set__row" :class="{ 'is-mine': g.id === set.my_group_id }">
          <span class="student-set__name">{{ g.name }}</span>
          <span class="student-set__size" data-num>{{ sizeOf(g) }}</span>
          <AppTag v-if="g.id === set.my_group_id" tone="indigo">{{ t('groups.signup.yours') }}</AppTag>
          <AppTag v-else-if="g.full">{{ t('groups.card.full') }}</AppTag>
          <span class="student-set__action">
            <el-tooltip :content="blockedWords(g) ?? ''" :disabled="!blockedWords(g)" placement="top">
              <span>
                <el-button
                  size="small"
                  :disabled="!!blockedWords(g) || (!!asking && asking !== g.id)"
                  :loading="asking === g.id"
                  :aria-label="t(`groups.signup.${signupMove(set, g)}Named`, { name: g.name })"
                  @click="ask(g)"
                >
                  {{ t(`groups.signup.${signupMove(set, g)}`) }}
                </el-button>
              </span>
            </el-tooltip>
          </span>
        </li>
      </ul>
      <AppEmpty v-if="!groups.length" :text="t('groups.signup.noGroups')" />
    </section>
  </div>
</template>

<style scoped>
.student-set__group {
  margin: 0;
  font-size: var(--app-text-lg);
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.student-set__mates {
  margin: var(--app-space-sm) 0 0;
  padding-inline-start: 1.25em;
  line-height: var(--app-lh-text);
}
.student-set__state {
  margin: 0;
}
.student-set__hint {
  margin: var(--app-space-sm) 0 0;
  color: var(--app-ink-2);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.student-set__refusal {
  margin-top: var(--app-space-md);
}
.student-set__groups {
  list-style: none;
  margin: var(--app-space-md) 0 0;
  padding: 0;
}
.student-set__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-xs) var(--app-space-sm);
  padding: var(--app-space-sm) 0;
  border-top: 1px solid var(--app-line);
}
.student-set__name {
  font-weight: var(--app-weight-strong);
  min-width: 0;
  overflow-wrap: anywhere;
}
.student-set__size {
  color: var(--app-ink-2);
  font-size: var(--app-text-sm);
}
.student-set__action {
  margin-inline-start: auto;
}
</style>
