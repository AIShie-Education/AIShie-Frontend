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
- `course.writable` is false in an archived course: disable every write control there.
- Reads that are refused (403) are shown by `<AsyncState>` as "no permission", not as a failure.
- Permission names and which tool needs which are in Core's `docs/schema.md` §2.2. A few borrow:
  the grading scheme is written with `assignment_write` and read with `grade_read`; reading the
  course, assignments, the event feed and your own actions needs `document_read`; correcting
  lateness needs `grade_submit`; regrading needs `grade_submit` and `grade_post`.
- Show names, not ids: `<MemberName :id />` (uses the member list when readable, "You" for the
  caller), `course.assignmentTitle(id)` after `course.ensureAssignments()`. Use `<IdText :id />`
  where an id is all there is. After adding/removing members or assignments call
  `course.invalidate('members' | 'assignments')`.
- Everything held is the caller's. Signing out (or Core ending the session) closes the course store,
  and the next sign-in in the same tab loads the page afresh, so caches a view keeps at module level
  never outlive the caller they were filled for.

## Building a view

- Every page starts with `<PageHeader :title :subtitle :back>` with its primary actions in the
  default slot, then content in `.app-card` sections (`.app-card__title` for a section heading).
  Actions that are all `v-if`'d away leave no empty row.
- A page inside a course whose route does not say which tab it belongs to calls
  `useCourseTab(() => routeName)` (`@/composables/useCourseTab`) with the route whose tab to highlight
  (a document that is an assignment's instructions → `'course-assignments'`).
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
- Anything kept fresh by asking again (a chat, an inbox): `usePolling(fn, { intervalMs, enabled })`
  from `@/composables/usePolling` — one poll at a time, backing off after failures, paused while the
  page is hidden, stopped on unmount; `pollNow()` after sending something.
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
