<script setup lang="ts">
// The grading scheme as an indented tree: each component with its weight, its
// share among its siblings and of the course total, drop lowest, points and
// order, and under each bucket the assignments that count toward it. On a
// narrow screen each row folds into a name line and a line of labelled facts.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDecimal } from '@/utils/format'
import {
  childBlock,
  nodeName,
  pct,
  gradedBeneath,
  gradedOn,
  type GradeFacts,
  type Scheme,
  type SchemeAssignment,
  type SchemeNode,
} from './schemeModel'

const props = defineProps<{
  scheme: Scheme
  courseId: string
  facts: GradeFacts | null
  /** Offer the editing actions (assignment_write, or unknown). */
  canWrite: boolean
  /**
   * False in an archived course, or while it is not known yet which components
   * hold assignments: the actions are shown disabled.
   */
  writable: boolean
}>()
const emit = defineEmits<{ add: [parent: SchemeNode]; edit: [node: SchemeNode]; move: [node: SchemeNode] }>()
/** Ids of the components whose contents are folded away. */
const collapsed = defineModel<Set<string>>('collapsed', { default: () => new Set<string>() })
const { t } = useI18n()
/** A node's name as shown: the root still named by Core, in the reader's words. */
const nameOf = (n: SchemeNode) => nodeName(n, t('scheme.rootName'))

type Row =
  | { type: 'component'; key: string; depth: number; node: SchemeNode }
  | { type: 'assignment'; key: string; depth: number; item: SchemeAssignment; host: SchemeNode }

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (n: SchemeNode) => {
    out.push({ type: 'component', key: n.id, depth: n.depth, node: n })
    if (collapsed.value.has(n.id)) return
    for (const x of n.assignments)
      out.push({ type: 'assignment', key: `a:${x.a.id}`, depth: n.depth + 1, item: x, host: n })
    n.children.forEach(walk)
  }
  if (props.scheme.root) walk(props.scheme.root)
  return out
})

function hasContents(n: SchemeNode): boolean {
  return n.children.length > 0 || n.assignments.length > 0
}

function toggle(n: SchemeNode) {
  const next = new Set(collapsed.value)
  if (next.has(n.id)) next.delete(n.id)
  else next.add(n.id)
  collapsed.value = next
}

const ICONS: Record<string, string> = {
  root: 'Trophy',
  group: 'FolderOpened',
  bucket: 'Collection',
  direct: 'EditPen',
  empty: 'Folder',
  unseen: 'Folder',
}
const TAGS: Record<string, 'primary' | 'success' | 'warning' | 'info'> = {
  root: 'primary',
  group: 'primary',
  bucket: 'success',
  direct: 'warning',
  empty: 'info',
  unseen: 'info',
}
const kindOf = (n: SchemeNode) => (n.isRoot ? 'root' : n.kind)

/** What a change here does to grades already entered, where some are. */
function gradedText(n: SchemeNode): string | null {
  const parts: string[] = []
  if (!n.isRoot && gradedBeneath(n, props.facts)) parts.push(t('scheme.tree.graded.placement'))
  if (gradedOn(n, props.facts)) parts.push(t('scheme.tree.graded.points'))
  return parts.length ? parts.join(' ') : null
}

function addBlockText(n: SchemeNode): string | null {
  const b = childBlock(n)
  return b ? t(`scheme.reasons.${b}`, { name: nameOf(n) }) : null
}
/** Offered, but it may hold assignments the caller cannot see, and then Core refuses. */
function addCautionText(n: SchemeNode): string | null {
  return n.kind === 'unseen' ? t('scheme.reasons.unseen', { name: nameOf(n) }) : null
}
function moveBlockText(n: SchemeNode): string | null {
  return n.isRoot ? t('scheme.reasons.root') : null
}

function onCommand(n: SchemeNode, cmd: string | number | object) {
  if (cmd === 'add') emit('add', n)
  else if (cmd === 'edit') emit('edit', n)
  else if (cmd === 'move') emit('move', n)
}

const barWidth = (v: number | null) => (v === null ? '0%' : `${Math.min(Math.max(v, 0), 1) * 100}%`)
</script>

<template>
  <div class="scheme-tree" :class="{ 'has-actions': canWrite }" role="table" :aria-label="t('scheme.tree.title')">
    <div class="st-row st-row--head" role="row">
      <div class="st-cell st-name" role="columnheader">{{ t('scheme.tree.cols.name') }}</div>
      <div class="st-facts">
        <div class="st-cell st-num" role="columnheader">
          <el-tooltip :content="t('scheme.tree.colHelp.weight')" placement="top">
            <span class="st-help">{{ t('scheme.tree.cols.weight') }}</span>
          </el-tooltip>
        </div>
        <div class="st-cell st-share" role="columnheader">
          <el-tooltip :content="t('scheme.tree.colHelp.share')" placement="top">
            <span class="st-help">{{ t('scheme.tree.cols.share') }}</span>
          </el-tooltip>
        </div>
        <div class="st-cell st-num" role="columnheader">
          <el-tooltip :content="t('scheme.tree.colHelp.ofTotal')" placement="top">
            <span class="st-help">{{ t('scheme.tree.cols.ofTotal') }}</span>
          </el-tooltip>
        </div>
        <div class="st-cell st-num" role="columnheader">
          <el-tooltip :content="t('scheme.tree.colHelp.drop')" placement="top">
            <span class="st-help">{{ t('scheme.tree.cols.drop') }}</span>
          </el-tooltip>
        </div>
        <div class="st-cell st-num" role="columnheader">
          <el-tooltip :content="t('scheme.tree.colHelp.points')" placement="top">
            <span class="st-help">{{ t('scheme.tree.cols.points') }}</span>
          </el-tooltip>
        </div>
        <div class="st-cell st-num" role="columnheader">
          <el-tooltip :content="t('scheme.tree.colHelp.order')" placement="top">
            <span class="st-help">{{ t('scheme.tree.cols.order') }}</span>
          </el-tooltip>
        </div>
      </div>
      <div v-if="canWrite" class="st-cell st-actions" role="columnheader">
        <span class="st-sr">{{ t('scheme.tree.cols.actions') }}</span>
      </div>
    </div>

    <template v-for="row in rows" :key="row.key">
      <!-- A component -->
      <div
        v-if="row.type === 'component'"
        class="st-row"
        :class="{ 'is-root': row.node.isRoot, 'is-zero': !row.node.isRoot && row.node.weight === 0 }"
        :style="{ '--depth': row.depth }"
        role="row"
      >
        <div class="st-cell st-name" role="cell">
          <button
            v-if="hasContents(row.node)"
            type="button"
            class="st-toggle"
            :class="{ 'is-open': !collapsed.has(row.node.id) }"
            :aria-expanded="!collapsed.has(row.node.id)"
            :aria-label="t('scheme.actions.toggle', { name: nameOf(row.node) })"
            @click="toggle(row.node)"
          >
            <el-icon><ArrowRight /></el-icon>
          </button>
          <span v-else class="st-toggle st-toggle--none" />
          <el-icon class="st-icon" :class="`st-icon--${kindOf(row.node)}`">
            <component :is="ICONS[kindOf(row.node)]" />
          </el-icon>
          <span class="st-label">
            <span class="st-title">{{ nameOf(row.node) }}</span>
            <el-tooltip :content="t(`scheme.tree.kindHelp.${kindOf(row.node)}`)" placement="top">
              <el-tag :type="TAGS[kindOf(row.node)]" size="small" effect="plain" disable-transitions class="st-kind">
                {{ t(`scheme.tree.kind.${kindOf(row.node)}`) }}
              </el-tag>
            </el-tooltip>
            <el-tooltip v-if="gradedText(row.node)" :content="gradedText(row.node)!" placement="top">
              <el-icon class="st-lock" :aria-label="gradedText(row.node)!"><Warning /></el-icon>
            </el-tooltip>
          </span>
        </div>

        <div class="st-facts">
          <div
            class="st-cell st-num"
            :class="{ 'is-blank': row.node.isRoot }"
            :data-label="t('scheme.tree.cols.weight')"
            role="cell"
          >
            <template v-if="row.node.isRoot">—</template>
            <template v-else>
              {{ formatDecimal(row.node.c.weight, 4) }}
              <el-tooltip v-if="row.node.weight === 0" :content="t('scheme.tree.zeroWeight')" placement="top">
                <el-icon class="st-note"><InfoFilled /></el-icon>
              </el-tooltip>
            </template>
          </div>

          <div
            class="st-cell st-share"
            :class="{ 'is-blank': row.node.share === null }"
            :data-label="t('scheme.tree.cols.share')"
            role="cell"
          >
            <span v-if="row.node.share !== null" class="st-bar" aria-hidden="true">
              <span class="st-bar__fill" :style="{ width: barWidth(row.node.share) }" />
            </span>
            <span class="st-share__text">{{ pct(row.node.share) }}</span>
          </div>

          <div
            class="st-cell st-num"
            :class="{ 'is-blank': row.node.isRoot || row.node.ofTotal === null }"
            :data-label="t('scheme.tree.cols.ofTotal')"
            role="cell"
          >
            {{ pct(row.node.ofTotal) }}
          </div>

          <div
            class="st-cell st-num"
            :class="{ 'is-blank': !row.node.c.drop_lowest }"
            :data-label="t('scheme.tree.cols.drop')"
            role="cell"
          >
            <template v-if="row.node.c.drop_lowest">{{ row.node.c.drop_lowest }}</template>
            <template v-else>—</template>
          </div>

          <div
            class="st-cell st-num"
            :class="{ 'is-blank': row.node.kind !== 'direct' }"
            :data-label="t('scheme.tree.cols.points')"
            role="cell"
          >
            {{ row.node.kind === 'direct' ? formatDecimal(row.node.c.points_possible, 4) : '—' }}
          </div>

          <div
            class="st-cell st-num st-order"
            :class="{ 'is-blank': row.node.isRoot }"
            :data-label="t('scheme.tree.cols.order')"
            role="cell"
          >
            {{ row.node.isRoot ? '—' : row.node.c.sort_order }}
          </div>
        </div>

        <div v-if="canWrite" class="st-cell st-actions" role="cell">
          <el-dropdown trigger="click" :disabled="!writable" @command="(cmd: string) => onCommand(row.node, cmd)">
            <el-button
              text
              circle
              size="small"
              :disabled="!writable"
              :aria-label="t('scheme.actions.more', { name: nameOf(row.node) })"
            >
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="add" :disabled="!!addBlockText(row.node)">
                  <div class="st-menu">
                    <span class="st-menu__label">
                      <el-icon><Plus /></el-icon>
                      {{ t('scheme.actions.addChild') }}
                    </span>
                    <span v-if="addBlockText(row.node) ?? addCautionText(row.node)" class="st-menu__why">
                      {{ addBlockText(row.node) ?? addCautionText(row.node) }}
                    </span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item command="edit">
                  <div class="st-menu">
                    <span class="st-menu__label">
                      <el-icon><Edit /></el-icon>
                      {{ t('scheme.actions.edit') }}
                    </span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item v-if="!row.node.isRoot" command="move" :disabled="!!moveBlockText(row.node)">
                  <div class="st-menu">
                    <span class="st-menu__label">
                      <el-icon><Rank /></el-icon>
                      {{ t('scheme.actions.move') }}
                    </span>
                    <span v-if="moveBlockText(row.node)" class="st-menu__why">{{ moveBlockText(row.node) }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- An assignment hung on a component -->
      <div v-else class="st-row st-row--assignment" :style="{ '--depth': row.depth }" role="row">
        <div class="st-cell st-name" role="cell">
          <span class="st-toggle st-toggle--none" />
          <el-icon class="st-icon st-icon--assignment"><Document /></el-icon>
          <span class="st-label">
            <router-link
              :to="{ name: 'course-assignment', params: { courseId, assignmentId: row.item.a.id } }"
              class="st-title st-link"
            >
              {{ row.item.a.title }}
            </router-link>
            <el-tooltip v-if="!row.item.a.published_at" :content="t('scheme.tree.unpublishedHelp')" placement="top">
              <el-tag type="info" size="small" disable-transitions class="st-kind">
                {{ t('scheme.tree.unpublished') }}
              </el-tag>
            </el-tooltip>
            <el-tooltip
              v-if="row.item.share === null && row.host.kind !== 'bucket'"
              :content="t('scheme.tree.ignored')"
              placement="top"
            >
              <el-icon class="st-warn"><WarningFilled /></el-icon>
            </el-tooltip>
            <el-tooltip
              v-else-if="row.item.points === 0 && row.item.a.published_at"
              :content="t('scheme.tree.zeroPoints')"
              placement="top"
            >
              <el-icon class="st-note"><InfoFilled /></el-icon>
            </el-tooltip>
          </span>
        </div>
        <div class="st-facts">
          <div class="st-cell st-num is-blank st-byline" :data-label="t('scheme.tree.cols.weight')" role="cell">
            <span class="st-muted">{{ t('scheme.tree.byPoints') }}</span>
          </div>
          <div
            class="st-cell st-share"
            :class="{ 'is-blank': row.item.share === null }"
            :data-label="t('scheme.tree.cols.share')"
            role="cell"
          >
            <span v-if="row.item.share !== null" class="st-bar st-bar--assignment" aria-hidden="true">
              <span class="st-bar__fill" :style="{ width: barWidth(row.item.share) }" />
            </span>
            <span class="st-share__text">{{ pct(row.item.share) }}</span>
          </div>
          <div
            class="st-cell st-num"
            :class="{ 'is-blank': row.item.ofTotal === null }"
            :data-label="t('scheme.tree.cols.ofTotal')"
            role="cell"
          >
            {{ pct(row.item.ofTotal) }}
          </div>
          <div class="st-cell st-num is-blank" role="cell">—</div>
          <div class="st-cell st-num" :data-label="t('scheme.tree.cols.points')" role="cell">
            {{ formatDecimal(row.item.a.points_possible, 4) }}
          </div>
          <div class="st-cell st-num is-blank" role="cell">—</div>
        </div>
        <div v-if="canWrite" class="st-cell st-actions" role="cell" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.scheme-tree {
  container-type: inline-size;
  --st-cols: minmax(220px, 1fr) 76px 128px 80px 92px 72px 60px;
  --st-indent: 22px;
  font-size: 14px;
}
.scheme-tree.has-actions {
  --st-cols: minmax(220px, 1fr) 76px 128px 80px 92px 72px 60px 44px;
}
.st-row {
  display: grid;
  grid-template-columns: var(--st-cols);
  align-items: center;
  column-gap: 8px;
  min-height: 44px;
  padding: 4px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.st-row:last-child {
  border-bottom: none;
}
.st-row:not(.st-row--head):hover {
  background: var(--el-fill-color-lighter);
}
.st-row--head {
  min-height: 36px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  border-bottom-color: var(--el-border-color-light);
}
.st-row.is-root {
  background: var(--el-fill-color-light);
  border-radius: var(--app-radius-control);
  font-weight: 600;
}
.st-row.is-zero .st-title {
  color: var(--el-text-color-secondary);
}
.st-row--assignment {
  font-size: 13px;
  min-height: 36px;
}
.st-cell {
  min-width: 0;
}
.st-name {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: calc(var(--depth, 0) * var(--st-indent));
}
.st-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.st-order {
  color: var(--el-text-color-secondary);
}
.st-help {
  cursor: help;
  border-bottom: 1px dotted var(--el-border-color-darker);
}
.st-row--head .st-num,
.st-row--head .st-share {
  text-align: right;
}
.st-share {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.st-share__text {
  min-width: 44px;
  text-align: right;
}
.st-bar {
  display: block;
  flex: 1 1 auto;
  max-width: 64px;
  height: 6px;
  border-radius: 2px;
  background: var(--el-fill-color-dark);
  overflow: hidden;
}
.st-bar__fill {
  display: block;
  height: 100%;
  background: var(--el-color-primary);
  border-radius: 2px;
}
.st-bar--assignment .st-bar__fill {
  background: var(--el-color-success);
}
.st-actions {
  display: flex;
  justify-content: flex-end;
}
.st-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  flex-shrink: 0;
}
.st-toggle:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}
.st-toggle .el-icon {
  transition: transform 0.15s ease;
}
.st-toggle.is-open .el-icon {
  transform: rotate(90deg);
}
.st-toggle--none {
  cursor: default;
}
.st-toggle--none:hover {
  background: transparent;
}
.st-icon {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.st-icon--root {
  color: var(--el-color-primary);
}
.st-icon--group {
  color: var(--el-color-primary);
}
.st-icon--bucket {
  color: var(--el-color-success);
}
.st-icon--direct {
  color: var(--el-color-warning);
}
.st-label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  min-width: 0;
}
.st-title {
  min-width: 0;
  overflow-wrap: anywhere;
}
.st-link {
  text-decoration: none;
}
.st-link:hover {
  text-decoration: underline;
}
.st-kind {
  flex-shrink: 0;
  font-weight: 400;
}
.st-lock {
  color: var(--el-color-warning);
  flex-shrink: 0;
  cursor: help;
}
.st-note {
  color: var(--el-text-color-secondary);
  vertical-align: -2px;
  cursor: help;
}
.st-warn {
  color: var(--el-color-danger);
  cursor: help;
}
.st-muted {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.st-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.st-menu {
  display: flex;
  flex-direction: column;
  max-width: 260px;
  line-height: 1.4;
  padding: 2px 0;
}
.st-menu__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.st-menu__why {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: normal;
  padding-left: 20px;
}
.st-facts {
  display: contents;
}

/* Narrow: each row is a name line, then its facts as labelled chips. */
@container (max-width: 700px) {
  .st-row.st-row--head {
    display: none;
  }
  .st-row {
    display: block;
    position: relative;
    padding: 8px 4px 8px calc(4px + var(--depth, 0) * 14px);
  }
  .st-name {
    padding-left: 0;
  }
  .has-actions .st-name {
    padding-right: 36px;
  }
  .st-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    padding-left: 26px;
    margin-top: 2px;
  }
  .st-cell.is-blank {
    display: none;
  }
  .st-num,
  .st-share {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }
  .st-num::before,
  .st-share::before {
    content: attr(data-label);
    color: var(--el-text-color-secondary);
  }
  .st-bar {
    flex: 0 0 40px;
  }
  .st-share__text {
    min-width: 0;
  }
  .st-actions {
    position: absolute;
    top: 6px;
    right: 4px;
  }
}
</style>
