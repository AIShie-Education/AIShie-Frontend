// The rubric a grader is shown beside the work, and what the grade records of
// it. grade.submit records the rubric version the grader was shown: the
// published one, since that is the one in force. A reader who may see drafts
// is handed the latest version by document.get, so the published one is then
// asked for by id.
import { read } from '@/api/http'
import type { Assignment, DocumentFull, ToolIn } from '@/api/types'

export type RubricState =
  /** The assignment could not be read, so neither can its rubric be found. */
  | { status: 'unknown' }
  /** The assignment has no rubric. */
  | { status: 'none' }
  /** The caller may not read rubrics: the grade records the published one, unseen. */
  | { status: 'hidden' }
  /** There is a rubric, and nothing of it is published: the grade records none. */
  | { status: 'unpublished'; doc: DocumentFull }
  /** The published version, which the grade records. */
  | { status: 'published'; doc: DocumentFull; versionId: string }

export async function loadRubric(
  courseId: string,
  assignment: Assignment | undefined,
  mayRead: boolean,
): Promise<RubricState> {
  if (!assignment) return { status: 'unknown' }
  const documentId = assignment.rubric_document_id
  if (!documentId) return { status: 'none' }
  if (!mayRead) return { status: 'hidden' }
  let doc = await read('document.get', { course_id: courseId, document_id: documentId })
  const published = doc.published_version_id
  if (!published) return { status: 'unpublished', doc }
  if (doc.version?.id !== published) {
    doc = await read('document.get', { course_id: courseId, document_id: documentId, version_id: published })
  }
  return { status: 'published', doc, versionId: published }
}

/**
 * What grade.submit is told about the rubric: the version shown, or that
 * none is in force. When the rubric could not be seen, neither: Core then
 * records whichever version is published.
 */
export function rubricArgs(
  state: RubricState | undefined,
): Pick<ToolIn<'grade.submit'>, 'rubric_version_id' | 'no_rubric'> {
  switch (state?.status) {
    case 'published':
      return { rubric_version_id: state.versionId }
    case 'none':
    case 'unpublished':
      return { no_rubric: true }
    default:
      return {}
  }
}
