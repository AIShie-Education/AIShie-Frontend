import type { RouteRecordRaw } from 'vue-router'

// Everything inside one course. Each view receives the route params as props
// (courseId always, plus its own id). The course itself, the caller's seat and
// what it may do are in the course store, loaded by CourseLayout.
const routes: RouteRecordRaw[] = [
  {
    path: '',
    name: 'course-overview',
    component: () => import('@/views/course/overview/OverviewView.vue'),
    props: true,
    meta: { title: 'overview.title' },
  },
  {
    path: 'materials',
    name: 'course-materials',
    component: () => import('@/views/course/materials/MaterialsView.vue'),
    props: true,
    meta: { title: 'materials.title' },
  },
  {
    path: 'documents/:documentId',
    name: 'course-document',
    component: () => import('@/views/course/materials/DocumentView.vue'),
    props: true,
    meta: { title: 'materials.document.title' },
  },
  {
    path: 'assignments',
    name: 'course-assignments',
    component: () => import('@/views/course/assignments/AssignmentsView.vue'),
    props: true,
    meta: { title: 'assignments.title' },
  },
  {
    path: 'assignments/:assignmentId',
    name: 'course-assignment',
    component: () => import('@/views/course/assignments/AssignmentView.vue'),
    props: true,
    meta: { title: 'assignments.detail.title' },
  },
  {
    path: 'submissions',
    name: 'course-submissions',
    component: () => import('@/views/course/submissions/SubmissionsView.vue'),
    props: true,
    meta: { title: 'submissions.title' },
  },
  {
    path: 'submissions/:submissionId',
    name: 'course-submission',
    component: () => import('@/views/course/submissions/SubmissionView.vue'),
    props: true,
    meta: { title: 'submissions.detail.title' },
  },
  {
    path: 'grades',
    name: 'course-grades',
    component: () => import('@/views/course/grades/GradesView.vue'),
    props: true,
    meta: { title: 'grades.title' },
  },
  {
    path: 'grades/:gradeId',
    name: 'course-grade',
    component: () => import('@/views/course/grades/GradeView.vue'),
    props: true,
    meta: { title: 'grades.detail.title' },
  },
  {
    path: 'gradebook/:studentMemberId?',
    name: 'course-gradebook',
    component: () => import('@/views/course/grades/GradebookView.vue'),
    props: true,
    meta: { title: 'grades.gradebook.title' },
  },
  {
    path: 'scheme',
    name: 'course-scheme',
    component: () => import('@/views/course/scheme/SchemeView.vue'),
    props: true,
    meta: { title: 'scheme.title' },
  },
  {
    path: 'members',
    name: 'course-members',
    component: () => import('@/views/course/members/MembersView.vue'),
    props: true,
    meta: { title: 'members.title' },
  },
  {
    path: 'members/:memberId',
    name: 'course-member',
    component: () => import('@/views/course/members/MemberView.vue'),
    props: true,
    meta: { title: 'members.detail.title' },
  },
  {
    path: 'approvals',
    name: 'course-approvals',
    component: () => import('@/views/course/actions/ApprovalsView.vue'),
    props: true,
    meta: { title: 'actions.approvals.title' },
  },
  {
    path: 'actions/:actionId',
    name: 'course-action',
    component: () => import('@/views/course/actions/ActionView.vue'),
    props: true,
    meta: { title: 'actions.detail.title' },
  },
  {
    path: 'my-actions',
    name: 'course-my-actions',
    component: () => import('@/views/course/actions/MyActionsView.vue'),
    props: true,
    meta: { title: 'actions.mine.title' },
  },
  {
    path: 'activity',
    name: 'course-activity',
    component: () => import('@/views/course/activity/ActivityView.vue'),
    props: true,
    meta: { title: 'activity.title' },
  },
]
export default routes
