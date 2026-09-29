# Front-end conventions

How this app is put together, and the rules every view follows. Read
[AIShiteru Core's concepts](https://github.com/AIShie-Education/AIShie-Core/blob/main/docs/aishiteru-core-concepts.md)
and [schema](https://github.com/AIShie-Education/AIShie-Core/blob/main/docs/schema.md) first: this app is
one client of Core's tool layer, the same one agents call over MCP, and it has no logic of its own
about who may do what.

## Stack

Vue 3 (`<script setup lang="ts">`, Composition API only), Vite, TypeScript (strict), Vue Router,
Pinia (setup stores), vue-i18n (composition mode), Element Plus (registered globally, icons
registered globally by their component names: `<el-icon><Edit /></el-icon>`), dayjs,
markdown-it + DOMPurify.

## Talking to Core

- **Types are generated.** `src/api/generated/tools.ts` is generated from Core's catalogue
  (`api/catalogue.json`, a snapshot of `GET /v1/tools`) by `npm run gen:api`. Never edit it. Every
  tool has `<Name>In` / `<Name>Out` types (`grade.submit` → `GradeSubmitIn`, `GradeSubmitOut`). Named
  shapes for views are in `src/api/types.ts` (`Course`, `Member`, `Assignment`, `Grade`, …) and
  `ToolIn<'name'>`, `ToolOut<'name'>`, `ListItem<'name', 'field'>` give any other.
- **Reads**: `read('assignment.list', { course_id, limit, after })` from `@/api/http` returns the
  tool's result or throws `ApiError`. In components prefer `useAsync` / `usePaged` from
  `@/composables/useAsync`, which keep `data/items`, `loading`, `error`, `reload`.
- **Writes**: in components, always `useWrite('tool.name')` from `@/composables/useWrite`:
  `const { run, pending } = useWrite('assignment.create')`, `const out = await run(args, { success: t('…') })`.
  It keeps one idempotency key per intended action (so retrying after a network error can never do
  the thing twice), shows the outcome to the person, and resolves to:
  - `{ status: 'executed', result, actionId, reviewState }` — done. `reviewState === 'pending'` means
    it will be reviewed after the fact (useWrite says so).
  - `{ status: 'proposed', actionId }` — **not an error and not done**: the seat's level for this is
    `confirm_required`, and the call now waits for someone to approve it. There is no `result`.
    Never assume a created id exists after a proposal; close the dialog, reload, and let the person
    see it in "My actions" (`course-my-actions`).
  - `null` — denied, failed, or never attempted; already shown to the person.

  A page with words of its own for Core's refusals by reason (`details.reason`) keeps them in a tree
  of its namespace and names it: `run(args, { reasons: 'grades.override.refusal' })`, and
  `errorMessage(e, { reasons })` or `<RefusalAlert :reasons>` where it says them itself. Scopes are
  asked first, so a reason two tools share (`not_a_person`) is said in the words of the page that
  met it.
- Use `write()` directly only outside components. Never call `fetch` yourself.
- **Files**: bytes never go through a tool. `<FileUploader v-model="files" v-model:uploading="busy" :course-id :kind multiple />`
  uploads each picked file (`busy` is true while any is in flight: disable the submit button with it) (`document.upload_url` → PUT) and gives `UploadedFile[]`; hand each
  `uploadToken` to the tool that attaches it (`document.create`/`add_version` `upload_token`,
  `grade.submit` `feedback_files`, …). A submission's files are attached with `document.create`
  (`kind: 'submission'`, `submission_id`, `upload_token`) while it is a draft; `submission.submit` then
  takes the list of their document ids as a guard. To download, use
  `<DocumentFileLink :course-id :document-id :title />`, which fetches a fresh short-lived URL on click
  and saves the file under the document's title (or `file-name`), with its type's extension.
- **Lists page by cursor**: `{ limit, after }` in, `{ items, next }` out; `next` absent on the last
  page. `usePaged(after => read(...).then(o => ({ items: o.assignments, next: o.next })))` and
  `<LoadMore :has-more :loading @more="loadMore" />`.
- **Go `nil` slices arrive as `null`.** Every array in a result may be `null`: write `x ?? []`.
- **Decimals** (scores, points, weights) arrive as JSON numbers and may be sent as numbers or
  strings. Keep form fields for them as strings (`el-input`, validated with `isDecimal` from
  `@/utils/format`) and send the string; show them with `formatDecimal`. Do not use
  `el-input-number` for scores (it rounds and floats).
- **Timestamps** are RFC 3339 strings. Show with `<TimeText :value />` (absolute, relative on hover,
  or `relative`). Send with `dayjs(x).toISOString()`; date-only fields (term `starts_on`) as
  `YYYY-MM-DD`.
- Optional fields: omit them (`undefined`) rather than sending `null`, unless the tool says `null`
  means something. Some updates have explicit `clear_*` flags (`clear_due_at`, `clear_component`,
  `clear_points_possible`, `clear_expiry`): use those to unset.

## Talking to the agent runtime

The pages that host a person's agent on the school's runtime call its API, under `/runtime/api/v1`
on this origin, through `@/api/runtime`; never `fetch` it yourself either.

- **Show hosting only where there is a runtime.** `useRuntime()` from `@/composables/useRuntime`
  gives `available`, `info`, `error`, `checked` and `refresh`, from one `GET /info` per page load.
  Until `checked`, show neither the feature nor its absence. `info.features` are booleans the runtime
  works out as it starts (`connect_by_token`, `own_key`, `school_key`): offer what each names only
  while it is true.
- **Calls**: the contract's own, `runtime.me()`, `.models()`, `.testKey(req)`, `.inspect(req)`,
  `.connect(req)`, `.list()`, `.get(id)`, `.update(id, version, patch)`, `.replaceToken(id, token)`,
  `.pause(id)`, `.resume(id)`, `.remove(id, revokeToken)`, each resolving `{ data, etag, status,
  replayed }`. Each goes as the person signed in, with an assertion Core makes for them; the client
  asks for it, keeps it in memory, and asks again as it needs. The runtime reads no idempotency key:
  the client sends again what the runtime answers once however often it is sent, and never a PATCH
  or a key test. `update` names the version it read; the other writes name none, but any of them may
  still answer 412: `isVersionMismatch(e)` says the agent changed since, so read it again and say so,
  keeping what the person typed.
- `inspect` and `connect` answer the agent's other live tokens (`other_tokens`, null when Core would
  not list them): warn with `OtherTokensNotice` when one is in use, and never refuse or revoke for
  the owner. A token the runtime could not revoke (`revocation: 'failed'`) may still work: tell the
  owner and offer to revoke it as them (`UnrevokedTokenNotice`).
- Errors are `RuntimeError` (an `ApiError`) with the runtime's `reason`; choose the words by reason
  (`hostingErrorText` in the agents' components). A 401 from the runtime is not a lapsed session
  (the client has already tried a new assertion): say the runtime refused, not that the person was
  signed out. A lapsed session shows as Core's 401 when the assertion is asked for, and the app
  handles it.
- Never keep an agent token or a model key in reactive state, storage, a log or an error: a token
  the page issues for the runtime lives in one local variable until the runtime has it.
- The runtime's route and field names live in `src/api/runtime.ts` (`RUNTIME_ROUTES`) and
  `src/api/runtime-types.ts`, and nowhere else.

## Permissions in the UI

`useCourseStore()` (`@/stores/course`) holds the open course (`course`), the caller's seat
(`membership`, `myMemberId`, `role`; `principalMemberId` / `isDelegate` when the caller is an agent
seated as someone's delegate) and `perms`. `me.memberships` gives each seat's effective levels (its
own, capped by its principal's for a delegate; all denied while the seat does not count), so `perms`
is exact; against a Core from before that field it is read from the seat (with `member_read`),
guessed from the built-in preset for the role, or unknown (`permsSource`). Therefore:

- `course.can(perm)` decides what to **offer** (show a button, a tab). Unknown counts as yes.
  Core decides what is **allowed**; its refusal is shown by `useWrite`/`AsyncState`.
- A tool gated by several permissions runs at the lowest of them: `course.levelOfAll([...])`,
  `course.canAll([...])`, `course.needsApprovalAll([...])` (regrading is `grade_submit` and
  `grade_post`). `course.seesAllGrades` says whether the caller certainly sees every grade, drafts
  included (exact permissions, a grading permission, and both scopes `all`).
- Where a seat's permissions are guessed (an older Core), they are guessed for agents too: an
  `assistant` listed to assignments is taken for the built-in `grader`, one listed to students for
  `tutor`; a delegate seat (one with a principal) is never guessed. A refusal Core has already given
  (reading one's own seat needs `member_read`) is remembered in `course.refused`, and
  `ensureMembers()` does not ask again when the answer is sure to be no.
- `course.needsApproval(perm)` → the action will become a proposal. Say so next to the button
  (e.g. an `el-tag` "Needs approval" / `t('enums.level.confirm_required')`).
- **An agent's owner decides what it did** where they could have done it themselves without
  anyone's confirmation, whatever they hold of `action_decide` (Core's `by_owner`), and takes back
  its proposals (`action.withdraw`). A person without `action_decide` who owns an agent seated in the
  course is shown their own agents' actions in the queues and by `action.get`, and nobody else's:
  `course.ownsAgentHere` says so (asked of the queue, whose gate is that rule), and the approvals tab
  is offered to them as their agents' proposals. The queues mark each action `yours_to_decide`;
  `useJudgeRules()` (`isOwnAgent`, `byOwner`, `block`) says why one is not the caller's, and a
  queue Core will not show is simply empty. `owner_not_autonomous` is put in words by
  `errorMessage()`.
- **Offer only what may be chosen.** Every view of a seat (`member.get`, `member.list`,
  `me.memberships`, `member.delegate_defaults`) says its ceilings: the most it may hold of each
  permission whoever grants it (`perm_ceilings`), and why where that is below autonomous
  (`perm_ceiling_reasons`: `agent_never`, `agent_decides_by_proposal`,
  `student_agent_by_proposal`, `principal_level`). Give every permission editor the seat's
  `ceilingsOf(seat)` (`@/utils/ceilings`): `<PermEditor :ceilings>` and `<LevelSelect :ceiling
  :ceiling-note>` grey out the levels above a ceiling, each with the reason in the reader's words
  (`ceilingNote`), and lock a permission capped at denied. Where there is no seat to ask (a
  preset, a change to every seat of a role), send and let Core refuse: `errorMessage()` and
  `<RefusalAlert>` put its refusal in words ("{permission} can be at most {ceiling} here,
  because …", `ceilingRefusalText`).
- `course.writable` is false in an archived course: disable every write control there. (Purging a
  document, an administrator's, is the one write offered there too.)
- What only an administrator of the course does from inside it (purging what was uploaded by
  mistake) is offered by `useAdministersCourse()` (`@/composables/useAdministersCourse`): a platform
  administrator, or one of the course's department or one above it.
- Reads that are refused (403) are shown by `<AsyncState>` as "no permission", not as a failure.
- Permission names and which tool needs which are in Core's `docs/schema.md` §2.2. A few borrow:
  the grading scheme is written with `assignment_write` and read with `grade_read`; reading the
  course, assignments, the event feed and your own actions needs `document_read`; correcting
  lateness needs `grade_submit`; regrading needs `grade_submit` and `grade_post`.
- Show names, not ids: `<MemberName :id />` (uses the member list when readable, "You" for the
  caller), `course.assignmentTitle(id)` after `course.ensureAssignments()`. Use `<IdText :id />`
  where an id is all there is. After adding/removing members or assignments call
  `course.invalidate('members' | 'assignments')`.
- People sign in with a password, single sign-on or an invitation, and the browser calls Core with
  its session cookie alone: nothing in it sends a bearer token to Core. API tokens are for agents
  only, which do not use the app. Offer a person none: no sign-in by token, and no token to issue on
  the Account page or a person's administration page (an agent's page and *My agents* issue them).
  A token a person still holds, made before, is listed only to be revoked, and says so.
- Everything held is the caller's. Signing out (or Core ending the session) closes the course store,
  and the next sign-in in the same tab loads the page afresh, so caches a view keeps at module level
  never outlive the caller they were filled for.
- Someone signed in with a password someone else set (a temporary one, `member.reset_password`) may
  do nothing but set their own until they have: Core says so at sign-in (`password_change_required`)
  or refuses any other call with 403 and that reason. `http.ts` tells whoever listens
  (`onPasswordChangeRequired`); the session is then `mustChangePassword`, and the router takes every
  page to `/change-password?next=…`, which offers setting it and signing out alone. No view handles
  that refusal itself.
- A person's sign-in name is their email or their login ID (a student or staff number, 1–64 of
  `[0-9A-Za-z._-]`, never an @: `@/utils/loginId`). Where a whole one is looked up, an @ tells them
  apart; show `login_id` beside the email wherever a person's email is shown to those who manage
  them, and `login_id_verified: false` (typed by the person, registering through a link) as
  unverified.

## Building a view

- Every page starts with `<PageHeader :title :subtitle :back>` with its primary actions in the
  default slot, then content in `.app-card` sections (`.app-card__title` for a section heading).
  Actions that are all `v-if`'d away leave no empty row.
- A page inside a course whose route does not say which tab it belongs to calls
  `useCourseTab(() => routeName)` (`@/composables/useCourseTab`) with the route whose tab to highlight
  (a document that is an assignment's instructions → `'course-assignments'`). A page that is another
  page for some callers names itself in the header and the browser's tab with
  `usePageTitle(routeName, () => key)` (`@/router/title`): the approval queue, for someone who decides
  nothing there, is their agents' proposals.
- Wrap anything loaded in `<AsyncState :loading :error :empty @retry="reload">`.
- Tags for Core's vocabularies: `<StatusTag vocab="submissionState" :value="s.state" />` — see
  `StatusTag.vue` for the list; labels come from `enums.<vocab>.<value>`.
- Markdown: `<MarkdownView :source />` to show, `<MarkdownEditor v-model />` to write. Never use
  `v-html` with anything else. Images load only from this origin (or inline `data:`); one from
  elsewhere is shown as a link to it, so a text cannot tell another host who read it.
- Forms: `el-form` with `label-position="top"` and rules; dialogs with `el-dialog` (`width="560px"`,
  `destroy-on-close`; a global rule keeps every dialog within a phone's width), the submit button
  bound to `pending` from `useWrite`. Confirm destructive or
  irreversible actions with `ElMessageBox.confirm`.
- Tables: `el-table` with `:data`, `row-key`, `@row-click` to navigate where rows are things; keep a
  mobile width in mind (`min-width` on columns, not fixed widths everywhere).
- Link with route **names** and params: `{ name: 'course-assignment', params: { courseId, assignmentId } }`.
  Route names are in `src/router/modules/*.ts`; views receive route params as props.
- Views are responsive down to phone width, and work in light and dark (use Element Plus CSS
  variables, never hard-coded colours). `useNarrow()` / `useMediaQuery()` from
  `@/composables/useMediaQuery` switch a wide table to cards on a phone.
- A page's two columns follow the page's own width, not the window's, since the side bar and the
  chat panel take from it: the view's root is an inline-size container (`container-type:
  inline-size`), and an `@container (max-width: …)` stacks the columns where the main one would be
  left less than about 420 px (the overview at 800 px of page, an assignment at 740). A dialog's
  breakpoints, and a phone's (640 px and narrower), stay `@media` queries on the window. Columns of
  cards use the shared `.app-columns` (the grid) and `.app-column` (a stack of cards, 16 px apart)
  from `styles/main.css`: side by side, both columns are as tall as their row and the last card of
  each grows to fill it, so that they end on one line, with what each card holds at its top;
  stacked, nothing grows. Leave `align-items` off such a grid, or it wins over `.app-columns`.
- Short ids: `shortId(id)` / `<IdText>` show the *end* of an id. Core's ids are UUIDv7, whose
  first characters are a timestamp shared by everything made in the same moment.
- `<MemberSelect :statuses="['active', 'paused']">` for lists Core takes paused members in;
  `<PermEditor :changed :warn>` marks rows; `<DocumentFileLink>` takes its link text in the default
  slot; `MCP_ENDPOINT` (`@/api/http`) is where an agent connects.
- Agents: `<AgentBadge :kind :owner-name :mine />` beside an actor's or member's name ("Agent",
  "Your agent", "Yuki's agent"; nothing for a person); `<PresenceText :value="last_seen_at" />` for
  whether an agent is connected (never / online within two minutes / last seen). `seatPurpose()`
  (`@/utils/agents`) tells a course agent from a personal assistant by the seat's `answers_course`;
  `delegateArgsFor()` gives `member.add_delegate` both the preset and `answers_course`, always said
  outright.
- An agent takes conversations in the site only while whatever runs it says so (`me.site_chat`, as
  AIShie's runtime does); one operated from an external tool (Claude through MCP) never does, and has
  no chat box anywhere. Where Core says `site_chat: false` (`agent.get`/`.list`, an agent's seat in
  `member.get`/`.list`), offer nothing to ask it and say why: `common.agent.external` ("Operated from
  outside") and `common.agent.externalNote`, with `common.agent.hostedTakesChat` for its owner.
  `conversation.respondents` leaves such agents out, and a conversation's opener learns from it
  (`offeredIn`) whether its agent may still be asked; Core refuses a question to one as
  `agent_answers_elsewhere`, which `errorMessage()` says in the same words.
- The left of every signed-in page is laid out as an editor's: an activity bar along the window's edge
  (`src/components/sidebar/ActivityBar.vue`, mounted by `AppLayout`), with the brand's mark and a button
  for each view the caller is offered (their courses; their agents, for a person; administration, for
  whoever may open its pages), and beside it the side bar (`SideBar.vue`) showing the one chosen, at a
  fixed 260 px, with no edge to resize it by. A view's button, pressed again, collapses the side bar.
  Going to a page of a view (a course's pages, `/account/agents…`, `/admin…`) shows that view, and never
  opens a collapsed side bar. `useSideBarStore()` (`@/stores/sidebar`) holds the view and whether it is
  open, which this browser remembers. A new view is a `SideView` in `components/sidebar/frame.ts` (its
  icon, its name, whose it is, the path of its pages) and a component for its body. On a phone there is
  no activity bar: the header's menu button opens the views in a drawer, as tabs along its top, and
  following a link in it closes it.
- The chat with agents is one panel beside every signed-in page (`src/components/chat/ChatPanel.vue`,
  mounted by `AppLayout`), not a page of a course: every conversation in it is in a course and with an
  agent. Its button is on the rail along the window's right edge, as an editor's activity bar is,
  where any other side panel's would go too (the header holds only the language, the theme and the
  account); the panel opens between the page and the rail, and Ctrl/⌘+J opens and closes it. It is
  380 px wide (`PANEL_DEFAULT`) until its left edge is dragged, or moved with the arrow keys (a
  separator), from 320 px up to half the window, and never so wide that the page is left less than
  420 px (`panelMax`); a double click on the edge goes back to 380. The page reflows as it is
  dragged, its container queries following; the width is set once a frame, nothing on the page is
  selected meanwhile, and it is kept (with whether it is open, in this browser) once the edge is
  let go. In a window narrower than 1200 px (`PANEL_DOCKED_MIN_WIDTH`), where docking it would
  leave the page too little beside the activity bar and the side bar, it floats over the page
  instead, against the rail and under the header, with a shadow cast to the left (`--app-z-panel`,
  `--app-shadow-side`), and the page keeps its width; its edge drags there too, up to 70 % of the
  window. The side bar on the left stays 260 px. On a phone there is no rail: the button floats at
  the bottom right, the page keeps room below its last item for it, it stays under everything
  Element Plus lays over the page (the layers are in `styles/tokens.css`), and the sheet has no
  edge to drag. `useChatStore()` (`@/stores/chat`) opens it on a conversation
  (`showConversation(courseId, id, { open: true })`) or on a course (`showCourse`); a link to a
  conversation is still `{ name: 'course-conversations', params: { courseId, conversationId } }`, the
  address the course's conversations page once had, which opens the panel on it and leaves the page
  where it was. The chat
  reads the caller's seat in a conversation's course from their memberships (`useChatSeat`), never from
  the course store, since the page may show another course or none. Conversations are with agents
  alone: `conversation.respondents` lists nobody else, Core refuses a person as a respondent or an
  answerer (`conversations_are_with_agents`, which `errorMessage()` puts in words), and a
  conversation from before with a person is closed with that reason, shown as closed and left out
  of the history. The history is `me.conversations`: the caller's own in every course, newest
  activity first, a page at a time, or one course's (`course_id`), kept in the chat store
  (`loadHistory`, `loadMoreHistory`). What the caller has read is Core's: a conversation on screen
  is marked read (`conversation.mark_read`, by `useConversation`'s `reader`) when it opens unread
  and as the agent writes, never by staff reading it, and the button's count is the `unread` of
  the first page of `me.conversations`, read again every 30 seconds while the page is shown. A
  conversation on screen is long-polled (`useConversation`, and `chat.ts` for the numbers): one
  `conversation.messages` read after the last seq held waits for news (`wait_s: 25`, with
  `seen_state`, the state held), and the next is made as soon as it answers, so an answer shows as
  soon as it is written and the typing line (`awaiting_answer`) goes with it. Only one waits for a
  pane, and it is cut short (aborted) when the pane goes off screen or away (another conversation,
  the history, the panel closed, signing out), the page is hidden, or the caller writes; after a
  pause the pane reads at once, then waits again. Where Core answers a wait at once with nothing
  (too many of the caller's reads wait, or it is shutting down), or refuses `wait_s` (a Core from
  before it), the pane reads every 3 seconds while an answer is awaited and less often once it is
  quiet (`pollDelayMs`), for a minute, then asks to wait again; it stops once the conversation is
  closed. The
  browser keeps only the course the caller last asked in (`aishiteru.chatCourse.<actorId>`). Those
  who decide actions read each agent's conversations from the course's *Agents* page (its
  conversation log: `conversation.list` as overseer, with `respondent_member_id`). A conversation
  (`ChatPane.vue`) is laid out as an editor's agent chat: one header row with the agent, whether
  anything runs it (`PresenceText`) and, only once it is closed, its state, and a ⋯ menu for who can
  read it, how its answers arrive and closing it; the messages; and the composer (`ChatComposer.vue`),
  one bordered box whose send button, small and icon-only, sits inside it at the bottom right, with
  its keys in the button's tooltip and the count near Core's limit beside it. Whatever stops the
  caller writing (an agent paused, gone, not answering or operated elsewhere, a closed conversation,
  one waiting for approval), or an answer being waited for, is one muted line above the composer,
  never an alert box. A new conversation has no title field: it is titled by the first line of its
  first message (`titleFrom`).
- A time on Core's clock that is counted down (an invite link's ten minutes): `useCountdown(() => at)`
  from `@/composables/useCountdown` gives `text` (mm:ss), `remaining` and `ended`, all on Core's
  clock as its answers' `Date` headers tell it (`@/api/clock`), so that a classroom computer whose
  clock is off counts right. `<QrCode :value :size :label />` draws a QR code in the page, black on
  white in either theme; `downloadQrPng()` (`@/utils/qr`) saves it as a PNG.
- Anything kept fresh by asking again (a chat, an inbox): `usePolling(fn, { intervalMs, enabled })`
  from `@/composables/usePolling` — one poll at a time, backing off after failures, paused while the
  page is hidden, stopped on unmount; `pollNow()` after sending something. A long poll (a read Core
  holds until there is news, `wait_s`) is polled again at once (`intervalMs: 0`, with
  `failureIntervalMs` to back off from), passes on the `signal` each poll is given, which is
  aborted when polling stops or pauses, and is cut short by `pollNow({ interrupt: true })`; give the
  read a `timeoutMs` past the wait (`read(name, args, { signal, timeoutMs })`), the only reads with
  a time limit.
- Formatting: Prettier with the repo's `.prettierrc` (no semicolons, single quotes, width 120).

## Text

- No user-visible string in code. Every view uses `const { t } = useI18n()` and keys in its own
  namespace: `src/i18n/messages/en/<ns>.ts` and `src/i18n/messages/zh-Hant/<ns>.ts`, both exporting
  the same key tree (the file name is the namespace: `t('members.add.title')`). Traditional Chinese
  is written for Hong Kong / Taiwan readers (繁體中文), not machine-literal.
- Shared words are in `common` (`common.actions.save`, `common.labels.status`, …) and Core's
  vocabularies in `enums` (`enums.perm.grade_submit`, `enums.actionStatus.proposed`, …). Use them
  rather than repeating them.
- Core's error messages are English and are shown as they are, after a translated lead
  (`errorMessage()` does this).
- Some vocabularies are keyed by Core's own dotted names (`enums.event`: `grade.posted`, …).
  vue-i18n splits a key path on dots, so look those up with a bracketed segment:
  ``t(`enums.event['${type}']`)``.

## Files each part owns

The shared foundation — `src/api/**`, `src/stores/**`, `src/composables/**`, `src/utils/**`,
`src/components/**`, `src/layouts/**`, `src/router/**`, `src/i18n/index.ts`,
`src/i18n/messages/*/{common,enums,layout,auth,home}.ts` — changes only on purpose, for every part
at once. A part keeps its own components next to its views (`src/views/<area>/components/…`).
