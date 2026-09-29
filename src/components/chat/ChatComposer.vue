<script setup lang="ts">
// Where a message is written, as an editor's agent chat has it: one box, its
// text growing with what is written, and along its bottom the send button
// (and, as the draft nears Core's limit of 20 000 characters, the count).
// Enter sends, Shift+Enter starts a new line, and the Enter an input method
// uses to pick a word never sends; the send button's tooltip says so. On a
// touch keyboard Enter is a new line and the button sends.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { BODY_MAX, bodyProblem, charCount, isSendKey } from './chat'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  /** Nothing can be written now (the reason is shown elsewhere). */
  disabled?: boolean
  /** Sending: the draft stays, and cannot be sent again. */
  pending?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; send: [] }>()
const { t } = useI18n()

const touch = useMediaQuery('(pointer: coarse)')
const composing = ref(false)
const input = ref<{ focus: () => void } | null>(null)

const count = computed(() => charCount(props.modelValue))
const problem = computed(() => bodyProblem(props.modelValue))
const showCount = computed(() => count.value > BODY_MAX - 2000)
const canSend = computed(() => !props.disabled && !props.pending && !problem.value)

function onKeydown(e: Event | KeyboardEvent) {
  if (!(e instanceof KeyboardEvent)) return
  if (!isSendKey(e, { composing: composing.value, enterSends: !touch.value })) return
  e.preventDefault()
  if (canSend.value) emit('send')
}
function onCompositionEnd() {
  // Safari ends the composition before the keydown of the Enter that ended
  // it; that keydown carries keyCode 229, which isSendKey refuses.
  composing.value = false
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="chat-composer" :class="{ 'is-disabled': disabled }">
    <el-input
      ref="input"
      class="chat-composer__input"
      type="textarea"
      :model-value="modelValue"
      :autosize="{ minRows: 2, maxRows: 10 }"
      resize="none"
      :placeholder="placeholder"
      :aria-label="placeholder ?? t('chat.composer.label')"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
      @keydown="onKeydown"
      @compositionstart="composing = true"
      @compositionend="onCompositionEnd"
    />
    <div class="chat-composer__bar">
      <span v-if="showCount" class="chat-composer__count" :class="{ 'is-over': problem === 'tooLong' }">
        {{ t('chat.composer.count', { n: count, max: BODY_MAX }) }}
      </span>
      <el-tooltip
        :content="touch ? t('chat.composer.send') : t('chat.composer.sendTip')"
        placement="top"
        :show-after="400"
        :disabled="touch || !canSend"
      >
        <el-button
          type="primary"
          size="small"
          class="chat-composer__send"
          :loading="pending"
          :disabled="!canSend"
          :aria-label="t('chat.composer.send')"
          :aria-keyshortcuts="touch ? undefined : 'Enter'"
          @click="emit('send')"
        >
          <el-icon v-if="!pending" aria-hidden="true"><Top /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped>
/* One box, as an editor's agent chat has it: the text, then a row along its bottom with the send button. */
.chat-composer {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.chat-composer:focus-within {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.chat-composer.is-disabled {
  background: var(--el-disabled-bg-color);
}
.chat-composer__input :deep(.el-textarea__inner) {
  display: block;
  padding: 9px 12px 2px;
  border: none;
  box-shadow: none;
  background: transparent;
  line-height: 1.5;
}
.chat-composer__input :deep(.el-textarea__inner:focus),
.chat-composer__input :deep(.el-textarea__inner:hover) {
  box-shadow: none;
}
.chat-composer__bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 34px;
  padding: 0 6px 6px 12px;
}
.chat-composer__count {
  margin-right: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-placeholder);
}
.chat-composer__count.is-over {
  color: var(--el-color-danger);
}
.chat-composer__send.el-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
}
</style>
