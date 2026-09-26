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

/**
 * A choice of the document `id` (or of none). A new document is published at
 * once by default when it is instructions, which students read once the
 * assignment is published; not when it is a rubric, which the built-in
 * student preset cannot read anyway, so that publishing one is a choice.
 */
export function emptyDocChoice(kind: 'instructions' | 'rubric', id?: string | null): DocChoice {
  return {
    mode: id ? 'existing' : 'none',
    id: id ?? undefined,
    title: '',
    body: '',
    files: [],
    publish: kind === 'instructions',
  }
}
