<script setup lang="ts">
// An actor id field. For administrators, on a Core that has actor.list, it
// also finds people and agents by part of their name or email address and
// fills in the id of the one picked; the system actor, seated nowhere, is
// never offered. An id pasted in works either way. For anyone else, or where
// Core cannot search, it is the plain id field it always was.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Actor } from '@/api/types'
import { forSeating, lacksActorList, listActors, useActorList } from '@/composables/useActorList'
import { errorMessage } from '@/composables/useErrors'
import { isUuid } from '@/utils/format'
import StatusTag from './StatusTag.vue'

// The attributes (id, name, autocomplete, aria-label) are the input's.
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ default: '' })
const props = defineProps<{
  /** Offer search by name or email: for platform administrators, whom actor.list answers. */
  searchable?: boolean
  /** For the id field, when there is no search. */
  placeholder?: string
  disabled?: boolean
}>()
const emit = defineEmits<{
  /** Someone was picked from the suggestions; the field now holds their id. */
  pick: [actor: Actor]
  /** Enter pressed on an id, with no suggestion to take. */
  enter: []
}>()
const { t } = useI18n()
const directory = useActorList()

const LIMIT = 10
const available = directory.available
const searching = computed(() => !!props.searchable && available.value !== false)
onMounted(() => {
  if (props.searchable) void directory.probe()
})

interface Suggestion {
  value: string
  actor?: Actor
  /** Set on the one line that says nobody matches. */
  query?: string
}
const more = ref(false)
const failed = ref<string | null>(null)
// Answers can arrive out of order: only the latest search's is shown.
let seq = 0

function suggest(text: string, cb: (items: Suggestion[]) => void) {
  const mine = ++seq
  const q = text.trim()
  more.value = false
  failed.value = null
  if (!searching.value || !q || isUuid(q)) {
    cb([])
    return
  }
  listActors({ q, limit: LIMIT }).then(
    (out) => {
      if (mine !== seq) return
      const found = forSeating(out.actors)
      more.value = !!out.next
      // Taking the "nobody matches" line leaves the field as it is.
      cb(
        found.length
          ? found.map((a) => ({ value: a.id, actor: a }))
          : [
              {
                get value() {
                  return model.value
                },
                query: q,
              },
            ],
      )
    },
    (e) => {
      if (mine !== seq) return
      // A Core without the tool is said once, below the field, not as a failure.
      if (!lacksActorList(e)) failed.value = errorMessage(e)
      cb([])
    },
  )
}

function onSelect(item: Record<string, any>) {
  const s = item as Suggestion
  if (s.actor) emit('pick', s.actor)
  else if (s.query === undefined && isUuid(model.value)) emit('enter')
}
</script>

<template>
  <div class="actor-id-input">
    <el-autocomplete
      v-if="searchable"
      v-bind="$attrs"
      v-model="model"
      :fetch-suggestions="suggest"
      :placeholder="searching ? t('common.actorInput.search') : placeholder"
      :disabled="disabled"
      :class="{ 'app-mono': isUuid(model) }"
      class="actor-id-input__field"
      popper-class="actor-id-input__popper"
      highlight-first-item
      select-when-unmatched
      clearable
      @select="onSelect"
    >
      <template #default="{ item }">
        <div v-if="item.actor" class="actor-id-input__option">
          <span class="actor-id-input__name">{{ item.actor.display_name }}</span>
          <span v-if="item.actor.email" class="actor-id-input__email">{{ item.actor.email }}</span>
          <span class="actor-id-input__tags">
            <StatusTag v-if="item.actor.kind !== 'human'" vocab="actorKind" :value="item.actor.kind" />
            <StatusTag v-if="item.actor.status !== 'active'" vocab="actorStatus" :value="item.actor.status" />
          </span>
        </div>
        <div v-else class="actor-id-input__none">{{ t('common.actorInput.noMatch', { q: item.query }) }}</div>
      </template>
      <template v-if="more" #footer>
        <div class="actor-id-input__more">{{ t('common.actorInput.more', { n: LIMIT }) }}</div>
      </template>
    </el-autocomplete>
    <el-input
      v-else
      v-bind="$attrs"
      v-model="model"
      :placeholder="placeholder"
      :disabled="disabled"
      clearable
      class="app-mono"
    />
    <div v-if="searchable && available === false" class="app-form-hint">{{ t('common.actorInput.unavailable') }}</div>
    <div v-else-if="failed" class="actor-id-input__failed">
      {{ t('common.actorInput.failed', { message: failed }) }}
    </div>
  </div>
</template>

<style scoped>
.actor-id-input {
  width: 100%;
  min-width: 0;
}
.actor-id-input__field {
  width: 100%;
}
.actor-id-input__option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.actor-id-input__name {
  font-weight: 500;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.actor-id-input__email {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.actor-id-input__tags {
  display: inline-flex;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}
.actor-id-input__none {
  color: var(--el-text-color-secondary);
  cursor: default;
}
.actor-id-input__more {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.actor-id-input__failed {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-danger);
}
</style>
