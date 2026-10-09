import type { RouteRecordRaw } from 'vue-router'

// Peer evaluation within a group, inside one course (course.ts takes these
// among its own): an assignment's results, for those who grade. The form is
// set up on the assignment's page, and a student fills theirs in there.
const routes: RouteRecordRaw[] = [
  {
    path: 'assignments/:assignmentId/peer',
    name: 'course-assignment-peer',
    component: () => import('@/views/course/peer/PeerResultsView.vue'),
    props: true,
    meta: { title: 'peer.results.title' },
  },
]
export default routes
