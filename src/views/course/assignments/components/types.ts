import type { UploadedFile } from '@/api/http'

/**
 * Which instructions (or rubric) document an assignment points at: none, one
 * that exists, or a new one written in the form and created when it is saved.
 */
export interface DocChoice {
  mode: 'none' | 'existing' | 'new'
  id?: string
  title: string
  body: string
  files: UploadedFile[]
  /** Publish the new document's first version at once. */
  publish: boolean
}

export function emptyDocChoice(id?: string | null): DocChoice {
  return { mode: id ? 'existing' : 'none', id: id ?? undefined, title: '', body: '', files: [], publish: true }
}
