<script setup lang="ts" generic="V extends string">
// A filter over a list, as chips (docs/CONVENTIONS.md, "Filters"): "All N"
// first (its label can name a narrower default scope), then each choice with
// how many it holds, one chosen at a time. They are Element Plus's check tags,
// rectangles with the app's 2 px corners (styles/element.css): each on no
// ground, its words in the ink inside a control's edge (3:1, so that it reads
// as pressed, never as a tag's faint outline), the chosen one in the indigo's
// words on its tint with a 2 px bar in the indigo at its foot, as a course's
// chosen tab has, and one with nothing in it as the others, its count in the
// third ink. As Element Plus's are not, these are one radio group to the
// keyboard and a screen reader: one tab stop, arrows choose and focus, Home/End
// go to the ends, and Enter or Space chooses without clearing the choice. A
// segmented control is for a view's mode (newest first, by owner), never a filter.
import { nextTick, useTemplateRef, type Component } from 'vue'
import { useI18n } from 'vue-i18n'

export interface FilterChip<T extends string = string> {
  value: T
  label: string
  /** How many it holds: a number, or a lower bound ("12+") while there is more to load. */
  count?: number | string
  icon?: Component
}

const model = defineModel<V | ''>({ required: true })
const props = defineProps<{
  options: FilterChip<V>[]
  /** How many all of them hold, said after the first choice's label. */
  allCount?: number | string
  /** The first choice's label, "All" unless a scope names its narrower default. */
  allLabel?: string
  /** What is filtered, for a screen reader: the group's name. */
  label: string
}>()
const { t } = useI18n()
const group = useTemplateRef<HTMLElement>('group')

function choose(v: V | '') {
  model.value = v
}

/** A radio group's arrow keys choose and focus; Tab leaves the group, not each chip. */
function onKeydown(e: KeyboardEvent, index: number) {
  let to: number
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      to = (index + 1) % (props.options.length + 1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      to = (index + props.options.length) % (props.options.length + 1)
      break
    case 'Home':
      to = 0
      break
    case 'End':
      to = props.options.length
      break
    default:
      return
  }
  e.preventDefault()
  choose(to === 0 ? '' : props.options[to - 1]!.value)
  void nextTick(() => group.value?.querySelectorAll<HTMLElement>('.filter-chip')[to]?.focus())
}
</script>

<template>
  <div ref="group" class="filter-chips" role="radiogroup" :aria-label="props.label">
    <el-check-tag
      :checked="model === ''"
      class="filter-chip"
      role="radio"
      :aria-checked="model === '' ? 'true' : 'false'"
      :tabindex="model === '' ? 0 : -1"
      @change="choose('')"
      @keydown="onKeydown($event, 0)"
      @keydown.enter.space.prevent="choose('')"
    >
      <!-- The space keeps the words and the count apart for a screen reader; the row's gap draws it. -->
      <span>{{ props.allLabel ?? t('common.labels.all') }}</span>{{ ' '
      }}<span v-if="allCount !== undefined" class="filter-chip__count" data-num>{{ allCount }}</span>
    </el-check-tag>
    <el-check-tag
      v-for="(o, index) in options"
      :key="o.value"
      :checked="model === o.value"
      class="filter-chip"
      :class="{ 'is-zero': o.count === 0 }"
      role="radio"
      :aria-checked="model === o.value ? 'true' : 'false'"
      :tabindex="model === o.value ? 0 : -1"
      :data-value="o.value"
      @change="choose(o.value)"
      @keydown="onKeydown($event, index + 1)"
      @keydown.enter.space.prevent="choose(o.value)"
    >
      <el-icon v-if="o.icon" aria-hidden="true"><component :is="o.icon" /></el-icon>
      <span>{{ o.label }}</span>{{ ' '
      }}<span v-if="o.count !== undefined" class="filter-chip__count" data-num>{{ o.count }}</span>
    </el-check-tag>
  </div>
</template>

<style scoped>
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
/* Set apart from the words by weight alone: a count is read as they are, in the chip's own ink. */
.filter-chip__count {
  margin-left: 2px;
  font-weight: normal;
}
/* A choice with nothing in it: drawn as the others are, its words as legible, its count of none in the third ink. */
.filter-chip.is-zero:not(.is-checked) .filter-chip__count {
  color: var(--app-ink-3);
}
</style>
