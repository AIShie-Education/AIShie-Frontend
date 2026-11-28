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
  /** False while the offers that determine ownership are still loading. */
  ready?: MaybeRefOrGetter<boolean>
}): UseAnswerModels {
  const models = shallowRef<AnswerModels | null>(null)
  const offers = shallowRef<Pick<ModelsAnswer, 'own_key'> | null>(null)
  let requested = ''
  let serial = 0
  let gone = false

  async function load(name: string, actorId: string, mine: boolean, request: number) {
    models.value = null
    offers.value = null
    const current = () => !gone && request === serial
    try {
      if (mine) {
        const listed = await runtime.list()
        if (!current()) return
        const agent = ownHostedIn(listed.data.agents, opts.courseId, name)
        models.value = agent ? answerModelsOf(agent) : null
        if (!models.value) return
        // The providers' names; the ids are said where they do not come.
        runtime.models().then(
          (r) => {
            if (current()) offers.value = r.data
          },
          () => undefined,
        )
        return
      }
      const answer = await runtime.privacy(actorId, opts.courseId)
      if (current()) models.value = answerModelsFromPrivacy(answer.data)
    } catch {
      // 404, 422 core_too_old, 503 and every other failure: keep generic wording.
      if (current()) models.value = null
    }
  }

  // A conversation may be read before the current offers establish ownership.
  // Allow that late fact to switch the privacy route to the owner-only route;
  // a late response from the older request may never replace the newer one.
  const scope = effectScope()
  if (getCurrentScope()) onScopeDispose(() => ((gone = true), scope.stop()))
  scope.run(() => {
    const rt = useRuntime()
    watch(
      () => [rt.available.value, toValue(opts.ready) ?? true, toValue(opts.mine), toValue(opts.name), toValue(opts.memberId), toValue(opts.hosting), toValue(opts.actorId)] as const,
      ([available, ready, mine, name, memberId, hosting, actorId]) => {
        if (!available || !ready || !name || !memberId || hosting !== 'runtime' || (!mine && !actorId)) {
          requested = ''
          serial++
          models.value = null
          offers.value = null
          return
        }
        const key = JSON.stringify([mine, name, memberId, actorId ?? ''])
        if (requested === key) return
        requested = key
        serial++
        void load(name, actorId ?? '', mine, serial)
      },
      { immediate: true },
    )
  })

  return { models, providerName: (p) => providerName(p, offers.value) }
}
