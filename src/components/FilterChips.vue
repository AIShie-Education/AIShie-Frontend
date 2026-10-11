<script setup lang="ts" generic="V extends string">
// A filter over a list, as chips (docs/CONVENTIONS.md, "Filters"): "All N"
// first, then each choice with how many it holds, one chosen at a time;
// choosing the chosen one again goes back to all. They are Element Plus's
// check tags, rectangles with the app's 2 px corners (styles/element.css):
// each on no ground, its words in the ink inside a control's edge (3:1, so
// that it reads as pressed, never as a tag's faint outline), the chosen one
// in the indigo's words on its tint with a 2 px bar in the indigo at its
// foot, as a course's chosen tab has, and one with nothing in it as the
// others, its count in the third ink; and, as Element Plus's are not, radios
// to the keyboard and a screen reader (Enter or Space chooses). A segmented
// control is for a view's mode (newest first, by owner), never a filter.
import type { Component } from 'vue'
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
  /** How many all of them hold, said after "All". */
  allCount?: number | string
  /** What is filtered, for a screen reader: the group's name. */
  label: string
}>()
const { t } = useI18n()

function choose(v: V | '') {
  model.value = v !== '' && model.value === v ? '' : v
}
</script>

<template>
  <div class="filter-chips" role="radiogroup" :aria-label="props.label">
    <el-check-tag
      :checked="model === ''"
      class="filter-chip"
      role="radio"
      :aria-checked="model === '' ? 'true' : 'false'"
      tabindex="0"
      @change="choose('')"
      @keydown.enter.space.prevent="choose('')"
    >
      <!-- The space keeps the words and the count apart for a screen reader; the row's gap draws it. -->
      <span>{{ t('common.labels.all') }}</span>{{ ' '
      }}<span v-if="allCount !== undefined" class="filter-chip__count" data-num>{{ allCount }}</span>
    </el-check-tag>
    <el-check-tag
      v-for="o in options"
      :key="o.value"
      :checked="model === o.value"
      class="filter-chip"
      :class="{ 'is-zero': o.count === 0 }"
      role="radio"
      :aria-checked="model === o.value ? 'true' : 'false'"
      tabindex="0"
      :data-value="o.value"
      @change="choose(o.value)"
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
