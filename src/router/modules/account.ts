import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: 'account',
    name: 'account',
    component: () => import('@/views/account/AccountView.vue'),
    meta: { title: 'account.title' },
  },
  {
    // The agents the caller owns: create, tokens, presence, the courses each is seated in.
    path: 'account/agents',
    name: 'account-agents',
    component: () => import('@/views/account/AgentsView.vue'),
    meta: { title: 'agents.title' },
  },
  {
    path: 'account/agents/:actorId',
    name: 'account-agent',
    component: () => import('@/views/account/AgentView.vue'),
    props: true,
    meta: { title: 'agents.detail.title' },
  },
]
export default routes
