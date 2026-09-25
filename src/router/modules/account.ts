import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'account',
    name: 'account',
    component: () => import('@/views/account/AccountView.vue'),
    meta: { title: 'account.title' },
  },
]
export default routes
