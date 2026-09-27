<script setup lang="ts">
// Choosing the person who is to own an agent: active people found by a piece
// of their name or email (actor.list, kind human), or by a pasted actor ID
// (actor.get). Someone who cannot own an agent (ownerBlocker) is listed but
// cannot be chosen, with the reason. On a Core without the directory only a
// pasted ID works.
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { isApiError, read } from '@/api/http'
import type { Actor } from '@/api/types'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import { isUuid, shortId } from '@/utils/format'
import StatusTag from '@/components/StatusTag.vue'
import { hasActorList, lacksActorList, listActors, probeActorList } from './actorSearch'
import { ownerBlocker, type OwnerBlock } from './owner'

const model = defineModel<string>({ default: '' })
const props = defineProps<{ disabled?: boolean; exclude?: string | null }>()
const emit = defineEmits<{ picked: [actor: Actor | null] }>()
const { t } = useI18n()
const session = useSessionStore()

const found = shallowRef<Actor[]>([])
const selected = shallowRef<Actor | null>(null)
const searching = ref(false)
const searchError = ref<string | null>(null)
const idOnly = computed(() => hasActorList.value === false)
onMounted(() => void probeActorList())

// The one chosen stays among the options whatever is searched next, so that
// the box keeps showing their name.
const options = computed(() => {
  const list = found.value.filter((a) => a.id !== props.exclude)
  const s = selected.value
  return s && !list.some((a) => a.id === s.id) ? [s, ...list] : list
})

function blocker(a: Actor): OwnerBlock | null {
  return ownerBlocker(a, { id: session.me?.id, isRoot: session.isRoot })
}

let seq = 0
async function search(query: string) {
  const mine = ++seq
  const needle = query.trim()
  searching.value = true
  searchError.value = null
  try {
    let list: Actor[]
    if (isUuid(needle)) {
      list = await read('actor.get', { actor_id: needle.toLowerCase() }).then(
        (a) => [a],
        (e) => {
          if (isApiError(e) && e.isNotFound) return []
          throw e
        },
      )
    } else if (idOnly.value) {
      list = []
    } else {
      const out = await listActors({ search: needle || undefined, kind: 'human', status: 'active', limit: 20 })
      list = out.actors ?? []
    }
    if (mine === seq) found.value = list
  } catch (e) {
    if (mine === seq) {
      found.value = []
      if (!lacksActorList(e)) searchError.value = errorMessage(e)
    }
  } finally {
    if (mine === seq) searching.value = false
  }
}

function onVisible(open: boolean) {
  if (open && !found.value.length && !searching.value) void search('')
}

function pick(id: string | undefined) {
  const a = (id && options.value.find((x) => x.id === id)) || null
  selected.value = a
  emit('picked', a)
}
</script>

<template>
  <div class="owner-select">
    <el-select
      :model-value="model || undefined"
      filterable
      remote
      remote-show-suffix
      clearable
      fit-input-width
      :remote-method="search"
      :loading="searching"
      :placeholder="idOnly ? t('admin.owner.placeholderId') : t('admin.owner.placeholder')"
      :disabled="disabled"
      class="owner-select__select"
      @update:model-value="(v: string | undefined) => (model = v ?? '')"
      @change="pick"
      @visible-change="onVisible"
    >
      <el-option v-for="a in options" :key="a.id" :value="a.id" :label="a.display_name" :disabled="!!blocker(a)">
        <div class="owner-select__option">
          <span class="owner-select__name">{{ a.display_name }}</span>
          <span class="owner-select__meta">
            <StatusTag v-if="a.platform_role" vocab="platformRole" :value="a.platform_role" />
            <span v-if="blocker(a)" class="owner-select__why">{{ t(`admin.owner.blocked.${blocker(a)}`) }}</span>
            <span v-else>{{ a.email ?? t(`enums.actorKind.${a.kind}`) }}</span>
            <code class="app-mono owner-select__id">{{ shortId(a.id) }}</code>
          </span>
        </div>
      </el-option>
      <template #empty>
        <div class="owner-select__empty">
          <template v-if="searching">{{ t('common.labels.loading') }}</template>
          <template v-else>{{
            searchError ?? (idOnly ? t('admin.owner.pasteId') : t('admin.owner.noMatch'))
          }}</template>
        </div>
      </template>
    </el-select>
    <div v-if="idOnly" class="app-form-hint">{{ t('admin.owner.noSearch') }}</div>
  </div>
</template>

<style scoped>
.owner-select {
  width: 100%;
}
.owner-select__select {
  width: 100%;
}
.owner-select__option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.owner-select__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.owner-select__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.owner-select__why {
  color: var(--el-color-warning);
}
.owner-select__id {
  font-size: 11px;
}
.owner-select__empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
