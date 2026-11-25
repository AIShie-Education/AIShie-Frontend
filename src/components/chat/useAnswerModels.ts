// Provider facts for the chat's privacy notice. The caller's own agent keeps
// its owner-only model detail (GET /agents, GET /models). For another person's
// agent, the conversation itself gives its Core actor_id and the asker-facing
// privacy route gives safe provider labels alone. An old Core without actor_id,
// a missing route, or any failure leaves the notice generic; nothing is guessed.
import {
  effectScope,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue'
import { runtime } from '@/api/runtime'
import type { ModelsAnswer } from '@/api/runtime-types'
import { useRuntime } from '@/composables/useRuntime'
import {
  answerModelsFromPrivacy,
  answerModelsOf,
  ownHostedIn,
  providerName,
  type AnswerHosting,
  type AnswerModels,
} from './privacy'

export interface UseAnswerModels {
  /** Its models, once the runtime has said; null otherwise. */
  models: ShallowRef<AnswerModels | null>
  /** A provider's name, as the runtime gives it, or its id. */
  providerName: (provider: string) => string
}

export function useAnswerModels(opts: {
  courseId: string
  /** The agent's name, as the conversation shows it. */
  name: MaybeRefOrGetter<string | null | undefined>
  /** Its Core course-member id, identifying the respondent. */
  memberId: MaybeRefOrGetter<string | null | undefined>
  /** Its Core actor id, disclosed by the conversation itself (Core after the companion change). */
  actorId: MaybeRefOrGetter<string | null | undefined>
  /** How it is hosted; only runtime agents have a privacy route. */
  hosting: MaybeRefOrGetter<AnswerHosting>
  /** It is the caller's own agent: its full owner-only row may be read. */
  mine: MaybeRefOrGetter<boolean>
}): UseAnswerModels {
  const models = shallowRef<AnswerModels | null>(null)
  const offers = shallowRef<Pick<ModelsAnswer, 'own_key'> | null>(null)
  let asked = false
  let loading = false
  let gone = false

  async function load(name: string, actorId: string, mine: boolean) {
    try {
      if (mine) {
        const listed = await runtime.list()
        if (gone) return
        const agent = ownHostedIn(listed.data.agents, opts.courseId, name)
        models.value = agent ? answerModelsOf(agent) : null
        if (!models.value) return
        // The providers' names; the ids are said where they do not come.
        runtime.models().then(
          (r) => {
            if (!gone) offers.value = r.data
          },
          () => undefined,
        )
        return
      }
      const answer = await runtime.privacy(actorId, opts.courseId)
      if (!gone) models.value = answerModelsFromPrivacy(answer.data)
    } catch {
      // 404, 422 core_too_old, 503 and every other failure: keep generic wording.
      models.value = null
    }
  }

  // Whether there is a runtime is asked once for this agent (one GET /info a
  // page load, shared). The owner and asker routes are never mixed.
  const scope = effectScope()
  if (getCurrentScope()) onScopeDispose(() => ((gone = true), scope.stop()))
  watch(
    () => [toValue(opts.mine), toValue(opts.name), toValue(opts.memberId), toValue(opts.hosting), toValue(opts.actorId)] as const,
    ([mine, name, memberId, hosting, actorId]) => {
      if (asked || !name || !memberId || hosting !== 'runtime' || (!mine && !actorId)) return
      asked = true
      scope.run(() => {
        const rt = useRuntime()
        watch(
          () => rt.available.value,
          (available) => {
            if (!available || loading) return
            loading = true
            void load(name, actorId ?? '', mine)
          },
          { immediate: true },
        )
      })
    },
    { immediate: true },
  )

  return { models, providerName: (p) => providerName(p, offers.value) }
}
