<script setup lang="ts">
// About AIshie, from the account menu: the brand, its line, and which
// versions are running, this web app's (/version.json, which the image
// serves) and the server's (/healthz). Each is read when the dialog opens,
// and left out where it cannot be read (a development server has no
// /version.json). The versions live here, not on the sign-in page. On a
// phone it opens over the menu's drawer, and back closes it first, as it
// does the drawer under it (useBackCloses).
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { health } from '@/api/http'
import { useBackCloses } from '@/composables/useBackCloses'
import AppWordmark from '@/components/AppWordmark.vue'

const open = defineModel<boolean>({ required: true })
/** Once the dialog has gone, so the caller can put focus back where it came from. */
const emit = defineEmits<{ closed: [] }>()
const { t } = useI18n()
useBackCloses(open, () => (open.value = false))

const web = ref<string | null>(null)
const server = ref<string | null>(null)

async function webVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const v = (await res.json()) as { version?: unknown; commit?: unknown }
    const version = typeof v.version === 'string' ? v.version : null
    const commit = typeof v.commit === 'string' ? v.commit : null
    return version && commit && !version.includes(commit)
      ? t('common.aside', { text: version, aside: commit })
      : (version ?? commit)
  } catch {
    return null
  }
}

watch(open, async (v) => {
  if (!v) return
  const [w, h] = await Promise.all([webVersion(), health().catch(() => null)])
  web.value = w
  server.value = h?.version ?? null
})
</script>

<template>
  <!-- On the body, so it covers the whole window: the account button that
       opens it sits in the activity bar, whose own layer would hold it below
       the side bar and the header. -->
  <el-dialog
    v-model="open"
    :title="t('layout.about.title')"
    width="400px"
    append-to-body
    destroy-on-close
    class="about-dialog"
    @closed="emit('closed')"
  >
    <div class="about">
      <AppWordmark class="about__wordmark" decorative />
      <p class="about__tagline">{{ t('common.tagline') }}</p>
      <dl class="about__versions">
        <div>
          <dt>{{ t('layout.about.web') }}</dt>
          <dd>{{ web ?? t('layout.about.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('layout.about.server') }}</dt>
          <dd>{{ server ?? t('layout.about.unknown') }}</dd>
        </div>
      </dl>
    </div>
  </el-dialog>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.about .about__wordmark {
  height: 28px;
  color: var(--app-wordmark);
}
.about__tagline {
  margin: 0 0 8px;
  color: var(--app-ink-2);
}
.about__versions {
  display: grid;
  gap: 6px;
  margin: 0;
  width: 100%;
  font-size: var(--app-text-sm);
}
.about__versions > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 6px;
  border-top: 1px solid var(--app-line);
}
.about__versions dt {
  color: var(--app-ink-3);
}
.about__versions dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  color: var(--app-ink-2);
}
</style>
