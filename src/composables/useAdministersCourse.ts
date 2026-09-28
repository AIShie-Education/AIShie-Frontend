// Whether the caller administers the open course: a platform administrator
// anywhere, or an administrator of its department or one above it
// (department.list_tree says which they administer). What only an
// administrator does to a course — its settings, its first instructor,
// purging what was uploaded to it by mistake — is offered by this; Core
// decides.
import { computed, watch } from 'vue'
import { useDepartmentTree } from './useDepartmentTree'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'

export function useAdministersCourse() {
  const session = useSessionStore()
  const course = useCourseStore()
  const departments = useDepartmentTree({ immediate: false })
  // Only a department's administrator needs the tree to be told; a platform
  // administrator administers every course.
  watch(
    () => session.isDeptAdmin && !session.isAdmin,
    (deptAdmin) => void (deptAdmin && departments.ensure()),
    { immediate: true },
  )
  return computed(
    () => session.isAdmin || (!!course.course && !!departments.byId.value.get(course.course.dept_id)?.administers),
  )
}
