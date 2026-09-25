// Names for the shapes the views pass around, taken from the generated tool
// types so that they cannot drift from Core's catalogue.

import type { ToolName } from './generated/tools'
import type { ToolIn, ToolOut } from './http'

export type { ToolIn, ToolOut }

type Elem<T> = T extends readonly (infer U)[] ? U : never
/** One element of a list a tool returns, e.g. ListItem<'member.list', 'members'>. */
export type ListItem<N extends ToolName, K extends keyof ToolOut<N>> = Elem<NonNullable<ToolOut<N>[K]>>

// Autonomy: one ladder that is both permission and autonomy.
export type AutonomyLevel = 'denied' | 'confirm_required' | 'pending_review' | 'autonomous'
export const AUTONOMY_LEVELS: AutonomyLevel[] = ['denied', 'confirm_required', 'pending_review', 'autonomous']

// The permission catalogue, in the schema's column order.
export type Perm =
  | 'document_read'
  | 'document_read_draft'
  | 'document_write'
  | 'rubric_read'
  | 'assignment_write'
  | 'submission_read'
  | 'submission_write'
  | 'grade_read'
  | 'grade_submit'
  | 'grade_post'
  | 'member_read'
  | 'member_manage'
  | 'action_decide'
export const PERMS: Perm[] = [
  'document_read',
  'document_read_draft',
  'document_write',
  'rubric_read',
  'assignment_write',
  'submission_read',
  'submission_write',
  'grade_read',
  'grade_submit',
  'grade_post',
  'member_read',
  'member_manage',
  'action_decide',
]
/** Permissions whose reach is narrowed by a member's student and assignment scope. */
export const SCOPED_PERMS: Perm[] = [
  'submission_read',
  'submission_write',
  'grade_read',
  'grade_submit',
  'grade_post',
]
export type PermLevels = Partial<Record<Perm, AutonomyLevel>>

export type Role = 'student' | 'instructor' | 'ta' | 'observer' | 'assistant'
export const ROLES: Role[] = ['student', 'instructor', 'ta', 'observer', 'assistant']
export type Scope = 'all' | 'listed'
export type ActorKind = 'human' | 'agent' | 'system'
export type PlatformRole = 'root' | 'admin'
export type CourseStatus = 'draft' | 'active' | 'archived'
export type MemberStatus = 'active' | 'paused' | 'removed'
export type DocumentKind = 'material' | 'instructions' | 'rubric' | 'submission' | 'feedback'
export type SubmissionState = 'draft' | 'submitted' | 'late' | 'missing'

// Platform
export type Me = ToolOut<'me.get'>
export type Membership = ListItem<'me.memberships', 'memberships'>
export type Credential = ListItem<'credential.list', 'credentials'>
export type Actor = ToolOut<'actor.get'>
export type Term = ListItem<'term.list', 'terms'>
export type Department = ListItem<'department.list', 'departments'>
export type Preset = ListItem<'preset.list', 'presets'>

// A course
export type Course = ToolOut<'course.get'>
export type Member = ToolOut<'member.get'>
export type MemberSummary = ListItem<'member.list', 'members'>
export type Component = ListItem<'component.tree', 'components'>
export type Assignment = ToolOut<'assignment.get'>
export type AssignmentSummary = ListItem<'assignment.list', 'assignments'>
export type DocumentFull = ToolOut<'document.get'>
export type DocumentSummary = ListItem<'document.list', 'documents'>
export type DocumentVersion = ListItem<'document.versions', 'versions'>
export type Submission = ToolOut<'submission.get'>
export type SubmissionSummary = ListItem<'submission.list', 'submissions'>
export type Grade = ToolOut<'grade.get'>
export type GradeSummary = ListItem<'grade.list', 'grades'>
export type Gradebook = ToolOut<'gradebook.get'>
export type GradebookLine = ListItem<'gradebook.get', 'components'>
export type ActionFull = ToolOut<'action.get'>
export type ActionSummary = ListItem<'action.list_proposed', 'actions'>
export type CourseEvent = ListItem<'event.list', 'events'>

/** A decimal as Core sends it: a JSON number, or a string where exactness matters. */
export type Decimal = number | string
