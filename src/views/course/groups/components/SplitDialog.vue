<script setup lang="ts">
// Splitting a course's students at random into a set's groups (group.split):
// by size (groups of up to n) or by count (until the set has n groups), the
// students in no group or everyone, with the seed the deal is made from,
// shown and editable. What it deals is worked out here, as the server works
// it out (split.ts), and shown before anything moves: each group with the
// students it will hold, those it makes, and those it leaves alone, which
// have work for an assignment of the set and keep their members. The seed
// is sent with it, so that what is shown is what is dealt; a split is cheap
// to redo, and it is adjusted afterwards by hand.
//
// The server deals over every student and every group's work for every
// assignment of the set. To a seat not shown all of that (one that does not
// read the member list, or reaches only some assignments: previewsSplit) a
// deal worked out here would be another deal, so none is shown: it says
// why, and the set's page says what was dealt once it is made.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolOut, WriteOutcome } from '@/api/http'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import { notifyError } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatList } from '@/utils/format'
import {
  GROUP_REFUSALS,
  byName,
  liveGroups,
  nameOf,
  planSplit,
  SplitNoRoom,
  studentsOf,
  type GroupSet,
  type SplitPlan,
} from './groupModel'
import { newSeed, validSeed, type SplitBy, type SplitFrom } from './split'

const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    courseId: string
    set: GroupSet
    /** The reader is shown all the server deals over, so the deal is shown before it is made (previewsSplit). */
    previewed?: boolean
  }>(),
  { previewed: true },
)
const emit = defineEmits<{ done: [out: WriteOutcome<ToolOut<'group.split'>>] }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()
const w = useWrite('group.split')

const form = reactive({
  by: 'size' as SplitBy,
  n: 4,
  from: 'unassigned' as SplitFrom,
  seed: '',
  prefix: '',
  capacity: undefined as number | undefined,
})
watch(open, (on) => {
  if (!on) return
  const placed = liveGroups(props.set).some((g) => g.size > 0)
  form.by = 'size'
  form.n = 4
  form.from = placed && (props.set.unassigned?.length ?? 0) > 0 ? 'unassigned' : placed ? 'all' : 'unassigned'
  form.seed = newSeed()
  form.prefix = t('groups.split.defaultPrefix')
  form.capacity = undefined
})

const names = computed(() => studentsOf(props.set))
const unnamed = computed(() => t('common.labels.someMember'))
function nameOfId(id: string): string {
  const m = names.value.get(id)
  return m ? nameOf(m, unnamed.value) : unnamed.value
}

const seedOk = computed(() => validSeed(form.seed))
const nOk = computed(() => Number.isInteger(form.n) && form.n >= 1 && form.n <= 500)
const prefixOk = computed(() => [...form.prefix].length <= 96 && !/[\u0000-\u001f\u007f]/.test(form.prefix))

/** The deal, as the server will make it; or why it cannot be made; or, where it cannot be worked out here, none. */
const preview = computed<{ plan: SplitPlan } | { error: string } | { unseen: true }>(() => {
  void ui.locale
  if (!nOk.value) return { error: t('groups.split.nBad') }
  if (!seedOk.value) return { error: t('groups.split.seedBad') }
  if (!prefixOk.value) return { error: t('groups.add.prefixBad') }
  if (!props.previewed) return { unseen: true }
  try {
    return {
      plan: planSplit(props.set, {
        by: form.by,
        n: form.n,
        from: form.from,
        seed: form.seed,
        namePrefix: form.prefix,
        capacity: form.capacity ?? null,
      }),
    }
  } catch (e) {
    if (e instanceof SplitNoRoom) return { error: t('groups.refusal.no_room') }
    throw e
  }
})
const plan = computed(() => ('plan' in preview.value ? preview.value.plan : null))
const shown = computed(() =>
  (plan.value?.groups ?? []).filter((g) => g.made || g.kept || g.after.length || g.before.length || g.dealt.length),
)
/** Nothing would change: nobody to deal and no group to make. */
const nothing = computed(() => !!plan.value && !plan.value.placements.length && !plan.value.made.length)
/** It can be asked for: a deal shown with something in it, or, where none can be shown, a valid form. */
const ready = computed(() => ('unseen' in preview.value ? true : !!plan.value && !nothing.value))
const keptNames = computed(() => (ui.locale, formatList((plan.value?.kept ?? []).map((g) => g.name))))
const madeNames = computed(() => (ui.locale, formatList((plan.value?.made ?? []).map((g) => g.name))))
/** The groups students are dealt into. */
const dealtGroups = computed(() => new Set((plan.value?.placements ?? []).map((p) => p.group)).size)

/** A group's students after the split, by name, those it keeps marked. */
function after(g: SplitPlan['groups'][number]) {
  const dealt = new Set(g.dealt)
  const list = g.after.map((id) => ({ id, display_name: nameOfId(id), dealt: dealt.has(id) }))
  return byName(list, ui.locale)
}

function reseed() {
  form.seed = newSeed()
}

const busy = ref(false)
async function split() {
  if (!ready.value) return
  busy.value = true
  try {
    const out = await w.run(
      {
        course_id: props.courseId,
        set_id: props.set.id,
        by: form.by,
        n: form.n,
        from: form.from,
        seed: form.seed,
        name_prefix: form.prefix,
        capacity: form.capacity || undefined,
      },
      { notify: false },
    )
    if (!out) {
      notifyError(w.lastError.value, undefined, { reasons: GROUP_REFUSALS })
      return
    }
    announce(out, { success: false })
    emit('done', out)
    open.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="t('groups.split.title')" width="720px" destroy-on-close class="split-dialog">
    <el-form label-position="top" class="split-dialog__form" @submit.prevent="split">
      <div class="split-dialog__grid">
        <el-form-item :label="t('groups.split.by')">
          <el-radio-group v-model="form.by" class="split-dialog__choice">
            <el-radio value="size">{{ t('groups.split.bySize') }}</el-radio>
            <el-radio value="count">{{ t('groups.split.byCount') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="form.by === 'size' ? t('groups.split.nSize') : t('groups.split.nCount')">
          <el-input-number v-model="form.n" :min="1" :max="500" :step="1" step-strictly controls-position="right" />
        </el-form-item>
      </div>
      <el-form-item :label="t('groups.split.from')">
        <el-radio-group v-model="form.from" class="split-dialog__choice split-dialog__choice--column">
          <el-radio value="unassigned">{{ t('groups.split.fromUnassigned') }}</el-radio>
          <el-radio value="all">{{ t('groups.split.fromAll') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <div class="split-dialog__grid">
        <el-form-item :label="t('groups.add.prefix')">
          <el-input v-model="form.prefix" maxlength="96" />
        </el-form-item>
        <el-form-item>
          <template #label>
            {{ t('groups.split.capacity')
            }}<span class="split-dialog__optional">{{ t('common.labels.optionalTag') }}</span>
          </template>
          <el-input-number
            v-model="form.capacity"
            :min="1"
            :max="500"
            :step="1"
            step-strictly
            controls-position="right"
            :placeholder="t('groups.add.noLimit')"
          />
        </el-form-item>
      </div>
      <el-form-item :label="t('groups.split.seed')">
        <div class="split-dialog__seed">
          <el-input v-model="form.seed" maxlength="64" class="split-dialog__seed-input" spellcheck="false" />
          <el-button @click="reseed">
            <el-icon aria-hidden="true"><Refresh /></el-icon>
            <span>{{ t('groups.split.reseed') }}</span>
          </el-button>
        </div>
        <div class="app-form-hint">{{ previewed ? t('groups.split.seedHint') : t('groups.split.seedHintUnseen') }}</div>
      </el-form-item>
    </el-form>

    <section class="split-dialog__preview" aria-live="polite" :aria-label="t('groups.split.preview')">
      <h3 class="split-dialog__heading">{{ t('groups.split.preview') }}</h3>
      <el-alert v-if="'error' in preview" type="error" :title="preview.error" :closable="false" show-icon />
      <AppNote v-else-if="'unseen' in preview" class="split-dialog__unseen">
        <p class="split-dialog__unseen-line">{{ t('groups.split.unseen') }}</p>
        <p class="split-dialog__unseen-line">{{ t('groups.split.unseenAfter') }}</p>
      </AppNote>
      <template v-else-if="plan">
        <p class="split-dialog__summary">
          {{
            nothing
              ? t('groups.split.nothing')
              : t('groups.split.summary', {
                  students: t('groups.split.students', { n: plan.placements.length }, plan.placements.length),
                  groups: t('groups.list.groups', { n: dealtGroups }, dealtGroups),
                })
          }}
        </p>
        <p v-if="plan.made.length" class="split-dialog__summary">
          {{ t('groups.split.makes', { names: madeNames }, plan.made.length) }}
        </p>
        <p v-if="plan.emptied" class="split-dialog__summary">
          {{ t('groups.split.emptied', { n: plan.emptied }, plan.emptied) }}
        </p>
        <AppNote v-if="plan.kept.length" plain class="split-dialog__kept">
          {{ t('groups.split.kept', { names: keptNames }, plan.kept.length) }}
        </AppNote>
        <ul class="split-dialog__groups">
          <li v-for="g in shown" :key="g.id" class="split-dialog__group" :class="{ 'is-kept': g.kept }">
            <p class="split-dialog__group-head">
              <span class="split-dialog__group-name">{{ g.name }}</span>
              <AppTag v-if="g.made" tone="indigo">{{ t('groups.split.new') }}</AppTag>
              <AppTag v-else-if="g.kept">{{ t('groups.split.leftAlone') }}</AppTag>
              <span class="split-dialog__count" data-num>{{
                t('groups.card.size', { n: g.after.length }, g.after.length)
              }}</span>
            </p>
            <ul v-if="g.after.length" class="split-dialog__names">
              <li v-for="m in after(g)" :key="m.id" :class="m.dealt ? 'split-dialog__dealt' : 'split-dialog__stays'">
                {{ m.display_name
                }}<span v-if="!m.dealt" class="split-dialog__hidden">{{
                  t('common.bracketed', { text: t('groups.split.stays') })
                }}</span>
              </li>
            </ul>
          </li>
        </ul>
        <p v-if="form.from === 'unassigned' && plan.placements.length" class="app-form-hint">
          {{ t('groups.split.staysHint') }}
        </p>
      </template>
    </section>

    <template #footer>
      <div class="split-dialog__footer">
        <StatusTag v-if="course.needsApproval('assignment_write')" vocab="level" value="confirm_required" />
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="busy" :disabled="!course.writable || !ready" @click="split">
          {{ t('groups.split.submit') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.split-dialog__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 var(--app-space-lg);
}
@media (max-width: 560px) {
  .split-dialog__grid {
    grid-template-columns: 1fr;
  }
}
.split-dialog__choice {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-xs) var(--app-space-lg);
}
.split-dialog__choice :deep(.el-radio) {
  margin-right: 0;
  height: auto;
  min-height: 32px;
  white-space: normal;
}
.split-dialog__choice--column {
  flex-direction: column;
  align-items: flex-start;
}
.split-dialog__optional {
  color: var(--app-ink-3);
  font-weight: 400;
}
.split-dialog__seed {
  display: flex;
  gap: var(--app-space-sm);
  width: 100%;
}
.split-dialog__seed-input {
  flex: 1 1 auto;
  font-family: var(--app-font-mono);
}
.split-dialog__preview {
  border-top: 1px solid var(--app-line);
  padding-top: var(--app-space-md);
}
.split-dialog__unseen-line {
  margin: 0;
  line-height: var(--app-lh-text);
}
.split-dialog__unseen-line + .split-dialog__unseen-line {
  margin-top: var(--app-space-xs);
}
.split-dialog__heading {
  margin: 0 0 var(--app-space-sm);
  font-size: var(--app-text-md);
  font-weight: var(--app-weight-strong);
}
.split-dialog__summary {
  margin: 0 0 var(--app-space-sm);
}
.split-dialog__kept {
  margin-bottom: var(--app-space-sm);
}
.split-dialog__groups {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--app-space-sm);
  max-height: 320px;
  overflow-y: auto;
}
.split-dialog__group {
  border: 1px solid var(--app-line);
  border-radius: 6px;
  padding: var(--app-space-sm);
  min-width: 0;
}
.split-dialog__group.is-kept {
  border-style: dashed;
}
.split-dialog__group-head {
  display: flex;
  align-items: center;
  gap: var(--app-space-xs) var(--app-space-sm);
  flex-wrap: wrap;
  margin: 0;
}
.split-dialog__group-name {
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.split-dialog__count {
  margin-inline-start: auto;
  color: var(--app-ink-3);
  font-size: var(--app-text-xs);
}
.split-dialog__names {
  list-style: none;
  padding: 0;
  margin: var(--app-space-xs) 0 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-ui);
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--app-space-sm);
}
.split-dialog__stays {
  color: var(--app-ink-3);
}
.split-dialog__hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.split-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--app-space-sm);
}
</style>
