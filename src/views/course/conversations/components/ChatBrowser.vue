<script setup lang="ts">
// The chat's lists, in the parts the caller's seat has: Ask (whom they may
// ask, and the conversations they started), Addressed to me (for a seat that
// answers, with how many wait), and Oversight (for one that decides actions:
// the conversations of the members it decides for). Shared by the drawer and
// the full page.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Respondent } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import type { ChatRole } from '../chat'
import { useInbox } from '../useConversationList'
import ConversationList from './ConversationList.vue'
import RespondentList from './RespondentList.vue'

type Tab = 'ask' | 'answer' | 'oversee'

const props = withDefaults(
  defineProps<{
    courseId: string
    selectedId?: string | null
    /** On screen: the lists are kept fresh only then. */
    active?: boolean
    /** The caller's part in the conversation shown: its tab is brought forward. */
    selectedRole?: ChatRole | null
  }>(),
  { selectedId: null, active: true, selectedRole: null },
)
const emit = defineEmits<{ open: [conversationId: string]; start: [respondent: Respondent] }>()
const { t } = useI18n()
const course = useCourseStore()

const canAsk = computed(() => course.can('conversation_ask'))
const canAnswer = computed(() => course.can('conversation_answer'))
const canOversee = computed(() => course.can('action_decide'))
const tabs = computed<Tab[]>(() => [
  ...(canAsk.value ? (['ask'] as const) : []),
  ...(canAnswer.value ? (['answer'] as const) : []),
  ...(canOversee.value ? (['oversee'] as const) : []),
])

// Where the caller left it, for this page's life (the drawer and the page share it).
const tab = ref<Tab>(lastTab.get(props.courseId) ?? 'ask')
watch(
  tabs,
  (list) => {
    if (list.length && !list.includes(tab.value)) tab.value = list[0]!
  },
  { immediate: true },
)
watch(tab, (v) => lastTab.set(props.courseId, v))
const TAB_OF: Record<ChatRole, Tab> = { opener: 'ask', respondent: 'answer', overseer: 'oversee' }
watch(
  () => props.selectedRole,
  (r) => {
    const want = r ? TAB_OF[r] : null
    if (want && tabs.value.includes(want)) tab.value = want
  },
  { immediate: true },
)

const inbox = useInbox({ courseId: props.courseId, enabled: () => props.active && canAnswer.value })

const opener = ref<InstanceType<typeof ConversationList> | null>(null)
const respondent = ref<InstanceType<typeof ConversationList> | null>(null)
const overseer = ref<InstanceType<typeof ConversationList> | null>(null)
const respondents = ref<InstanceType<typeof RespondentList> | null>(null)

/** Reads the lists again: something was started or closed. */
function refresh() {
  void opener.value?.refresh()
  void respondent.value?.refresh()
  void overseer.value?.refresh()
  void respondents.value?.refresh()
  void inbox.refresh()
}
defineExpose({ refresh })
</script>

<script lang="ts">
const lastTab = new Map<string, 'ask' | 'answer' | 'oversee'>()
</script>

<template>
  <div class="chat-browser">
    <el-empty v-if="!tabs.length" :description="t('chat.nothingHere')" />
    <el-tabs v-else v-model="tab" class="chat-browser__tabs" :class="{ 'is-single': tabs.length === 1 }">
      <el-tab-pane v-if="canAsk" name="ask" :label="t('chat.tabs.ask')" lazy>
        <section class="chat-browser__section">
          <h3 class="chat-browser__heading">{{ t('chat.respondents.title') }}</h3>
          <p class="chat-browser__hint">{{ t('chat.respondents.hint') }}</p>
          <RespondentList
            ref="respondents"
            :course-id="courseId"
            :enabled="active && tab === 'ask'"
            @start="emit('start', $event)"
          />
        </section>
        <section class="chat-browser__section">
          <h3 class="chat-browser__heading">{{ t('chat.list.mine') }}</h3>
          <ConversationList
            ref="opener"
            :course-id="courseId"
            as="opener"
            :selected-id="selectedId"
            :enabled="active && tab === 'ask'"
            @open="emit('open', $event)"
          />
        </section>
      </el-tab-pane>
      <el-tab-pane v-if="canAnswer" name="answer" lazy>
        <template #label>
          <span class="chat-browser__tab-label">
            {{ t('chat.tabs.answer') }}
            <el-badge v-if="inbox.count.value" :value="inbox.count.value" :max="99" class="chat-browser__count" />
          </span>
        </template>
        <p class="chat-browser__hint">{{ t('chat.list.respondentHint') }}</p>
        <ConversationList
          ref="respondent"
          :course-id="courseId"
          as="respondent"
          :selected-id="selectedId"
          :enabled="active && tab === 'answer'"
          :waiting="inbox.ids.value"
          @open="emit('open', $event)"
        />
      </el-tab-pane>
      <el-tab-pane v-if="canOversee" name="oversee" :label="t('chat.tabs.oversee')" lazy>
        <p class="chat-browser__hint">{{ t('chat.list.overseerHint') }}</p>
        <ConversationList
          ref="overseer"
          :course-id="courseId"
          as="overseer"
          :selected-id="selectedId"
          :enabled="active && tab === 'oversee'"
          @open="emit('open', $event)"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.chat-browser__tabs.is-single :deep(.el-tabs__header) {
  display: none;
}
.chat-browser__section + .chat-browser__section {
  margin-top: 20px;
}
.chat-browser__heading {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}
.chat-browser__hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.chat-browser__tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.chat-browser__count :deep(.el-badge__content) {
  position: static;
  transform: none;
}
</style>
