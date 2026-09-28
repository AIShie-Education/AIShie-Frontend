<script setup lang="ts">
// What a new invite link is to be (course.join_link_create): how many may
// join through it, and whose email it lets in. It works for ten minutes,
// always; the form says so, and what the link lets anyone who has it do.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import { MAX_DOMAINS, normalizeDomain } from '@/utils/joinLink'
import { JOIN_LINK_MINUTES, MAX_JOIN_LINK_USES, type JoinLinkDraft } from './joinLinks'

const draft = defineModel<JoinLinkDraft>({ required: true })
const props = defineProps<{
  /** The link is being created. */
  busy?: boolean
  /** Why no link can be created here now, when none can (an archived course, say); said on the button. */
  blocked?: string | null
}>()
const emit = defineEmits<{ submit: [] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
/** What was typed for a domain and would not do, said under the field. */
const badDomain = ref<string | null>(null)

const rules = computed<FormRules>(() => ({
  domains: [
    {
      validator: (_r: unknown, v: string[], cb: (e?: Error) => void) => {
        if (badDomain.value) cb(new Error(t('join.links.form.badDomain', { d: badDomain.value })))
        else if ((v?.length ?? 0) > MAX_DOMAINS) cb(new Error(t('join.links.form.tooManyDomains', { n: MAX_DOMAINS })))
        else cb()
      },
      trigger: 'change',
    },
  ],
}))

// What is typed is kept as the link will keep it (lower case, no @); what is
// no domain is taken back out, and said.
function onDomains(values: string[]) {
  const out: string[] = []
  badDomain.value = null
  for (const v of values) {
    const d = normalizeDomain(v)
    if (!d) badDomain.value = v.trim()
    else if (!out.includes(d)) out.push(d)
  }
  draft.value = { ...draft.value, domains: out }
  void formRef.value?.validateField('domains').catch(() => undefined)
}

async function submit() {
  if (props.busy || props.blocked) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  emit('submit')
}
</script>

<template>
  <el-form
    ref="formRef"
    :model="draft"
    :rules="rules"
    label-position="top"
    class="join-form"
    @submit.prevent="submit"
  >
    <p class="join-form__explain">
      <el-icon class="join-form__clock"><Timer /></el-icon>
      <span>{{ t('join.links.explain', { n: JOIN_LINK_MINUTES }) }}</span>
    </p>

    <div class="join-form__fields">
      <el-form-item :label="t('join.links.form.maxUses')" prop="maxUses" class="join-form__uses">
        <el-input-number
          v-model="draft.maxUses"
          :min="1"
          :max="MAX_JOIN_LINK_USES"
          :step="1"
          step-strictly
          :value-on-clear="null"
          :placeholder="t('join.links.form.noLimit')"
          controls-position="right"
          name="max_uses"
          class="join-form__number"
        />
        <div class="app-form-hint">{{ t('join.links.form.maxUsesHint') }}</div>
      </el-form-item>

      <el-form-item :label="t('join.links.form.domains')" prop="domains" class="join-form__domains">
        <el-select
          :model-value="draft.domains"
          multiple
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          :placeholder="t('join.links.form.domainsPlaceholder')"
          :no-data-text="t('join.links.form.domainsPlaceholder')"
          class="join-form__domain-select"
          @update:model-value="onDomains"
        />
        <div class="app-form-hint">{{ t('join.links.form.domainsHint') }}</div>
      </el-form-item>
    </div>

    <el-tooltip :content="blocked ?? ''" :disabled="!blocked" placement="top">
      <span class="join-form__submit-wrap">
        <el-button type="primary" native-type="submit" :loading="busy" :disabled="!!blocked" class="join-form__submit">
          <el-icon><Link /></el-icon>
          <span>{{ t('join.links.form.submit') }}</span>
        </el-button>
      </span>
    </el-tooltip>
  </el-form>
</template>

<style scoped>
.join-form__explain {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
.join-form__clock {
  margin-top: 4px;
  flex-shrink: 0;
  color: var(--el-color-primary);
}
.join-form__fields {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 0 20px;
}
.join-form__number {
  width: 100%;
}
.join-form__domain-select {
  width: 100%;
}
.join-form__submit-wrap {
  display: inline-block;
}
@media (max-width: 640px) {
  .join-form__fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .join-form__submit-wrap,
  .join-form__submit {
    width: 100%;
  }
}
</style>
