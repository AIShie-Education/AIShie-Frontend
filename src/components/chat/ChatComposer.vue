<script setup lang="ts">
// Where a message is written, as an editor's agent chat has it: one box, its
// text growing with what is written, and along its bottom the send button
// (and, as the draft nears Core's limit of 20 000 characters, the count).
// Enter sends, Shift+Enter starts a new line, and the Enter an input method
// uses to pick a word never sends; the send button's tooltip says so. On a
// touch keyboard Enter is a new line and the button sends.
//
// While an answer is awaited and nothing is written, the send button is a
// stop button (stoppable): it takes the question back (the pane withdraws
// it, and puts its words back here). Anything written, it sends again: a
// follow-up, which the agent answers instead.
//
// As in an agent chat's box: ↑ in an empty box brings back the last message
// sent (recall); Escape leaves the box; a slash at the start opens the
// commands (commands: /new and /history), and an @ at the start of a word
// the course's assignments and materials (loadMentions), to write one's
// title in. Their list is worked with the arrow keys, Enter or
// Tab to choose and Escape to close, or with a tap; never while an input
// method is composing.
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { BODY_MAX, bodyProblem, charCount, isSendKey } from './chat'
import { matchMentions, triggerAt, type ComposerTrigger, type Mention } from './mentions'

export interface ComposerCommand {
  /** What is typed after the slash. */
  name: string
  label: string
}

const props = defineProps<{
  modelValue: string
  placeholder?: string
  /** Nothing can be written now (the reason is shown elsewhere). */
  disabled?: boolean
  /** Sending: the draft stays, and cannot be sent again. */
  pending?: boolean
  /** An answer is awaited, which may be stopped: with nothing written, the button stops it. */
  stoppable?: boolean
  /** Stopping it. */
  stopping?: boolean
  /** What ↑ brings back into an empty box: the last message sent. */
  recall?: string | null
  /** What a slash at the start offers. */
  commands?: ComposerCommand[]
  /** What an @ offers, read when it is first typed. */
  loadMentions?: (() => Promise<Mention[]>) | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; send: []; stop: []; command: [name: string] }>()
const { t } = useI18n()

const touch = useMediaQuery('(pointer: coarse)')
const composing = ref(false)
const input = ref<{ focus: () => void; blur: () => void; textarea?: HTMLTextAreaElement } | null>(null)
const textarea = () => input.value?.textarea ?? null

const count = computed(() => charCount(props.modelValue))
const problem = computed(() => bodyProblem(props.modelValue))
const showCount = computed(() => count.value > BODY_MAX - 2000)
const canSend = computed(() => !props.disabled && !props.pending && !problem.value)
/** Nothing written while an answer is awaited: the button stops it. */
const stopMode = computed(() => !!props.stoppable && problem.value === 'empty' && !props.pending)

// --- The list a slash or an @ opens -----------------------------------------------
const trigger = ref<ComposerTrigger | null>(null)
/** Dismissed with Escape: closed until what is typed changes. */
const dismissedAt = ref<string | null>(null)
const mentions = ref<Mention[] | null>(null)
const loadingMentions = ref(false)
const active = ref(0)
const listId = `chat-suggest-${Math.random().toString(36).slice(2, 9)}`

type Option =
  { id: string; kind: 'command'; command: ComposerCommand } | { id: string; kind: 'mention'; mention: Mention }
const options = computed<Option[]>(() => {
  const tr = trigger.value
  if (!tr) return []
  if (tr.kind === 'slash') {
    return (props.commands ?? [])
      .filter((c) => c.name.startsWith(tr.query))
      .map((c) => ({ id: `${listId}-c-${c.name}`, kind: 'command' as const, command: c }))
  }
  return matchMentions(mentions.value ?? [], tr.query).map((m) => ({
    id: `${listId}-m-${m.kind}-${m.id}`,
    kind: 'mention' as const,
    mention: m,
  }))
})
/** The list is open: a command or a mention being typed, with something to offer or to say. */
const listOpen = computed(() => {
  const tr = trigger.value
  if (!tr || props.disabled || dismissedAt.value === props.modelValue) return false
  if (tr.kind === 'slash') return options.value.length > 0
  return !!props.loadMentions
})
const activeId = computed(() => (listOpen.value ? options.value[active.value]?.id : undefined))
watch(options, () => (active.value = 0))

function caretOf(): number {
  const el = textarea()
  return el ? (el.selectionStart ?? props.modelValue.length) : props.modelValue.length
}
function readTrigger() {
  trigger.value = triggerAt(props.modelValue, caretOf())
  if (trigger.value?.kind === 'mention' && mentions.value === null && props.loadMentions && !loadingMentions.value) {
    loadingMentions.value = true
    props
      .loadMentions()
      .then((items) => (mentions.value = items))
      .catch(() => (mentions.value = []))
      .finally(() => (loadingMentions.value = false))
  }
}
watch(
  () => props.modelValue,
  (v) => {
    if (dismissedAt.value !== null && dismissedAt.value !== v) dismissedAt.value = null
    void nextTick(readTrigger)
  },
)

/** Puts text in the box, the caret where given (at its end), and the focus there. */
function setText(text: string, caret = text.length) {
  emit('update:modelValue', text)
  void nextTick(() => {
    const el = textarea()
    if (!el) return
    el.focus()
    el.setSelectionRange(caret, caret)
    readTrigger()
  })
}

function choose(o: Option | undefined) {
  if (!o) return
  const tr = trigger.value
  if (o.kind === 'command') {
    trigger.value = null
    emit('update:modelValue', '')
    emit('command', o.command.name)
    return
  }
  if (tr?.kind !== 'mention') return
  const caret = caretOf()
  const words = t('chat.mention.insert', { title: o.mention.title })
  const text = props.modelValue.slice(0, tr.start) + words + props.modelValue.slice(caret)
  trigger.value = null
  setText(text, tr.start + words.length)
}

function onKeydown(e: Event | KeyboardEvent) {
  if (!(e instanceof KeyboardEvent)) return
  const imeBusy = e.isComposing || composing.value || e.keyCode === 229
  if (listOpen.value && !imeBusy) {
    const n = options.value.length
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
      e.preventDefault()
      active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
      return
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && n && !e.shiftKey) {
      e.preventDefault()
      choose(options.value[active.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      dismissedAt.value = props.modelValue
      return
    }
  }
  if (e.key === 'Escape' && !imeBusy) {
    // Out of the box; the next Escape is the page's (on a phone, it closes the chat's sheet).
    e.preventDefault()
    input.value?.blur()
    return
  }
  if (e.key === 'ArrowUp' && !imeBusy && !props.modelValue && props.recall && !e.shiftKey && !e.altKey) {
    e.preventDefault()
    setText(props.recall)
    return
  }
  if (!isSendKey(e, { composing: composing.value, enterSends: !touch.value })) return
  e.preventDefault()
  if (canSend.value) emit('send')
}
function onCompositionEnd() {
  // Safari ends the composition before the keydown of the Enter that ended
  // it; that keydown carries keyCode 229, which isSendKey refuses.
  composing.value = false
  void nextTick(readTrigger)
}
function onBlur() {
  // A press on the list takes no focus (its mousedown is held back), so this is leaving the box.
  trigger.value = null
}

/** What the empty box hints at: the slash and the @. */
const hint = computed(() => {
  if (props.modelValue || touch.value || props.disabled) return ''
  const parts: string[] = []
  if (props.commands?.length) parts.push(t('chat.composer.hintCommands'))
  if (props.loadMentions) parts.push(t('chat.composer.hintMentions'))
  return parts.join(' · ')
})

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="chat-composer" :class="{ 'is-disabled': disabled }">
    <div
      v-if="listOpen"
      :id="listId"
      class="chat-suggest"
      :class="`is-${trigger?.kind}`"
      role="listbox"
      :aria-label="trigger?.kind === 'slash' ? t('chat.composer.commands') : t('chat.mention.label')"
    >
      <template v-if="trigger?.kind === 'mention'">
        <div v-if="loadingMentions && !mentions" class="chat-suggest__note" role="presentation">
          {{ t('chat.mention.loading') }}
        </div>
        <div v-else-if="!options.length" class="chat-suggest__note" role="presentation">
          {{ trigger.query ? t('chat.mention.none', { q: trigger.query }) : t('chat.mention.empty') }}
        </div>
      </template>
      <div
        v-for="(o, i) in options"
        :id="o.id"
        :key="o.id"
        class="chat-suggest__item"
        :class="{ 'is-active': i === active }"
        role="option"
        :aria-selected="i === active ? 'true' : 'false'"
        @mousedown.prevent
        @mouseenter="active = i"
        @click="choose(o)"
      >
        <template v-if="o.kind === 'command'">
          <span class="chat-suggest__command">/{{ o.command.name }}</span>
          <span class="chat-suggest__label">{{ o.command.label }}</span>
        </template>
        <template v-else>
          <el-icon class="chat-suggest__icon" aria-hidden="true"
            ><EditPen v-if="o.mention.kind === 'assignment'" /><Reading v-else
          /></el-icon>
          <span class="chat-suggest__label">{{ o.mention.title }}</span>
          <span class="chat-suggest__kind">{{ t(`chat.mention.kind.${o.mention.kind}`) }}</span>
        </template>
      </div>
    </div>
    <el-input
      ref="input"
      class="chat-composer__input"
      type="textarea"
      :model-value="modelValue"
      :autosize="{ minRows: 2, maxRows: 10 }"
      resize="none"
      :placeholder="placeholder"
      :aria-label="placeholder ?? t('chat.composer.label')"
      :aria-expanded="listOpen ? 'true' : 'false'"
      :aria-controls="listOpen ? listId : undefined"
      :aria-activedescendant="activeId"
      aria-autocomplete="list"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
      @keydown="onKeydown"
      @click="readTrigger"
      @blur="onBlur"
      @compositionstart="composing = true"
      @compositionend="onCompositionEnd"
    />
    <div class="chat-composer__bar">
      <span v-if="showCount" class="chat-composer__count" :class="{ 'is-over': problem === 'tooLong' }">
        {{ t('chat.composer.count', { n: count, max: BODY_MAX }) }}
      </span>
      <span v-else-if="hint" class="chat-composer__hint" aria-hidden="true">{{ hint }}</span>
      <el-tooltip
        v-if="stopMode"
        :content="t('chat.composer.stopTip')"
        placement="top"
        :show-after="400"
        :disabled="touch"
        :trigger-keys="[]"
      >
        <el-button
          size="small"
          class="chat-composer__send chat-composer__stop"
          :loading="stopping"
          :aria-label="t('chat.composer.stop')"
          @click="emit('stop')"
        >
          <span v-if="!stopping" class="chat-composer__stop-icon" aria-hidden="true" />
        </el-button>
      </el-tooltip>
      <el-tooltip
        v-else
        :content="touch ? t('chat.composer.send') : t('chat.composer.sendTip')"
        placement="top"
        :show-after="400"
        :disabled="touch || !canSend"
        :trigger-keys="[]"
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
  position: relative;
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
.chat-composer__hint {
  margin-right: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
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
/* The stop button: a square, in the ink, on the box. */
.chat-composer__stop.el-button {
  border-color: var(--app-line-strong);
  background: var(--app-ground-2);
  color: var(--app-ink);
}
.chat-composer__stop.el-button:hover {
  border-color: var(--app-ink-3);
  background: var(--app-line);
}
.chat-composer__stop-icon {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: currentColor;
}
/* The commands, or the course's assignments and materials, over the box. */
.chat-suggest {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 5;
  max-height: 264px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--app-line);
  border-radius: 10px;
  background: var(--app-overlay);
  box-shadow: var(--app-shadow-pop);
}
.chat-suggest__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  padding: 5px 10px;
  border-radius: 7px;
  font-size: 14px;
  cursor: pointer;
}
.chat-suggest__item.is-active {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
}
.chat-suggest__command {
  flex-shrink: 0;
  min-width: 76px;
  font-family: var(--app-font-mono);
  font-size: 13px;
  font-weight: 600;
}
.chat-suggest__icon {
  flex-shrink: 0;
  color: var(--app-ink-3);
}
.chat-suggest__item.is-active .chat-suggest__icon {
  color: inherit;
}
.chat-suggest__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-suggest__kind {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.chat-suggest__item.is-active .chat-suggest__kind {
  color: inherit;
}
.chat-suggest__note {
  padding: 8px 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
