<script setup lang="ts">
// Where a message is written: Enter sends, Shift+Enter starts a new line,
// and the Enter an input method uses to pick a word never sends. On a touch
// keyboard Enter is a new line and the button sends. Core takes at most
// 20 000 characters; the count shows as the draft nears that.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { BODY_MAX, bodyProblem, charCount, isSendKey } from '../chat'

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
  <div class="chat-composer">
    <div class="chat-composer__row">
      <el-input
        ref="input"
        class="chat-composer__input"
        type="textarea"
        :model-value="modelValue"
        :autosize="{ minRows: 1, maxRows: 8 }"
        resize="none"
        :placeholder="placeholder"
        :aria-label="placeholder ?? t('chat.composer.label')"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
        @keydown="onKeydown"
        @compositionstart="composing = true"
        @compositionend="onCompositionEnd"
      />
      <el-button
        type="primary"
        circle
        class="chat-composer__send"
        :loading="pending"
        :disabled="!canSend"
        :aria-label="t('chat.composer.send')"
        :title="t('chat.composer.send')"
        @click="emit('send')"
      >
        <el-icon v-if="!pending" aria-hidden="true"><Promotion /></el-icon>
      </el-button>
    </div>
    <div class="chat-composer__foot">
      <span v-if="!disabled" class="chat-composer__hint">
        {{ touch ? t('chat.composer.hintTouch') : t('chat.composer.hint') }}
      </span>
      <span v-if="showCount" class="chat-composer__count" :class="{ 'is-over': problem === 'tooLong' }">
        {{ t('chat.composer.count', { n: count, max: BODY_MAX }) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.chat-composer__row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.chat-composer__input {
  flex: 1;
  min-width: 0;
}
.chat-composer__input :deep(.el-textarea__inner) {
  line-height: 1.5;
  padding-top: 7px;
  padding-bottom: 7px;
}
.chat-composer__send {
  flex-shrink: 0;
}
.chat-composer__foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.chat-composer__count {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.chat-composer__count.is-over {
  color: var(--el-color-danger);
}
</style>
