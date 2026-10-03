<script setup lang="ts">
// An invitation just made (actor.invite), as the link the person opens,
// shown the one time it can be: Core keeps only the token's hash. The token
// goes in the link's fragment, which no server sees (utils/invitation).
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import type { ToolOut } from '@/api/types'
import TimeText from '@/components/TimeText.vue'
import { invitationLink } from '@/utils/invitation'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ issued: ToolOut<'actor.invite'> | null }>()
const emit = defineEmits<{ closed: [] }>()
const { t } = useI18n()
const router = useRouter()

const copied = ref(false)
watch(open, (v) => {
  if (v) copied.value = false
})

const token = computed(() => props.issued?.token || '')
const link = computed(() =>
  token.value ? invitationLink(window.location.origin + router.resolve({ name: 'welcome' }).href, token.value) : '',
)

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
  } catch {
    /* clipboard refused: the link is still selectable */
  }
}

function beforeClose(done: () => void) {
  if (!token.value || copied.value) return done()
  ElMessageBox.confirm(t('admin.invite.uncopied'), t('admin.token.uncopiedTitle'), {
    type: 'warning',
    confirmButtonText: t('admin.token.closeAnyway'),
    cancelButtonText: t('common.actions.cancel'),
  })
    .then(() => done())
    .catch(() => undefined)
}

function finish() {
  beforeClose(() => (open.value = false))
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="token ? t('admin.invite.revealTitle') : t('admin.invite.title')"
    width="560px"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    destroy-on-close
    @closed="emit('closed')"
  >
    <template v-if="issued">
      <el-alert
        v-if="token"
        type="warning"
        :closable="false"
        show-icon
        :title="t('admin.invite.once')"
        class="reveal__alert"
      />
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        :title="t('admin.invite.replayed')"
        class="reveal__alert"
      />

      <div v-if="token">
        <label class="reveal__label" for="reveal-invite-link">{{ t('admin.invite.link') }}</label>
        <div class="reveal__row">
          <el-input
            id="reveal-invite-link"
            :model-value="link"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 5 }"
            resize="none"
            readonly
            class="reveal__input"
            @focus="($event.target as HTMLTextAreaElement).select()"
          />
          <el-button type="primary" @click="copy">
            <el-icon><CopyDocument /></el-icon>
            <span>{{ copied ? t('common.actions.copied') : t('common.actions.copy') }}</span>
          </el-button>
        </div>
      </div>

      <dl class="reveal__facts">
        <div>
          <dt>{{ t('admin.invite.email') }}</dt>
          <dd class="reveal__email">
            <template v-if="issued.login_id">
              <code>{{ issued.login_id }}</code>
              <template v-if="issued.email">{{ t('common.sep') }}{{ issued.email }}</template>
            </template>
            <template v-else>{{ issued.email }}</template>
          </dd>
        </div>
        <div>
          <dt>{{ t('admin.invite.expires') }}</dt>
          <dd><TimeText :value="issued.expires_at" cutoff /></dd>
        </div>
      </dl>

      <p v-if="token" class="app-form-hint reveal__send">{{ t('admin.invite.send') }}</p>
    </template>
    <template #footer>
      <el-button type="primary" @click="finish">{{ t('admin.token.doneCopying') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.reveal__alert {
  margin-bottom: 16px;
}
.reveal__label {
  display: block;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}
.reveal__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.reveal__input {
  flex: 1;
  min-width: 0;
}
.reveal__input :deep(textarea) {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-sm);
  word-break: break-all;
}
.reveal__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 16px 0 0;
  font-size: var(--app-text-sm);
}
.reveal__facts dt {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.reveal__facts dd {
  margin: 2px 0 0;
}
.reveal__email {
  word-break: break-all;
}
.reveal__send {
  margin: 16px 0 0;
}
</style>
