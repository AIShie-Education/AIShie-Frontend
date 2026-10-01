# Notes on Core's API, from building the front end

What building a complete client of AIshie Core (at `de4f548` / `fdfcbec`) turned up: behaviour
that looks like a bug, and places where the API makes a client guess, page through everything, or
make one call per row. Each item names where in Core it comes from. None of them blocks the front
end; the "works around it" notes say what the front end does meanwhile.

## Looks like a bug

1. **`gradebook.get` ignores a student's stored final policy.** Once a student's totals have been
   written with `treat_ungraded_as_zero`, every later post and regrade keeps that policy
   (`storedPolicy`, `internal/tools/gradebook.go`), but `gradebook.get` computes a grade-so-far
   unless the caller passes the flag again (`internal/tools/grade.go`, `gradebookGet`). Its
   description says it is computed now, so this may be meant; but the live gradebook then
   disagrees with the snapshot the student was shown (demo: 40 % live against 24 % written).
   *Works around it:* reads `ungraded_as_zero` from the root snapshot's breakdown and says which
   policy is in force.
2. **`grade.get` / `grade.list` never return `posted_by_member_id`**, although `GetGradeFull` and
   `ListGrades` select it (`internal/tools/grade_read.go`). Nobody can be told who released a grade.
3. **A draft on work that already has a live posted grade is a dead end.** `grade.submit` accepts
   it (`SupersedeSubmissionDrafts` only replaces drafts), but `grade.post` then refuses it
   (`checkPostable`: "use grade.regrade"). The same for a directly graded component. Refusing at
   submit time, pointing at `grade.regrade`, would save graders — and agents — the dead end.
   *Works around it:* hides the grading form and links to regrade.
4. **An empty component makes every ancestor "incomplete" for ever.** A component with no
   assignments and no children comes back `complete=true` with a nil fraction, and its parent then
   marks itself incomplete because of the nil fraction (`internal/gradecalc`, `parent`).
5. **Unpublished assignments count for the tree's shape but not for totals.** The gradebook only
   counts published assignments (`ListGradedAssignments`), but `canHaveChildren` and assignment
   placement count every assignment, so a bucket whose assignments are all unpublished still
   refuses sub-components.
6. **A decision about a decision reports the wrong outcome.** `DecideOut.outcome` for an approval
   of a proposed decision is the outcome of the decision underneath (`executed`), not of the
   proposal it finally carried out, which is only in `result.outcome` one level down
   (`internal/pipeline/decide.go`). A client reading the top level says "approved and carried out"
   when the proposal was in fact cancelled. *Works around it:* reads one level down.
7. **A cancellation made by a decision records no decider.** `finish()` is called with
   `decidedBy` nil, so the row cannot show who tried to approve a proposal that was then
   cancelled, or when (`decide.go`); only the event's `by_action_id` has it.
8. **A grade's pinned rubric version is not readable through the grade.** `VersionPinnedInScope`
   looks only at submissions' `instructions_version_id`, so a grader without `document_read_draft`
   who follows a grade's `rubric_version_id` gets 404 once the rubric has moved on — the same
   "always read the exact version you were given" reasoning applies (`internal/tools/document.go`).
9. **Passwords are measured in bytes.** `auth.HashPassword` checks `len()`, so "10 characters or
   more" is 10 bytes, and four CJK characters pass (`internal/auth/password.go`).
10. **`member.list` declares `listed_students` / `listed_assignments` but never fills them**; only
    `member.get` does. Likewise **`grade.list` declares `feedback_files` but never fills it**.
11. **`event.list`'s `next_seq` does not move past invisible events**, although its description
    says it "moves even when the page is empty of events the caller may see": it is set only from
    returned rows (`internal/tools/event.go`). Harmless, but the description overstates it.
12. **A grant that exceeds the granter is accepted as a proposal.** With `member_manage` at
    `confirm_required`, a `member.add` / `update_perms` / `rescope` / `resume` beyond the granter's
    own seat is queued; `withinGranter` runs only at execution, so it fails when someone approves
    it. Checking at proposal time too would keep such proposals out of the queue.
13. **Downloads had no file name** (resolved in AIShie-Core #49). No name was stored for an
    uploaded file, and downloads were served `Content-Disposition: attachment` without `filename`.
    Each file of a version is named now (`files[].filename`, or the name given at
    `document.upload_url`), and downloads under it; the front end names every file it uploads.

## What a client cannot find out, or only expensively

- **A member cannot read their own permissions** unless they hold `member_read`: `member.get` on
  their own seat is refused, and `me.memberships` has role and scope but not the levels or
  `preset_id`. An agent cannot learn that its `grade_submit` is `confirm_required` until it tries,
  and the UI cannot say "this will need approval" for it. A `me.seat` read, or the levels in
  `me.memberships`, would close this for agents and people alike. *Works around it:* reads its own
  seat when allowed; otherwise guesses from the built-in preset for the role (and, for agents,
  from their scope), and remembers Core's refusals.
- **An administrator cannot read one course by id.** `course.get` needs a seat and `course.list`
  has no id filter. *Works around it:* `course.list` with `after` set to the id just before and
  `limit=1`, which depends on the list's id ordering.
- **No actor directory** (resolved). `actor.get` was admin-only with no list or search, so seating
  someone depended on an administrator passing actor ids out of band, and the front end kept a
  per-browser "seen recently" list. Core's `actor.list` (with `actor.update` and `actor.invite`)
  now lets the administration pages list and search everyone, and the list is gone; what earlier
  versions kept in a browser is still deleted at sign-out. A Core from before it answers
  `GET /v1/actors` with 405 `method_not_allowed` (the route takes POST, registering); the pages
  then say the Core needs updating and take a pasted actor ID, as before.
- **An invitation cannot be checked before it is taken up.** `POST /v1/auth/invite` is the only
  thing that reads one, and it wants the password too, so the welcome page learns that a link was
  used, replaced, withdrawn (a new email, a password set otherwise) or has expired only after the
  person has chosen a password. (A weak password is
  refused after the invitation is checked, so an empty one would tell; the page does not rely on
  that order, and each try spends the address's sign-in allowance.)
- **`event.list` only reads forward** over a platform-wide sequence, with no newest-first read and
  no head cursor, so "the latest 20 events" means searching for the head. Events also carry no
  actor, and `action.get` is for deciders (and for an agent's owner, about their own agent's actions
  alone), so anyone else can never be told who did something.
- **Lists are ordered by id and have few filters:** `document.list` ignores `sort_order` (so
  paging and reading order do not compose); `grade.list` has no state filter and is oldest-first
  (finding the drafts to post means paging through everything); `action.list_mine` has no status,
  type or target filter; `preset.list` gives one department at a time.
- **A proposer cannot fetch its own proposal by id** (`action.get` needs `action_decide`, or owning
  the agent that made it); it must page through `action.list_mine`. Likewise a student can see `created_by_action_id` on
  their grade but not open it — though schema.md calls it "the whole query" for a disputed mark.
- **Pending proposals are invisible to non-deciders**, so a TA can enter a draft while an agent's
  proposal for the same work waits, and learns only at approval that it failed ("a newer draft
  was entered").
- **A conversation does not say whether its agent takes conversations in the site.** Its respondent
  (`conversation.get`, `.list`) has no `site_chat`, and a student may not read `member.get`. *Works
  around it:* the opener's pane asks `conversation.respondents`, which leaves such an agent out; but
  it also leaves out one the opener may no longer address (its seat rescoped, its owner no longer
  managing the members), and such an agent is then said to be operated from outside too. `site_chat`
  on the conversation's respondent would settle it.
- **The caller's conversations were listed one course at a time, oldest first** (resolved). The
  chat panel's history called `conversation.list` (as opener) once per course, several at once and
  at most 20 courses, reading each course's pages to the end, and said which courses it could not
  read or read whole. Core's `me.conversations` (since `1bcb5ef`) lists the caller's own in every
  course, newest activity first, a page at a time, with each one's course and agent, or one
  course's with `course_id`; the history is that list, and the fan-out is gone.
- **Nothing said which answers the caller had read** (resolved). This browser kept, for each caller,
  when they last had each conversation on screen and which of their questions waited for an answer,
  and read those again (`conversation.get`) every 30 seconds. Core now keeps a read marker for each
  of the two taking part (`conversation.mark_read`), and says `unread` on `conversation.list`,
  `conversation.get` and `me.conversations`. The chat marks a conversation read while it is on
  screen, and counts what is unread on its button from the first page of `me.conversations`, read
  again every 30 seconds while the page is shown: the same on every device. What earlier versions
  kept in a browser is deleted when the caller goes. Nothing is pushed, and Core has no read that
  waits for news across a person's courses, so that count is up to half a minute behind; a
  conversation on screen is not (below).
- **A conversation could only be polled** (resolved). The pane read `conversation.messages` after
  the last seq it held every 3 seconds while an answer was awaited, and every 10, then 30 seconds
  once it had been answered and nothing came, so an answer showed up to 3 seconds after it was
  written. Core (since `2c1fe1b`) lets `conversation.messages`, `conversation.inbox` and
  `event.list` wait for news: with `wait_s` (up to 25 seconds), a read that finds nothing new
  waits until something it would read is committed, and answers within milliseconds of it.
  `conversation.messages` waits only with `after_seq` (never with `before_seq`), for a message
  after it, a retraction, or a change of state; `seen_state`, the state its reader holds, makes it
  answer at once when the conversation is in another. The pane on screen now keeps one such read
  waiting (`wait_s: 25`, `seen_state`, a client limit of 40 seconds) and makes the next as soon as
  it answers; it cuts it short (the fetch aborted) when the pane goes off screen or away, the page
  is hidden, or the caller writes, and after a pause reads at once before waiting again. An answer
  shows within some tens of milliseconds of the agent writing it. *Where Core does not wait:* past
  its bounds (16 reads waiting for one actor, 1000 in a server) or shutting down, a read answers
  at once with nothing; one that comes back with nothing in under half its wait is taken for that,
  and the pane reads on the old schedule for a minute before it asks to wait again. A Core from
  before `wait_s` refuses it (`invalid_argument`, as it refuses any argument it does not know,
  naming it), and the pane reads on the old schedule then too, rather than failing.
- **An answer showed only once it was posted** (resolved where Core keeps drafts). A Core with
  `conversation.draft` (an ephemeral write, `kind: "ephemeral"` in its catalogue, which only the
  conversation's agent makes and nothing records) keeps one draft per conversation while its agent
  writes the answer, and `conversation.messages` and `conversation.get` carry it as `draft`, null
  or the steps and, where the reader may see it, the text so far (`text_hidden` where the answer
  waits for someone's confirmation). The pane takes it from every read, and once a read has
  carried the field, the read that waits names the version it holds (`seen_draft_version`, 0 for
  none): without it Core wakes no wait for a draft. It shows the draft while an answer is awaited
  (`ChatDraft`); the read that brings the posted answer carries no draft. A Core without drafts
  sends no `draft` and is never asked about one; one that refused `seen_draft_version` would be
  read on the old schedule, as for `wait_s`.
- **`conversation.respondents` offered people, and `conversation.open` accepted them** (resolved).
  Core lists agents alone now, refuses a person as a respondent, or answering, as
  `conversations_are_with_agents`, caps a person's `conversation_answer` at denied for that reason,
  and closed every conversation from before with a person, with that reason. The front end no
  longer leaves people out itself (`agentsOnly` is gone), shows such a conversation as closed and
  why, and leaves it out of the history, as before.
- **An agent's conversations could not be listed by agent** (resolved). The course's *Agents* page
  read every conversation the caller oversees and kept those with the agent; `conversation.list`
  takes `respondent_member_id` now, and the page asks for that agent's alone.
- **`me.get` does not say which credential the caller used**, so the account page cannot mark
  "this browser's session" among the sessions it lists.
- **Summaries lack "has unpublished changes":** no latest version on `document.list` /
  `document.get` for writers.
- **`breakdown` has two shapes typed as one:** `[{criterion, points, max, comment}]` on entered
  grades, and gradecalc's working (`fraction`, `complete`, `items`, `ungraded_as_zero`) on
  computed ones; the catalogue says neither.
- **Refusal reasons are free text** for execution-time checks (grant limits, scope, expiry), so a
  client explaining them has to match messages. Denials carry `details.reason`; these do not.
  Denied actions also have no `target_id` (steps 1–3 fail before the target is resolved).

## Missing operations

- `document.update` (rename, reorder) and un-archiving; `document.create` has no `publish` flag
  (so create-and-publish is two approvals under `confirm_required`).
- Detaching instructions or a rubric from an assignment (`assignment.update` has `clear_due_at` and
  `clear_component`, but no `clear_instructions` / `clear_rubric`).
- Updating a term or a department (a typo is permanent), deleting a grading component.
- Seating a member with a role and explicit permissions and no preset (`member.add` requires
  exactly one of `preset` / `preset_id`).

## Design questions worth a second look

- The built-in `grader` preset has `grade_read` denied, so a grading agent cannot see the grade
  its approved proposal became, or whether the work already has a draft or a posted grade.
- `course.archive` / `course.activate` are platform-only, so an instructor cannot archive their own
  course; `course.update` is refused on an archived course (only activate and archive work there).
- `credential.revoke` works on the caller's password and SSO link too; an SSO link revoked by
  mistake can only be restored by an administrator.
