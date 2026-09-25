/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where Core is, when it is not this origin (e.g. https://core.example.edu). Empty: same origin. */
  readonly VITE_API_BASE?: string
  /** Core's PUBLIC_URL, when it is not where the app is served; shown as the MCP endpoint. */
  readonly VITE_CORE_PUBLIC_URL?: string
  /** "true" shows the single sign-on button (Core must have OIDC_ISSUER set). */
  readonly VITE_SSO_ENABLED?: string
  /** The label on the single sign-on button, e.g. "PolyU NetID". */
  readonly VITE_SSO_LABEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}
