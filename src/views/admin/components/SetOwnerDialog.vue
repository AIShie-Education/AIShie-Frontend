<script setup lang="ts">
// actor.set_owner: giving an agent an owner, changing it, or taking it away.
// An agent someone owns acts only as their delegate, seated by them
// (member.add_delegate) and never with more than their seat. Core refuses
// the change while the agent is seated in a course that is not archived, and
// revokes every token and session the agent has when it goes through, since
// whoever owned it before may hold them: both are said before, not after.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Actor } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import OwnerSelect from './OwnerSelect.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ actor: Actor }>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()

const hasOwner = computed(() => !!props.actor.owner_actor_id)
const mode = ref<'set' | 'clear'>('set')
const ownerId = ref('')
const picked = ref<Actor | null>(null)
const { run, pending } = useWrite('actor.set_owner')

watch(open, (v) => {
  if (!v) return
  mode.value = 'set'
  ownerId.value = ''
  picked.value = null
})

const ownerName = computed(() => props.actor.owner_name?.trim() || null)
const canSubmit = computed(() => !pending.value && (mode.value === 'clear' || !!ownerId.value))

async function submit() {
  if (!canSubmit.value) return
  const owner = mode.value === 'clear' ? null : ownerId.value
  const out = await run(
    { actor_id: props.actor.id, owner_actor_id: owner },
    {
      success:
        owner === null
          ? t('admin.setOwner.cleared', { name: props.actor.display_name })
          : t('admin.setOwner.done', { name: props.actor.display_name, owner: picked.value?.display_name ?? '' }),
    },
  )
  if (!out) return
  open.value = false
  emit('saved')
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="hasOwner ? t('admin.setOwner.titleChange') : t('admin.setOwner.titleSet')"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="set-owner__intro">{{ t('admin.setOwner.intro') }}</p>
    <p v-if="hasOwner" class="set-owner__now">
      {{ t('admin.setOwner.current', { owner: ownerName ?? t('admin.actor.ownerUnnamed') }) }}
    </p>

    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item v-if="hasOwner">
        <el-radio-group v-model="mode">
          <el-radio value="set">{{ t('admin.setOwner.modeSet') }}</el-radio>
          <el-radio value="clear">{{ t('admin.setOwner.modeClear') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="mode === 'set'" :label="t('admin.setOwner.owner')">
        <OwnerSelect v-model="ownerId" :exclude="actor.owner_actor_id" @picked="(a) => (picked = a)" />
        <div class="app-form-hint set-owner__hint">{{ t('admin.setOwner.ownerHint') }}</div>
      </el-form-item>
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        :title="t('admin.setOwner.clearEffect')"
        class="set-owner__alert"
      />
    </el-form>

    <el-alert type="warning" :closable="false" show-icon :title="t('admin.setOwner.before')" class="set-owner__alert">
      <ul class="set-owner__list">
        <li>{{ t('admin.setOwner.seated') }}</li>
        <li>{{ t('admin.setOwner.revokes') }}</li>
        <li>{{ t('admin.setOwner.archived') }}</li>
      </ul>
    </el-alert>

    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button
        :type="mode === 'clear' ? 'danger' : 'primary'"
        :loading="pending"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ mode === 'clear' ? t('admin.setOwner.submitClear') : t('admin.setOwner.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.set-owner__intro {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.set-owner__now {
  margin: 0 0 12px;
  font-size: 13px;
}
.set-owner__hint {
  width: 100%;
}
.set-owner__alert {
  margin-top: 4px;
  line-height: 1.5;
}
.set-owner__list {
  margin: 4px 0 0;
  padding-left: 18px;
}
.set-owner__list li + li {
  margin-top: 4px;
}
</style>
