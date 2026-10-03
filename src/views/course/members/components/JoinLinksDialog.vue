<script setup lang="ts">
// A course's invite link, for whoever may create one (member_invite): a form
// to create it (course.join_link_create), then the link itself, shown the
// one time it can be, for the ten minutes it works, with its QR code and a
// full-screen view to put up in class; and below, the links created so far
// (course.join_link_list), each revocable (course.join_link_revoke). Anyone
// with a link joins the course as a student at once, and may create an
// account through it (the join page, /join/<token>).
//
// The link just created is kept while this page is open, closed or not, so
// that reopening the dialog before it ends shows it again.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { read } from '@/api/http'
import { coreNow } from '@/api/clock'
import type { JoinLink } from '@/api/types'
import { usePaged } from '@/composables/useAsync'
import { announce, useWrite } from '@/composables/useWrite'
import { errorMessage, notifyError } from '@/composables/useErrors'
import { useCourseStore } from '@/stores/course'
import AppNote from '@/components/AppNote.vue'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import { joinLinkUrl } from '@/utils/joinLink'
import { joinRefusal } from '@/views/join/join'
import JoinLinkForm from './JoinLinkForm.vue'
import JoinLinkFullscreen from './JoinLinkFullscreen.vue'
import JoinLinkList from './JoinLinkList.vue'
import JoinLinkReveal from './JoinLinkReveal.vue'
import { draftArgs, newDraft } from './joinLinks'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const router = useRouter()
const course = useCourseStore()

// --- The links ----------------------------------------------------------------
const list = usePaged<JoinLink>(
  (after) =>
    read('course.join_link_list', { course_id: props.courseId, limit: 100, after }).then((o) => ({
      items: o.links ?? [],
      next: o.next,
    })),
  { immediate: false },
)

// --- Whether one can be created -------------------------------------------------
// A link is never created by proposal (Core refuses, not_by_proposal): its
// token is shown once, to whoever creates it, and would be shown to whoever
// approved it. Someone who may create links only with approval is told so,
// and may still see and revoke them.
const needsApproval = computed(() => course.needsApproval('member_invite'))
const blocked = computed(() =>
  !course.writable ? t('common.archivedCourse') : needsApproval.value ? t('join.links.notByProposal') : null,
)

// --- Creating one ----------------------------------------------------------------
type Panel = 'form' | 'shown'
const panel = ref<Panel>('form')
const draft = ref(newDraft())
const { run: runCreate, pending: creating, lastError: createError } = useWrite('course.join_link_create')
/** The link just created, the one time its address is known. */
const shown = shallowRef<{
  id: string
  url: string
  expiresAt: string
  maxUses: number | null
  domains: string[] | null
  args: ReturnType<typeof draftArgs>
} | null>(null)
const fullscreen = ref(false)
/** The link was created, but its answer (with the token) was lost on the way. */
const lost = ref(false)
/** A revocation, or a link, that waits for someone's approval. */
const proposedAction = ref<string | null>(null)
/** Why Core would not create the link, in the reader's words. */
const createRefusal = computed(() => {
  const e = createError.value
  return e ? (joinRefusal(e, 'join.links.errors') ?? errorMessage(e)) : null
})

async function create(args = draftArgs(draft.value)) {
  const out = await runCreate({ course_id: props.courseId, ...args }, { success: false, notify: false })
  if (!out) return
  void list.reload()
  // Core creates none by proposal; should one ever be queued, it is said as a revocation's is.
  if (out.status === 'proposed') {
    proposedAction.value = out.actionId
    fullscreen.value = false
    return
  }
  const r = out.result
  // A create Core had carried out already, answered again for a retry, comes
  // back without the token, which is shown once: this one cannot be shown.
  if (!r.token) {
    lost.value = true
    shown.value = null
    fullscreen.value = false
    panel.value = 'form'
    return
  }
  lost.value = false
  const href = router.resolve({ name: 'join', params: { token: r.token } }).href
  shown.value = {
    id: r.link_id,
    url: joinLinkUrl(window.location.origin, href),
    expiresAt: r.expires_at,
    maxUses: r.max_uses ?? null,
    domains: r.allowed_email_domains ?? null,
    args,
  }
  panel.value = 'shown'
}

/** A new link in place of one that has ended, as it was asked for. */
function renew() {
  if (shown.value) void create(shown.value.args)
}

function otherSettings() {
  fullscreen.value = false
  createError.value = null
  panel.value = 'form'
}

// Opening shows the link created last while it still works, and the list as it is now.
watch(
  open,
  (v) => {
    if (!v) {
      fullscreen.value = false
      return
    }
    proposedAction.value = null
    createError.value = null
    lost.value = false
    const live = shown.value && Date.parse(shown.value.expiresAt) > coreNow()
    panel.value = live ? 'shown' : 'form'
    if (!live) {
      shown.value = null
      draft.value = newDraft()
    }
    void list.reload()
  },
  { immediate: true },
)

// --- Revoking one ---------------------------------------------------------------
const { run: runRevoke, lastError: revokeError } = useWrite('course.join_link_revoke')
const revoking = ref<string | null>(null)
const writable = computed(() => course.writable)

async function revoke(link: JoinLink) {
  try {
    await ElMessageBox.confirm(t('join.links.revokeConfirm', { n: link.uses }, link.uses), t('join.links.revokeTitle'), {
      type: 'warning',
      confirmButtonText: t('join.links.revoke'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  revoking.value = link.id
  const out = await runRevoke(
    { course_id: props.courseId, link_id: link.id },
    { success: t('join.links.revoked'), notify: false },
  )
  revoking.value = null
  if (out) announce(out, { success: t('join.links.revoked') })
  const err = revokeError.value
  if (!out && err) {
    // Revoked meanwhile, by someone else: said so, and the list read again.
    if (err.code === 'conflict') {
      ElMessage({ type: 'info', message: t('join.links.alreadyRevoked') })
      void list.reload()
    } else {
      const words = joinRefusal(err, 'join.links.errors')
      if (words) ElMessage({ type: 'error', message: words, showClose: true, duration: 6000 })
      else notifyError(err)
    }
  }
  if (out?.status === 'proposed') proposedAction.value = out.actionId
  if (out?.status === 'executed' && shown.value?.id === link.id) {
    shown.value = null
    fullscreen.value = false
    panel.value = 'form'
  }
  if (out) void list.reload()
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('join.links.title')"
    width="760px"
    append-to-body
    class="join-links"
  >
    <!-- Creating a link, or the one just created -->
    <section class="join-links__panel">
      <template v-if="panel === 'form' || !shown">
        <el-alert
          v-if="createRefusal"
          :type="createError?.isForbidden ? 'warning' : 'error'"
          show-icon
          class="join-links__notice"
          :title="createRefusal"
          @close="createError = null"
        />
        <el-alert
          v-if="lost"
          type="warning"
          show-icon
          class="join-links__notice"
          :title="t('join.links.created.lost')"
          @close="lost = false"
        />
        <JoinLinkForm v-model="draft" :busy="creating" :blocked="blocked" @submit="create()" />
      </template>
      <template v-else>
        <el-alert
          v-if="createRefusal"
          :type="createError?.isForbidden ? 'warning' : 'error'"
          show-icon
          class="join-links__notice"
          :title="createRefusal"
          @close="createError = null"
        />
        <JoinLinkReveal
          :key="shown.id"
          :url="shown.url"
          :expires-at="shown.expiresAt"
          :code="course.course?.code ?? ''"
          :section="course.course?.section"
          :title="course.course?.title"
          :max-uses="shown.maxUses"
          :domains="shown.domains"
          :renewing="creating"
          :blocked="blocked"
          @renew="renew"
          @other="otherSettings"
          @fullscreen="fullscreen = true"
        />
      </template>
    </section>

    <!-- The links created so far -->
    <section class="join-links__list">
      <h3 class="join-links__heading">{{ t('join.links.list.title') }}</h3>
      <AppNote
        v-if="proposedAction"
        :title="t('join.links.proposed')"
        class="join-links__notice"
        @close="proposedAction = null"
        closable
      >
        <router-link :to="{ name: 'course-action', params: { courseId, actionId: proposedAction } }" @click="open = false">
          {{ t('members.proposed.view') }}
        </router-link>
      </AppNote>
      <AsyncState
        :loading="list.loading.value && !list.items.value.length"
        :error="list.error.value"
        @retry="list.reload"
      >
        <JoinLinkList
          :course-id="courseId"
          :links="list.items.value"
          :revoking="revoking"
          :can-revoke="writable"
          :current-id="shown?.id"
          @revoke="revoke"
          @leave="open = false"
        />
        <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
      </AsyncState>
    </section>

    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.close') }}</el-button>
    </template>
  </el-dialog>

  <JoinLinkFullscreen
    v-if="open && fullscreen && shown"
    :url="shown.url"
    :expires-at="shown.expiresAt"
    :code="course.course?.code ?? ''"
    :section="course.course?.section"
    :title="course.course?.title"
    :renewing="creating"
    :blocked="blocked"
    @renew="renew"
    @close="fullscreen = false"
  />
</template>

<style scoped>
.join-links__panel {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.join-links__list {
  padding-top: 16px;
}
.join-links__heading {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}
.join-links__notice {
  margin-bottom: 12px;
}
</style>
