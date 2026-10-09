<script setup lang="ts">
// One group's peer evaluation as those who grade read it
// (peer_review.results): each member of its circle, whether they wrote an
// evaluation, what their peers gave them, what they gave themselves, their
// factor said in words (what they received against an even share from the
// same raters, their own evaluation among them where self-evaluation counts
// it, as Core's factor has it), the score it gives at the form's weight
// beside the group's (none on a form for reference only, whose weight of 0
// gives everyone the group's), their grade now, and Core's flags; and every
// evaluation written, with who wrote it and their comments. On the
// assignment's results page and on the group's submission.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatList, formatPct } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import TimeText from '@/components/TimeText.vue'
import {
  criteriaOf,
  formCounts,
  isOwnAdjustment,
  isRating,
  num,
  windowState,
  type FormLike,
  type PeerEntry,
  type PeerGroupResult,
  type PeerMemberResult,
} from './peer'
import { aloneInCircle, flagsOf, membersOf, missingIn, peerRaters, ratedSelf } from './peerResults'

const props = withDefaults(
  defineProps<{
    courseId: string
    form: FormLike
    group: PeerGroupResult
    /** Link the group's work, where it has some. */
    workLink?: boolean
    heading?: 'h2' | 'h3'
  }>(),
  { workLink: true, heading: 'h2' },
)
const { t } = useI18n()
const ui = useUiStore()

const rating = computed(() => isRating(props.form))
const criteria = computed(() => criteriaOf(props.form))
const members = computed(() => membersOf(props.group))
const names = computed(() => new Map(members.value.map((m) => [m.member_id, m.display_name])))
const nameOf = (id: string) => names.value.get(id) ?? t('common.labels.someMember')
const win = computed(() => windowState(props.group.window.state))
const counts = computed(() => formCounts(props.form))
/** A weight above 0: the score Core works out moves from the group's (counted, or if it were). */
const weighted = computed(() => Number(props.form.weight) > 0)
const weightPct = computed(() => (ui.locale, formatPct(props.form.weight / 100, 0)))
const missingMembers = computed(() => missingIn(props.group, props.form))
const missing = computed(() => (ui.locale, formatList(missingMembers.value.map((m) => m.display_name))))
const pair = computed(() => (props.group.flags ?? []).includes('pair_without_self_evaluation'))
/** Alone in the circle, self-evaluation off: nobody to evaluate, and nothing of theirs missing. */
const alone = computed(() => aloneInCircle(props.group, props.form))

/** A factor as a share of an even one: 1.2 → "120%". */
function pct(v: number | string | null | undefined): string {
  const n = num(v)
  return (ui.locale, Number.isFinite(n) ? formatPct(n, 0) : '—')
}
function exact(v: number | string | null | undefined): string {
  return formatDecimal(v ?? null, 4)
}
/**
 * A member's factor in words: what they received against an even share from
 * the same raters. With self-evaluation on, Core's factor counts what they
 * gave themselves as one of those raters', and the words say so.
 */
function factorWords(m: PeerMemberResult): string {
  const peers = peerRaters(m)
  if (ratedSelf(m)) {
    if (!peers) return t('peer.results.factorSelfOnly', { pct: pct(m.factor) })
    return t('peer.results.factorWithSelf', { pct: pct(m.factor), n: peers }, peers)
  }
  if (!peers) return t('peer.results.nobodyRated')
  return t('peer.results.factorWords', { pct: pct(m.factor), n: peers }, peers)
}
/** Their factor from their peers alone, where their own evaluation is in the one above and peers rated them too. */
function peerOnly(m: PeerMemberResult): string | null {
  if (!ratedSelf(m) || !peerRaters(m) || !Number.isFinite(num(m.peer_factor))) return null
  return t('peer.results.peerFactor', { pct: pct(m.peer_factor) })
}
/** What the score is beside the group's: the change at the form's weight. */
function change(m: PeerMemberResult): string | null {
  const s = num(m.score)
  const g = num(props.group.group_score)
  if (!Number.isFinite(s) || !Number.isFinite(g)) return null
  const d = Math.round((s - g) * 100) / 100
  if (d === 0) return t('peer.results.noChange')
  return d > 0 ? t('peer.results.up', { n: formatDecimal(d) }) : t('peer.results.down', { n: formatDecimal(-d) })
}
function ratingsText(e: Pick<PeerEntry, 'ratings'>): string {
  return criteria.value
    .map((c) => t('peer.results.ratingPair', { criterion: c.label, n: e.ratings?.[c.key] ?? '—' }))
    .join(t('common.sep'))
}
function entryText(e: PeerEntry): string {
  return rating.value ? ratingsText(e) : t('peer.results.points', { n: e.share ?? 0 }, e.share ?? 0)
}
const flagTone = (f: string) => (f === 'missing' ? 'danger' : 'neutral')
</script>

<template>
  <div class="peer-group" :data-test="`peer-group-${group.group_id}`">
    <div class="peer-group__head">
      <component :is="heading" class="peer-group__name">{{ group.name }}</component>
      <AppTag :tone="win === 'open' ? 'indigo' : 'neutral'">{{ t(`peer.window.${win}`) }}</AppTag>
      <span class="app-toolbar__spacer" />
      <span class="peer-group__score">
        <template v-if="group.group_score !== null && group.group_score !== undefined">
          {{
            t('peer.results.groupScore', {
              score: formatDecimal(group.group_score),
              points: formatDecimal(group.points_possible),
            })
          }}
        </template>
        <span v-else class="app-muted">{{ t('peer.results.notGraded') }}</span>
      </span>
      <router-link
        v-if="workLink && group.submission_id"
        :to="{ name: 'course-submission', params: { courseId, submissionId: group.submission_id } }"
        class="peer-group__work"
      >
        {{ t('peer.results.openWork') }}
      </router-link>
    </div>

    <AppNote v-if="pair" plain class="peer-group__note">{{ t('peer.fair.pair') }}</AppNote>
    <AppNote v-if="alone" plain class="peer-group__note peer-group__alone">
      {{ t('peer.results.aloneNote', { name: members[0]?.display_name ?? '' }) }}
    </AppNote>
    <p v-if="missingMembers.length" class="peer-group__missing">
      {{ t('peer.results.missingLine', { names: missing }) }}
    </p>

    <ul class="peer-group__members">
      <li v-for="m in members" :key="m.member_id" class="peer-member" :data-test="`peer-member-${m.member_id}`">
        <div class="peer-member__head">
          <strong class="peer-member__name">{{ m.display_name }}</strong>
          <AppTag v-for="f in flagsOf(m, alone)" :key="f" :tone="flagTone(f)">{{ t(`peer.flag.${f}`) }}</AppTag>
        </div>
        <dl class="peer-member__facts">
          <div class="peer-member__fact">
            <dt>{{ t('peer.results.wrote') }}</dt>
            <dd>
              <i18n-t v-if="m.submitted && m.submitted_at" keypath="peer.results.wroteAt" tag="span" scope="global">
                <template #at><TimeText :value="m.submitted_at" /></template>
              </i18n-t>
              <span v-else-if="alone" class="app-muted">{{ t('peer.results.alone') }}</span>
              <span v-else class="peer-member__none">{{ t('peer.results.notWritten') }}</span>
            </dd>
          </div>
          <div class="peer-member__fact">
            <dt>{{ t('peer.results.received') }}</dt>
            <dd>
              <template v-if="rating">
                <span v-if="!m.averages || !Object.keys(m.averages).length" class="app-muted">{{
                  t('peer.results.noPeerRated')
                }}</span>
                <ul v-else class="peer-member__list">
                  <li v-for="c in criteria" :key="c.key">
                    {{
                      t('peer.results.averagePair', { criterion: c.label, n: formatDecimal(m.averages[c.key] ?? null) })
                    }}
                  </li>
                </ul>
              </template>
              <template v-else>
                <span v-if="!(m.shares ?? []).length" class="app-muted">{{ t('peer.results.noPeerRated') }}</span>
                <ul v-else class="peer-member__list">
                  <li v-for="s in m.shares ?? []" :key="s.rater_member_id">
                    {{ t('peer.results.shareFrom', { n: s.share, name: nameOf(s.rater_member_id) }, s.share) }}
                  </li>
                </ul>
              </template>
            </dd>
          </div>
          <div v-if="form.self_evaluation" class="peer-member__fact">
            <dt>{{ t('peer.results.self') }}</dt>
            <dd>
              <span v-if="!m.self" class="app-muted">—</span>
              <template v-else>
                {{ entryText(m.self) }}
                <span v-if="m.self_factor !== null && m.self_factor !== undefined" class="app-muted">{{
                  t('common.bracketed', { text: t('peer.results.selfFactor', { pct: pct(m.self_factor) }) })
                }}</span>
              </template>
            </dd>
          </div>
          <div class="peer-member__fact">
            <dt>{{ t('peer.results.factor') }}</dt>
            <dd>
              <el-tooltip :content="t('peer.results.factorExact', { f: exact(m.factor) })" placement="top">
                <span tabindex="0" class="peer-member__factor">{{ factorWords(m) }}</span>
              </el-tooltip>
              <div v-if="peerOnly(m)" class="app-form-hint">{{ peerOnly(m) }}</div>
            </dd>
          </div>
          <!-- At a weight of 0 every score is the group's: there is nothing to say of it. -->
          <div v-if="weighted" class="peer-member__fact">
            <dt>
              {{
                counts
                  ? t('peer.results.scoreAt', { weight: weightPct })
                  : t('peer.results.scoreIfCounted', { weight: weightPct })
              }}
            </dt>
            <dd>
              <template v-if="m.score !== null && m.score !== undefined">
                <span class="peer-member__figure">{{ formatDecimal(m.score) }}</span>
                <span v-if="change(m)" class="app-muted">{{ t('common.bracketed', { text: change(m) }) }}</span>
              </template>
              <span v-else class="app-muted">{{ t('peer.results.scoreWhenGraded') }}</span>
            </dd>
          </div>
          <div class="peer-member__fact">
            <dt>{{ t('peer.results.gradeNow') }}</dt>
            <dd>
              <template v-if="m.grade">
                <span class="peer-member__figure">{{ formatDecimal(m.grade.score) }}</span>
                <AppTag
                  :tone="m.grade.state === 'posted' ? 'done' : 'wait'"
                  :variant="m.grade.state === 'posted' ? 'quiet' : 'pill'"
                >
                  {{ t(`peer.results.gradeState.${m.grade.state === 'posted' ? 'posted' : 'draft'}`) }}
                </AppTag>
                <div v-if="isOwnAdjustment(m.grade.adjustment_kind)" class="app-form-hint">
                  {{ t('peer.results.ownAdjustment') }}
                </div>
                <div v-else-if="m.grade.adjustment_kind === 'peer'" class="app-form-hint">
                  {{ t('peer.results.peerAdjustment') }}
                </div>
              </template>
              <span v-else class="app-muted">{{ t('peer.results.notGraded') }}</span>
            </dd>
          </div>
        </dl>
      </li>
    </ul>

    <el-collapse v-if="(group.sheets ?? []).length" class="peer-group__sheets">
      <el-collapse-item :name="group.group_id">
        <template #title>{{ t('peer.results.sheets', { n: (group.sheets ?? []).length }) }}</template>
        <ul class="peer-sheets">
          <li v-for="s in group.sheets ?? []" :key="s.review_id" class="peer-sheet">
            <div class="peer-sheet__head">
              <strong>{{ s.rater_name ?? nameOf(s.rater_member_id) }}</strong>
              <span class="app-muted"><TimeText :value="s.submitted_at" /></span>
            </div>
            <ul class="peer-sheet__entries">
              <li v-for="e in s.entries ?? []" :key="e.student_member_id">
                <span>{{ t('common.pair', { label: nameOf(e.student_member_id), value: entryText(e) }) }}</span>
                <div v-if="e.comment" class="peer-sheet__comment">{{ t('common.quoted', { text: e.comment }) }}</div>
              </li>
            </ul>
            <div v-if="s.comment" class="peer-sheet__overall">
              {{
                t('common.pair', { label: t('peer.results.overall'), value: t('common.quoted', { text: s.comment }) })
              }}
            </div>
          </li>
        </ul>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.peer-group {
  container-type: inline-size;
}
.peer-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.peer-group__name {
  margin: 0;
  font-size: var(--app-text-lg);
  font-weight: var(--app-heading-weight);
  overflow-wrap: anywhere;
}
.peer-group__score {
  font-size: var(--app-text-sm);
  font-variant-numeric: tabular-nums;
}
.peer-group__work {
  font-size: var(--app-text-sm);
}
.peer-group__note {
  margin-bottom: 8px;
}
.peer-group__missing {
  margin: 0 0 8px;
  font-size: var(--app-text-sm);
  color: var(--app-danger-fg);
}
.peer-group__members {
  list-style: none;
  margin: 0;
  padding: 0;
}
.peer-member {
  padding: 10px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.peer-member__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.peer-member__name {
  font-size: var(--app-text-md);
  overflow-wrap: anywhere;
}
.peer-member__facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 16px;
  font-size: var(--app-text-sm);
}
.peer-member__fact {
  min-width: 0;
}
.peer-member__fact dt {
  color: var(--app-ink-3);
  font-size: var(--app-text-xs);
}
.peer-member__fact dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
}
.peer-member__none {
  color: var(--app-danger-fg);
}
.peer-member__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.peer-member__figure {
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
  margin-right: 4px;
}
.peer-member__factor {
  border-bottom: 1px dotted var(--app-ink-3);
}
.peer-group__sheets {
  margin-top: 8px;
}
.peer-sheets {
  list-style: none;
  margin: 0;
  padding: 0;
}
.peer-sheet {
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: var(--app-text-sm);
}
.peer-sheet:first-child {
  border-top: 0;
}
.peer-sheet__head {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: baseline;
  margin-bottom: 4px;
}
.peer-sheet__entries {
  margin: 0;
  padding-left: 1.25em;
}
.peer-sheet__comment,
.peer-sheet__overall {
  color: var(--app-ink-2);
  margin-top: 2px;
  white-space: pre-wrap;
}
@container (max-width: 560px) {
  .peer-member__facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@container (max-width: 360px) {
  .peer-member__facts {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
