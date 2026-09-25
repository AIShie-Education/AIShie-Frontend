import type { RouteRecordRaw } from 'vue-router'

// Platform administration: outside any course, for root and admins.
const routes: RouteRecordRaw[] = [
  {
    path: 'admin',
    meta: { admin: true },
    children: [
      { path: '', name: 'admin', redirect: { name: 'admin-courses' } },
      {
        path: 'courses',
        name: 'admin-courses',
        component: () => import('@/views/admin/CoursesView.vue'),
        meta: { title: 'admin.courses.title' },
      },
      {
        path: 'courses/:courseId',
        name: 'admin-course',
        component: () => import('@/views/admin/CourseAdminView.vue'),
        props: true,
        meta: { title: 'admin.course.title' },
      },
      {
        path: 'actors',
        name: 'admin-actors',
        component: () => import('@/views/admin/ActorsView.vue'),
        meta: { title: 'admin.actors.title' },
      },
      {
        path: 'actors/:actorId',
        name: 'admin-actor',
        component: () => import('@/views/admin/ActorView.vue'),
        props: true,
        meta: { title: 'admin.actor.title' },
      },
      {
        path: 'terms',
        name: 'admin-terms',
        component: () => import('@/views/admin/TermsView.vue'),
        meta: { title: 'adminSetup.terms.title' },
      },
      {
        path: 'departments',
        name: 'admin-departments',
        component: () => import('@/views/admin/DepartmentsView.vue'),
        meta: { title: 'adminSetup.departments.title' },
      },
      {
        path: 'presets',
        name: 'admin-presets',
        component: () => import('@/views/admin/PresetsView.vue'),
        meta: { title: 'adminSetup.presets.title' },
      },
    ],
  },
]
export default routes
