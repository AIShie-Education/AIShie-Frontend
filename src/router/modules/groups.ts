import type { RouteRecordRaw } from 'vue-router'

// A course's groups (分組): its group sets, each with its groups, under the
// course's Groups tab (layouts/courseNav.ts), for every reader of the
// course: staff place students and split them at random; a student sees
// their own group and signs up where sign-up is open. Each view receives the
// route params as props, as the rest of the course's do.
const routes: RouteRecordRaw[] = [
  {
    path: 'groups',
    name: 'course-groups',
    component: () => import('@/views/course/groups/GroupsView.vue'),
    props: true,
    meta: { title: 'groups.title' },
  },
  {
    path: 'groups/:setId',
    name: 'course-group-set',
    component: () => import('@/views/course/groups/GroupSetView.vue'),
    props: true,
    meta: { title: 'groups.set.title' },
  },
]
export default routes
