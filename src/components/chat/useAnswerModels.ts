// The models the caller's own agent answers with, as the runtime tells its
// owner (GET /agents, and GET /models for the providers' names), for the
// chat's privacy notice (privacy.ts) to name its provider. Asked only of the
// caller's own agent, only where there is a runtime, and once for the pane;
// an answer that does not come leaves the notice saying that a model's
// provider receives it, never which.
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
import { answerModelsOf, ownHostedIn, providerName, type AnswerModels } from './privacy'

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
  /** It is the caller's own agent: only then does the runtime say. */
  mine: MaybeRefOrGetter<boolean>
}): UseAnswerModels {
  const models = shallowRef<AnswerModels | null>(null)
  const offers = shallowRef<Pick<ModelsAnswer, 'own_key'> | null>(null)
  let asked = false
  let loading = false
  let gone = false

  async function load(name: string) {
    try {
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
    } catch {
      models.value = null
    }
  }

  // Whether there is a runtime is asked only once it is the caller's own
  // agent (one GET /info a page load, shared): nobody else's is told.
  const scope = effectScope()
  if (getCurrentScope()) onScopeDispose(() => ((gone = true), scope.stop()))
  watch(
    () => [toValue(opts.mine), toValue(opts.name)] as const,
    ([mine, name]) => {
      if (asked || !mine || !name) return
      asked = true
      scope.run(() => {
        const rt = useRuntime()
        watch(
          () => rt.available.value,
          (available) => {
            if (!available || loading) return
            loading = true
            void load(name)
          },
          { immediate: true },
        )
      })
    },
    { immediate: true },
  )

  return { models, providerName: (p) => providerName(p, offers.value) }
}
