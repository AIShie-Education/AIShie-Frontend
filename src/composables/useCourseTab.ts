// Which of the course's tabs a page belongs to, when its route alone does not
// say. One route shows every document: material belongs under Materials, but
// an assignment's instructions or rubric under Assignments, a submitted file
// under Submissions and a feedback file under Grades. Such a page names the
// route whose tab it belongs to, and CourseLayout highlights that tab while
// the page is shown.
import { onBeforeUnmount, shallowRef, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'

interface Claim {
  owner: symbol
  route: string
}

/** The tab the page shown now has claimed, if any. Read by CourseLayout. */
export const courseTabClaim = shallowRef<Claim | null>(null)

/**
 * Highlights the course tab of the named route ('course-assignments', or any
 * route a tab counts as its own, such as 'course-assignment') while the
 * calling component is mounted. Null or undefined leaves it to the route.
 */
export function useCourseTab(routeName: MaybeRefOrGetter<string | null | undefined>): void {
  const owner = Symbol('course-tab')
  const release = () => {
    if (courseTabClaim.value?.owner === owner) courseTabClaim.value = null
  }
  const stop = watchEffect(() => {
    const route = toValue(routeName)
    if (route) courseTabClaim.value = { owner, route }
    else release()
  })
  onBeforeUnmount(() => {
    stop()
    release()
  })
}
