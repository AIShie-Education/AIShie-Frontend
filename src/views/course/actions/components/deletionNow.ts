// A deletion of an assignment for good (assignment.delete) as an action: the
// counts its proposer was shown and confirmed, which Core holds it to, and,
// while it waits for approval, what would go now (assignment.delete_preview,
// read for whoever writes assignments). Where more would go now, approving
// it fails: Core refuses a deletion that would take more than was confirmed
// (confirm_stale). Where it is approved (DeletionAtStake, in DecidePanel)
// and on its page (DeletionProposal).
import { computed } from 'vue'
import { read } from '@/api/http'
import type { AssignmentDeletePreview, DeletionCounts } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { confirmOf, countsGrown, isDeletedError } from '@/views/course/assignments/components/deletion'
import type { ActionRow } from './actionText'

export function useDeletionNow(action: () => ActionRow, courseId: () => string) {
  const course = useCourseStore()
  const was = computed<DeletionCounts | null>(() => confirmOf(action().payload))
  const waiting = computed(() => action().status === 'proposed')
  const assignmentId = computed(() => action().target_id ?? undefined)

  const now = useAsync<AssignmentDeletePreview | null>(
    async () => {
      const id = assignmentId.value
      if (!waiting.value || !id || !course.can('assignment_write')) return null
      return read('assignment.delete_preview', { course_id: courseId(), assignment_id: id })
    },
    { watch: [waiting, assignmentId] },
  )
  /** The assignment was deleted meanwhile: approving it has nothing left to delete. */
  const gone = computed(() => !!now.error.value && isDeletedError(now.error.value))
  /** What would go now, where it was read. */
  const current = computed<DeletionCounts | null>(() => now.data.value?.counts ?? null)
  /** More would go now than was confirmed: approving it would fail. */
  const grown = computed(() => !!current.value && countsGrown(was.value, current.value))
  return { was, waiting, current, grown, gone }
}
