// A page filtered by an assignment (?assignment=, the submissions and the
// grades pages) whose assignment was deleted for good since its link was
// made: the filter is dropped, and the page says why (filterGone), rather
// than listing nothing or failing. Core is asked only about an assignment
// the course's list does not have, and the filter is dropped only when Core
// says it was deleted: one the caller may not see stays as it was.
import { ref, watch, type Ref } from 'vue'
import { useCourseStore } from '@/stores/course'
import { wasDeleted } from './deletion'

export function useDeletedFilter(courseId: () => string, assignment: Ref<string | undefined>): Ref<boolean> {
  const course = useCourseStore()
  const gone = ref(false)
  watch(
    [() => assignment.value, () => course.assignmentsState],
    async ([a, state]) => {
      if (!a || state !== 'loaded') return
      if (course.assignments.has(a)) {
        gone.value = false
        return
      }
      if ((await wasDeleted(courseId(), a)) && assignment.value === a) {
        assignment.value = undefined
        gone.value = true
      }
    },
    { immediate: true },
  )
  void course.ensureAssignments()
  return gone
}
