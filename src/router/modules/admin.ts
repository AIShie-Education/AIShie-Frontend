import type { RouteRecordRaw } from 'vue-router'

// Administration: outside any course. Courses and departments are for
// platform administrators and for the administrators of a department, who see
// only what is beneath their appointments; people, terms, presets and the
// agent runtime's settings are for platform administrators alone.
const routes: RouteRecordRaw[] = [
  {
    path: 'admin',
    meta: { admin: 'departments' },
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
        meta: { title: 'admin.actors.title', admin: true },
      },
      {
        path: 'actors/:actorId',
        name: 'admin-actor',
        component: () => import('@/views/admin/ActorView.vue'),
        props: true,
        meta: { title: 'admin.actor.title', admin: true },
      },
      {
        path: 'terms',
        name: 'admin-terms',
        component: () => import('@/views/admin/TermsView.vue'),
        meta: { title: 'adminSetup.terms.title', admin: true },
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
        meta: { title: 'adminSetup.presets.title', admin: true },
      },
      {
        // The school's agent runtime: its AI plan and OCR. Its own administrators are among these.
        path: 'runtime',
        name: 'admin-runtime',
        component: () => import('@/views/admin/RuntimeAdminView.vue'),
        meta: { title: 'runtimeAdmin.title', admin: true },
      },
    ],
  },
]
export default routes
