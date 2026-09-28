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
  | 'agent_delegate'
  | 'conversation_ask'
  | 'conversation_answer'
  | 'member_invite'
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
  'agent_delegate',
  'conversation_ask',
  'conversation_answer',
  'member_invite',
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
/**
 * What a delegate seat (an agent seated by its owner) never holds, whatever
 * is set on it: it brings no agents of its own. It may manage the course's
 * members, as far as its principal may, since Core ebfb632.
 */
export const DELEGATE_NEVER_PERMS: Perm[] = ['agent_delegate']

export type Role = 'student' | 'instructor' | 'ta' | 'observer' | 'assistant'
export const ROLES: Role[] = ['student', 'instructor', 'ta', 'observer', 'assistant']
export type Scope = 'all' | 'listed'
// The built-in presets, in the order Core ships them: people from least to
// most, then agents (a department's own presets have names of their own).
export type BuiltinPreset =
  | 'student'
  | 'observer'
  | 'ta'
  | 'instructor'
  | 'tutor'
  | 'grader'
  | 'delegate'
  | 'course_tutor'
export const BUILTIN_PRESETS: BuiltinPreset[] = [
  'student',
  'observer',
  'ta',
  'instructor',
  'tutor',
  'grader',
  'delegate',
  'course_tutor',
]
/**
 * The presets member.add_delegate is usually given: delegate (a person's own
 * assistant, the default) and course_tutor (a course agent students may ask).
 */
export type DelegatePreset = 'delegate' | 'course_tutor'
export const DELEGATE_PRESETS: DelegatePreset[] = ['delegate', 'course_tutor']
export type ActorKind = 'human' | 'agent' | 'system'
export type PlatformRole = 'root' | 'admin'
export type CourseStatus = 'draft' | 'active' | 'archived'
export type MemberStatus = 'active' | 'paused' | 'removed'
/** A seat's status as the conversation views report it: removed seats and expired ones told apart. */
export type SeatStatus = MemberStatus | 'expired'
/** An actor's standing on the platform (agent.list, actor.get). */
export type ActorStatus = 'active' | 'suspended'
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

// Invite links (course.join_link_*): a link as the course's list shows it, never its token.
export type JoinLink = ListItem<'course.join_link_list', 'links'>

// Departments: a tree, and who administers each (docs/schema.md §2.10)
/** A department the caller is appointed to administer (me.get): they administer everything beneath it too. */
export type Administered = ListItem<'me.get', 'administers'>
/** One department in the tree, with what the caller may do with it (department.list_tree). */
export type DepartmentNode = ListItem<'department.list_tree', 'departments'>
/** An appointment as administrator of a department, live or ended (department.list_admins). */
export type Appointment = ListItem<'department.list_admins', 'admins'>
/** The person a whole email belongs to, as actor.lookup_by_email says of them. */
export type ActorLookup = ToolOut<'actor.lookup_by_email'>

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

// Agents a person owns (agent.*), and their seats as delegates
export type AgentSummary = ListItem<'agent.list', 'agents'>
export type AgentFull = ToolOut<'agent.get'>
/** One of an agent's seats: a delegate seat, whose principal is its owner's seat there. */
export type AgentSeat = ListItem<'agent.get', 'seats'>
/** A member.add_delegate proposal naming the agent, waiting for a decision (withdraw with action.withdraw). */
export type AgentRequest = ListItem<'agent.get', 'requests'>
export type AgentCredential = ListItem<'agent.list_credentials', 'credentials'>
export type AgentToken = ToolOut<'agent.issue_token'>
/** What member.add_delegate would seat an agent with, and the level the call would run at. */
export type DelegateDefaults = ToolOut<'member.delegate_defaults'>
/** The caller's seat in a course, as me.memberships reports it: perms are effective (after any delegate caps). */
export type MembershipPerms = Membership['perms']

// Conversations (conversation.*)
export type ConversationState = 'awaiting_answer' | 'reply_pending_approval' | 'answered' | 'closed'
export const CONVERSATION_STATES: ConversationState[] = ['awaiting_answer', 'reply_pending_approval', 'answered', 'closed']
export type ConversationStatus = 'open' | 'closed'
/** conversation.list's `as`: which of the caller's conversations to list. */
export type ConversationRole = 'opener' | 'respondent' | 'overseer'
/**
 * closed_reason is either what the closer wrote (free text, shown as it is)
 * or this code, set when a participant's seat was removed.
 */
export const CLOSED_SEAT_REMOVED = 'seat_removed'
/** A conversation as every conversation tool returns it, without its messages. */
export type ConversationView = ListItem<'conversation.list', 'conversations'>
/** conversation.get: the view, and who can read it (visible_to, as codes: participants, overseers, action_record, respondent_answers_others). */
export type ConversationDetail = ToolOut<'conversation.get'>
export type ConversationOpener = ConversationView['opener']
/** The respondent as a conversation shows it: presence, answer level, whose agent it is. */
export type ConversationRespondent = ConversationView['respondent']
/** A message: ordered and paged by seq (after_seq / before_seq), never by id. */
export type ConversationMessage = ListItem<'conversation.messages', 'messages'>
export type MessageRetraction = NonNullable<ConversationMessage['retracted']>
export type ConversationMessagesPage = ToolOut<'conversation.messages'>
/** Someone the caller may open a conversation with (conversation.respondents). */
export type Respondent = ListItem<'conversation.respondents', 'respondents'>
/** A conversation waiting for the caller's answer (conversation.inbox). */
export type InboxItem = ListItem<'conversation.inbox', 'conversations'>

/** A decimal as Core sends it: a JSON number, or a string where exactness matters. */
export type Decimal = number | string
