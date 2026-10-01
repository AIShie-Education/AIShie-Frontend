# Front-end conventions

How this app is put together, and the rules every view follows. Read
[AIshie Core's concepts](https://github.com/AIShie-Education/AIShie-Core/blob/main/docs/aishie-core-concepts.md)
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
- **Single sign-on's identity providers** are set up on *登入方式* (`/admin/sign-in`,
  `SsoAdminView.vue`, and its parts in `src/views/admin/sso/`), for platform administrators, through
  the `sso` tools by way of `ssoAdmin.ts` (`listProviders`, `testProvider`, `createProvider`,
  `updateProvider`; the form's `formProblems`, `createArgs`, `updateArgs`, `testArgs`). The operator's
  provider (`source: 'operator'`) is read-only and first, the site's follow by `position` (`ordered`);
  one whose id the operator's has (`id_taken`) takes no write (`isEditable`). Every write sends the
  version read, in its body (Core takes it as `If-Match` too); `version_mismatch` reads the list, or
  the provider, again and says so, the dialog keeping what the administrator changed over what it
  reads. Refusals are worded by reason under `ssoAdmin.refusal` (`ssoErrorText`), and Core's refusal
  of a field (`details.field`, `fieldOf`) on that field. A client secret is write-only: it lives in its
  password field's ref alone, goes only in the body of the write that gives it (an edit sends it only
  when it is replaced, never its hint), and is cleared once saved, when the kept one is chosen again
  and whenever the dialog closes. Its write goes through `write()` under `writeKey()`, which keeps the
  key only until Core answers or the form changes, and not through `useWrite`, which keeps the
  arguments it sent to compare with. The sign-in page shows a button for each of
  `ssoButtons(authMethods())`: Core's `sso_providers`, or the one `sso` of a Core from before them.
- **Exporting conversations for audit** is *匯出對話* (`/admin/conversation-exports`, `admin-export`,
  `ExportView.vue`, and its parts in `src/views/admin/export/`), for platform administrators and
  department administrators alike (meta `admin: 'departments'`, the side bar's last entry), through
  `conversation.export` and `conversation.export_file` by way of `conversationExport.ts`. What is
  offered is `scopeChoices` (a course, a department, and the whole site for a platform
  administrator alone) and `departmentChoices` (the departments administered, from the appointments
  down); a course is chosen from `course.list`'s pages, searched here and said with its term, a
  participant from the directory (`actor.list`) or, for a department administrator, by a whole email
  or number (`actor.lookup_by_email`) or a pasted ID. Days are `YYYY-MM-DD` on the browser's calendar,
  sent by `exportArgs` as RFC 3339 with that day's own offset: `from` midnight as the first day
  starts, `before` (exclusive) midnight as the day after the last starts, which `spanWords` says as
  "up to and including". The export goes under `keyFor`'s idempotency key, kept with the form in
  `sessionStorage` (`aishie.conversationExportPending.<actor id>`) until Core answers (`settleKey`:
  no answer, a gateway, the server or a rate limit keep it), so that a retry, or a reload, sends the
  same key and Core gives what it made rather than export twice; its answer then has no links.
  `startExport` keeps the run (`lastRun`) outside the view, so that it goes on while another page is
  shown. Links to the files live in memory alone: one is taken for gone 30 s before its `expires_at`
  on Core's clock (`linkLive`), `liveLink` asks for a new one, and `saveFile` goes to it, never
  fetching the file into the page (the download attribute through this origin, a tab of its own for
  an object store's). Each export is remembered without its links in `localStorage`
  (`aishie.conversationExports.<actor id>`, `rememberExport`, `rememberedExports`), in memory where
  storage is refused or full, until its `expires_at`. Refusals are worded by reason under
  `auditExport.refusal` (`exportErrorText`; `export_too_large` with its counts and limits,
  `tooLargeOf`), and a conversation's `visible_to` ends with `audit_export`, which the chat says
  (`visibleToLines`).
- **Files**: bytes never go through a tool. Every upload is one call, `uploadFile(courseId, kind,
  file, { onProgress, onRetry, signal, retries, maxBytes })` from `@/api/http`: it asks for an upload
  URL (`document.upload_url`, or `conversation.upload_url` for kind `conversation`, a message's
  file), PUTs the bytes there and returns an `UploadedFile`, reporting where it
  is (`preparing`, `sending`, `finishing`), the bytes sent, and the speed and time left over the last
  few seconds (`RateMeter`, `@/utils/transferRate`). A failure on the way (no answer, a gateway or
  server error, a rate limit, nothing moving for a minute) is tried again three times, after 1, 2 and
  4 s or once the browser is back online, each at a fresh URL (Core's own store takes a URL's file
  once); a refusal is not. Aborting `signal` cancels it (`isAbort`). What Core takes is remembered
  from each upload URL and asked once by `uploadLimits` (`maxBytes`, and for a conversation's files
  `maxFiles` a message and `maxConversationBytes` a conversation; `uploadLimit` is the first alone),
  so that a larger file is refused before anything is sent (`isFileTooLarge`, with `details.size`
  and `details.max_bytes`), as a proxy's 413 is too. What callers hand it and get back stays the
  same when Core hands out a URL per part or an object store's own: that is decided inside it. The
  bytes of a short-lived download URL are fetched, where the page needs them (a thumbnail), by
  `fetchBlob`, with no credentials, and shown from an object URL: `index.html`'s policy lets images
  come from this origin, `data:` and `blob:` only, and an object store's URL is another origin.
- Components never call it, nor have an `<input type="file">`, of their own: they take files with
  `<FileDropZone v-model="files" v-model:uploading="busy" :course-id :kind multiple />`, or, in the
  chat's composer, with its attachments (below)
  (`@/components/FileDropZone.vue`). It takes files dropped on it, chosen by clicking it or from the
  keyboard (it is one button: Enter or Space), or pasted, says the largest file taken, and on a phone
  is one big button to choose files. With `page-drop` it also takes files dropped anywhere on the
  page or dialog it is the one zone of, or pasted where no field takes them (`usePageDrop` from
  `@/composables/useFileDrop`, which a page's own list may use too: the last to ask, and turned on,
  takes them, and says while files are dragged that they would go there; `installDropGuard`, from
  `App.vue`, keeps a file dropped where nothing takes it from being opened in the app's place). The
  same file takes files dropped on one element (`useDropTarget`, the zone's and the chat pane's),
  a paste of files alone (`pastedFiles`: one that carries text is the text's), and files chosen
  from a button that is not a zone (`useFilePicker`, the composer's paperclip). Each
  file goes through an upload queue (`useUploadQueue`: three at once, the rest waiting, each to
  cancel, retry or remove; a file over the limit fails at once and is not tried again) and is listed
  with its progress, speed and time left, what it is doing in words, and buttons named for the file;
  a screen reader hears what was added, each quarter sent, and what was uploaded, failed or was
  cancelled. `busy` is true while any is still to upload: disable the submit button with it and say
  why ("Waiting for the files to upload…"). Without `multiple`, a new file takes the place of the one
  there. `files` is `UploadedFile[]`: hand each `uploadToken` to the tool that attaches it
  (`document.create`/`add_version` `upload_token`, `grade.submit` `feedback_files`, …); taking one
  off the list takes it out of `files`, and one the caller takes out (once attached) leaves the list.
  A caller that gives each file something of its own (material's title) makes the queue itself
  (`useUploadQueue`) and passes it as `:queue`, with an `#item="{ item }"` slot beside each file;
  `v-model` is not kept then.
- Where a document is made (new material, a new version, new instructions or a rubric), the file
  comes first and its text second, in the same version: the drop zone is what opens, and under it
  `<DocumentTextField v-model="body" v-model:open :summary>` (`@/components`), one line that opens
  on a Markdown editor ("Add a text note (optional)", 「加入文字說明（選填）」, or what the text is once
  there is one), with the caller's actions on that line (`#actions`: a new version's "Leave the text
  out" and "Keep version N's text"). A new version starts from the latest version's text, folded
  away unless that version is text alone. Material that is text alone is written by "Write text
  instead" (back, "Upload files instead"), offered while no file is listed; a file dropped then
  takes its title and text. New material makes one document for each file, titled from its name
  without the extension (`titleFromFileName`), editable before Create, numbered on from the sort
  order in the order listed, each with its own `useWrite` (and so its own idempotency key), and
  what was created comes off the list; the text goes with a single file, and with several the
  editor gives way to a line saying so (`documentsToCreate` decides, and is where several files
  become one document once a version holds several). Files dropped on the materials list open New material with them; a
  file dropped on a document's page opens its new version. A submission's files are attached with
  `document.create` (`kind: 'submission'`, `submission_id`, `upload_token`) as each is up, while it
  is a draft; `submission.submit` then takes the list of their document ids as a guard. To
  download, use `<DocumentFileLink :course-id :document-id :title />`, which fetches a fresh
  short-lived URL on click and saves the file under the document's title (or `file-name`), with its
  type's extension.
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
- The runtime's administrators (Core's root and admins, as many of them as its operator names: `GET
  /me`'s `is_admin`) set it on *AI and documents* (`/admin/runtime`, `RuntimeAdminView.vue`, and its
  parts in `src/views/admin/runtime/`), through `runtimeAdmin` (`@/api/runtime`): the school's plan
  (its offers, each with the school's key, write-only, and its daily quotas in answers and dollars),
  pricing (the price table beside the operator's price file, tenants' daily quotas, hosted agents'
  daily budgets, and what things cost), today's use of the plan, and OCR. The side bar offers the page to platform administrators where there is a runtime; the page
  says so where there is none, and offers to try again where it cannot be reached. Each tab is a
  part the runtime answers for apart, in `<RuntimeAsync>`: a runtime from before a part's routes
  answers 404, said quietly as not offered yet (`isNotOffered`), and a refusal because the caller is
  not one of its administrators (`not_admin`) says who may. Refusals are worded by
  `adminErrorText` (`runtimeAdmin.errors`, then the hosting pages' words). An offer's form is the
  own-model form's pieces (`hosting.ts`: `ModelForm`, `choiceFrom`, `formProblems`, `keyProblem`),
  and an edit sends only what changed from the offer as read (`offerPatchFrom`), at its version: a
  412 reads it again and keeps what the administrator changed over it. A key's trial that failed
  (`key_test_failed`) says what the provider answered (`keyTrialOf`). Who changed a setting is
  named from Core (`<ChangedBy>`, `actor.get`). Dollars come as six-place strings, are shown to the
  cent at least (`usdShown`) and typed as decimals (`usdProblem`), empty for no limit. A refusal
  that a quota in dollars needs prices (`offer_not_priced`, with `details.offers`) lists those
  models with "Add a price" (`<UnpricedNotice>`, `<PriceDialog>`); `model_not_priced` lists its
  agents' lines. Costs are shown by `lines` kind: a document's transcription is a line of its own
  (「文件轉寫」), and the runtime's own row by agent (no agent, key `transcription`) and by person
  (no tenant, key `site`) is named so. The Documents tab is OCR's card and the transcriber's
  (`TranscriptionCard`, `transcription.ts`): its switch saves at once, its form sends a merge-patch
  of what changed (`patchFrom`), and its credential with Core is one button,
  `handOverServiceCredential`: the service's live credentials listed (`service.list_credentials`),
  one issued without `replace` (with five live, only after asking, then with `replace`), put to the
  runtime (`PUT admin/transcription/credential`, never sent again by itself), the others revoked once
  it is taken; a refusal revokes the one just issued, and no answer asks the runtime's settings
  whether it has it before revoking it. Its token lives in one local variable, as an agent's does
  for hosting (`hostingFlow.ts`), and the runtime client takes a service's token (`aissvc_…`) out of
  any error as it does an agent's. "Revoke" is `withdrawServiceCredential`: the runtime forgets it,
  then Core revokes it (by the id it was given, or the live one its hint's prefix names). What comes
  next is another tab, or another card in its tab.
- The runtime's route and field names live in `src/api/runtime.ts` (`RUNTIME_ROUTES`) and
  `src/api/runtime-types.ts`, and nowhere else.
- **A document version's text version (文字版)** is Core's (`version.text` in `document.get` and
  `document.versions`, `document.text`, `document.text_update`, `document.text_retranscribe`), and
  whether anything transcribes is the runtime's: `info.features.transcription`, false without a
  runtime. The document page shows it on a tab of its own (`TextVersionPane`,
  `materials/components/textVersion.ts`) for whoever reads the version, and for whoever writes the
  document (`document_write`, as for a new version) on every version with a file. Its place in the
  queue (pending, working) shows only while the transcriber is on, and what only it would do
  (transcribing again, or for the first time) is offered only then; a text that is done shows
  whatever the runtime says, and staff may write one by hand either way. A long text is read part by
  part at one `revision`, starting again when it moves on (`readWholeText`); an edit names the
  revision it was made from (`base_revision`), and `text_changed` keeps the draft to be saved over
  the latest once it is loaded. Retranscribing a staff text asks twice and sends `discard_edit`.
  Why one failed or was skipped is worded by `enums.textReason` where the code is known, and shown
  as written otherwise. `<MarkdownView :anchors>` gives its pages' and slides' headings
  (`## 第 N 頁`, `## 投影片 N`) ids of their number alone (`pageHeadings` lists them).

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
- What a browser remembers (`localStorage`, `sessionStorage`) is kept under a key starting `aishie.`,
  read and written in a `try`, since a browser may refuse storage. Versions from before the name
  AIshie kept theirs under `aishiteru.`: `src/migrateStorage.ts`, the first thing `main.ts` imports,
  moves those at start, before anything reads a key, so nothing else reads the old names.
- Views are responsive down to phone width, and work in light and dark (use Element Plus CSS
  variables, never hard-coded colours). `useNarrow()` / `useMediaQuery()` from
  `@/composables/useMediaQuery` switch a wide table to cards on a phone.
- A page's two columns follow the page's own width, not the window's, since the side bar takes from it
  (the chat's window floats over the page, and takes nothing): the view's root is an inline-size container (`container-type:
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
  AIshie's runtime does); one operated from an external tool (Claude through MCP) never does, and has
  no chat box anywhere. Where Core says `site_chat: false` (`agent.get`/`.list`, an agent's seat in
  `member.get`/`.list`), offer nothing to ask it and say why: `common.agent.external` ("Operated from
  outside") and `common.agent.externalNote`, with `common.agent.hostedTakesChat` for its owner.
  `conversation.respondents` leaves such agents out, and a conversation's opener learns from it
  (`offeredIn`) whether its agent may still be asked; Core refuses a question to one as
  `agent_answers_elsewhere`, which `errorMessage()` says in the same words.
- The left of every signed-in page is laid out as an editor's: an activity bar along the window's edge
  (`src/components/sidebar/ActivityBar.vue`, mounted by `AppLayout`), with the brand's mark and a button
  for each view the caller is offered (their courses; their agents, for a person; administration, for
  whoever may open its pages), the caller's account at its bottom, and beside it the side bar (`SideBar.vue`) showing the one chosen, at a
  fixed 260 px, with no edge to resize it by. A view's button, pressed again, collapses the side bar.
  Going to a page of a view (a course's pages, `/account/agents…`, `/admin…`) shows that view, and never
  opens a collapsed side bar. `useSideBarStore()` (`@/stores/sidebar`) holds the view and whether it is
  open, which this browser remembers. A new view is a `SideView` in `components/sidebar/frame.ts` (its
  icon, its name, whose it is, the path of its pages) and a component for its body. On a phone there is
  no activity bar: the header's menu button opens the views in a drawer, as tabs along its top, and
  following a link in it closes it.
- The account is one menu button, as an editor's Accounts (`src/components/sidebar/AccountMenu.vue`): the
  initial of the caller's name at the bottom of the activity bar (on a phone, a row at the bottom of the
  side menu). Its menu says who is signed in (name, email or login ID, platform role) and holds the
  account's settings, the language and the theme, each a submenu with the choice in use checked, and
  signing out. It works from the keyboard as a menu does (the arrow keys, Home and End; ArrowRight into a
  submenu and ArrowLeft out; Escape or Tab closes it, back on its button). The header holds the page's
  title alone (and, on a phone, the menu's button): nothing else is offered there.
- A tab left open runs the build it loaded. While it is shown, `useNewVersion` (`NewVersionNotice`,
  mounted by `AppLayout`) reads `index.html` again (`cache: 'no-store'`) every five minutes and when the
  tab is shown again, and compares the entry script it names (`/assets/index-<hash>.js`) with the one
  this page loaded; another one is a small notice, 「已有新版本」, with Reload and Later. It never reloads
  by itself: someone may be writing. It is off in development, and says nothing against the one build a
  preview serves.
- The chat with agents is one window over every signed-in page (`src/components/chat/ChatPanel.vue`,
  mounted by `AppLayout`), not a page of a course: every conversation in it is in a course and with an
  agent. Nothing runs along the window's right edge: the header and the page reach it. The chat's
  entry is a round button floating at the bottom right of every page (`.app-chat-fab`, on a desktop as
  on a phone), 16 px from the screen's edges and above a phone's safe area, with the count of answers
  not read and, from 900 px up, a tooltip saying its shortcut; the header holds only the page's title,
  and the activity bar only the side bar's views. The page keeps room below its last item for the
  button (`.has-chat-fab`: its size and twice its inset), so that a list's last item, its pages or a
  button are never under it; a page that pins something to the bottom of the screen keeps it clear of
  the button too. The button opens the chat in its corner, and is gone while the chat is open; Ctrl/⌘+J
  opens it too. It is a window over the page, not docked beside it: it takes nothing from the page's
  width, which stays as it is, and usable, behind it (a dialog, not a modal one: `role="dialog"`,
  `aria-modal="false"`, named by its title bar). It is 400 × 600 px (`WINDOW_WIDTH`, `WINDOW_HEIGHT`),
  16 px from the viewport's bottom right corner, and clear of the header where the viewport is too
  short for 600. Its title bar holds its name, Minimize and Close, moves it, and a double click on it
  puts it back in its corner; its left edge, its top and its top left corner resize it, from 320 × 360
  up to the viewport's left and top, its right and bottom edges staying (the edges are separators the
  arrow keys, Home and End move too). It is placed from the viewport's bottom right corner (`WindowBox`
  in `components/chat/panel.ts`: its size, and how far its right and bottom edges are from the
  viewport's), so that it keeps its distance from that corner as the viewport changes, and is always
  wholly within the viewport (`clampBox`, `moveBox`, `resizeBox`); where the viewport no longer holds
  it, it goes back to its corner (`fitsIn`). A drag is set once a frame, nothing on the page is
  selected meanwhile, and where it was left and how big is kept (with whether it is open, in this
  browser, `aishie.chatPanel`) once it is let go. It lies over the page and under whatever Element Plus
  lays over it, with a shadow all round (`--app-z-panel`, `--app-shadow-window`; the layers are in
  `styles/tokens.css`). Minimized (its button, Escape from within it, or Ctrl/⌘+J), it opens again on
  what it showed; closed, on a new conversation in the course it asks in (the chat store's `close`);
  either way focus goes back to the round button. Files dropped anywhere on the window, its title bar
  too, go to the conversation it shows, as below. On a phone (up to 899 px) it is a sheet over the whole
  screen, a modal dialog with no edge to drag, closed with its one button or Escape, keeping what it
  showed, and it gives way to a page a link in it leads to. `useChatStore()` (`@/stores/chat`) opens it
  on a conversation (`showConversation(courseId, id, { open: true })`) or on a course (`showCourse`); a
  link to a conversation is still `{ name: 'course-conversations', params: { courseId, conversationId } }`,
  the address the course's conversations page once had, which opens the window on it and leaves the
  page where it was. The chat
  reads the caller's seat in a conversation's course from their memberships (`useChatSeat`), never from
  the course store, since the page may show another course or none. Conversations are with agents
  alone: `conversation.respondents` lists nobody else, Core refuses a person as a respondent or an
  answerer (`conversations_are_with_agents`, which `errorMessage()` puts in words), and a
  conversation from before with a person is closed with that reason, shown as closed and left out
  of the history. The history is `me.conversations`: the caller's own in every course, newest
  activity first, a page at a time, or one course's (`course_id`), kept in the chat store
  (`loadHistory`, `loadMoreHistory`). It is grouped by when each conversation last moved (today,
  yesterday, this week from Monday, earlier: `historyGroup`, by this browser's calendar), and a
  search box keeps those whose title or agent holds what is typed (`historyMatches`), among the
  pages read so far, saying so while more could be loaded. What the caller has read is Core's: a conversation on screen
  is marked read (`conversation.mark_read`, by `useConversation`'s `reader`) when it opens unread
  and as the agent writes, never by staff reading it, and the button's count is the `unread` of
  the first page of `me.conversations`, read again every 30 seconds while the page is shown. A
  conversation on screen is long-polled (`useConversation`, and `chat.ts` for the numbers): one
  `conversation.messages` read after the last seq held waits for news (`wait_s: 25`, with
  `seen_state`, the state held, and `seen_draft_version` where Core keeps drafts), and the next is
  made as soon as it answers, so an answer shows as
  soon as it is written and the working line (`awaiting_answer`) goes with it. Only one waits for a
  pane, and it is cut short (aborted) when the pane goes off screen or away (another conversation,
  the history, the panel closed, signing out), the page is hidden, or the caller writes; after a
  pause the pane reads at once, then waits again. Where Core answers a wait at once with nothing
  (too many of the caller's reads wait, or it is shutting down), or refuses `wait_s` (a Core from
  before it), the pane reads every 3 seconds while an answer is awaited and less often once it is
  quiet (`pollDelayMs`), for a minute, then asks to wait again; it stops once the conversation is
  closed. The
  browser keeps only the course the caller last asked in (`aishie.chatCourse.<actorId>`). Those
  who decide actions read each agent's conversations from the course's *Agents* page (its
  conversation log: `conversation.list` as overseer, with `respondent_member_id`). A conversation
  (`ChatPane.vue`) is laid out as an editor's agent chat: one header row with the agent, whether
  anything runs it (`PresenceText`) and, only once it is closed, its state, and a ⋯ menu for who can
  read it and how its answers arrive (nothing ends a conversation from the chat); the messages; and
  the composer (`ChatComposer.vue`), one bordered box whose send button, small and icon-only, sits
  inside it at the bottom right, with its keys in the button's tooltip and the count near Core's
  limit beside it, and a paperclip at the bottom left. **Files in the chat** (Core's conversation
  attachments, `attachments.ts`): a message may carry files, chosen with the paperclip, dropped on
  the chat panel (the pane shows where they go while they are dragged over it, and the box is
  outlined while they are dragged over the window; dropped on the panel's bar they go to the pane
  too, and where it shows nothing to write in, nowhere, never to the page under it), or pasted in
  the box (an image copied). Each is a chip in the box (`ChatAttachmentChips`: its icon by type,
  name, size, a line along its bottom as it uploads, and buttons named for it to cancel, try again
  or remove it) and uploads at once, through the draft's upload queue and `uploadFile` (kind
  `conversation`); what is attached to a draft is kept with it for the page's life, as its text is
  (`attachmentsFor`, by the draft's key). What Core takes (`uploadLimits`: `max_files` a message,
  `max_bytes` a file) is known before anything is sent: files past the count are left out, saying
  how many, and a file too large fails at once with both sizes. Nothing is sent while a file is on
  its way ("Waiting for the files to upload…") or failed until it is tried again or removed. A
  message needs words (`attachments_need_body`): with files and an empty box, the placeholder asks
  what to do with them, and sending asks for a line under the chips, never an error. The message
  goes with `attachments: [{ upload_token, filename }]`, in the order added, and the chips go with
  it; Core's refusal because of them (`details.reason`, each worded in `chat.attach.refusal`,
  `attachmentRefusalText`) marks the files it was about (one too large fails; uploads that can no
  longer be attached as they are, `not_uploaded`, `upload_too_old`…, are uploaded again) and says
  why under the chips, keeping the words. A question waiting for approval shows its files' names;
  one taken back to the composer (edit, stop) brings its files back, uploaded again, where they
  were sent from this page, and says to attach them again otherwise. In a message
  (`ChatMessageFiles`), each file is a card with an icon by its type (`fileKind`), its name, what
  it is and its size, the person's over their bubble and the agent's under its words; a click asks
  for a fresh URL (`conversation.attachment`) and saves it under its name (`downloadAttachment`:
  through this origin with the download attribute, an object store's in a tab of its own). A small
  image (PNG, JPEG, GIF, WebP, AVIF or BMP, up to 8 MB) is shown as a thumbnail, fetched once the
  message is on screen (`thumbnailOf`, kept by the file's id for the page's life, the latest 60)
  and shown from an object URL. A withdrawn message shows no files, as it shows no text (Core
  sends neither). The course feed says how many files a posted message carried
  (`conversation.message_posted`'s `attachments`), and an action that writes a message how many
  it names. The agent's messages (`ChatMessage.vue`) take the whole width with no bubble, as
  Markdown set for reading
  (`styles/chat-prose.css`), their code in a box with its language and a copy button
  (`<MarkdownView code-tools>`); the person's are a quiet bubble on the right; a run of messages by
  one author is named once (`groupedWith`), and each message's time and actions (copy it as written;
  edit the question awaiting its answer; withdraw it) show under it on hover or focus, always on a
  touch screen. While an answer is awaited, a working line in the messages (`ChatStatusLine`, the
  turning glyph of `ChatSpinner`) says 「思考中…」 and counts the seconds since the question, or
  that the agent is waited for where nothing runs it; and the send button, while nothing is
  written, is a stop button. Stopping, or editing that question, withdraws it
  (`conversation.retract`, as its author) and puts its words back in the box: Core's inbox leaves
  out a conversation whose latest question is retracted and a runtime treats it as moved on, so
  nothing answers it, though an answer already begun may still be posted; Core still says
  `awaiting_answer`, which the pane reads as nothing awaited (`questionWithdrawn`). In the box, ↑
  when it is empty brings back the last message sent, Escape leaves it, a slash at the start opens
  the commands (`/new`, `/history`), and an @ at the start
  of a word the course's assignments and materials (`mentions.ts`: `assignment.list` and
  `document.list`, the reads the Assignments and Materials pages make), whose title it writes in,
  quoted, for the agent to find; their list works from the keyboard and never takes the Enter an
  input method uses. Whatever stops the caller writing (an agent paused, gone, not answering or
  operated elsewhere, a closed conversation, one waiting for approval) is one muted line above the
  composer, never an alert box. A new conversation has no title field: it is titled by the first
  line of its first message (`titleFrom`), and it offers a few ways to begin, which fill the box.
  An answer in the making (`draft.ts`, the contract Core, the runtime and this app share) takes the
  working line's place: `ChatDraft` under the agent's name, its steps (`ChatDraftSteps`: each done
  step with a tick, 「已閱讀《HW1.pdf》」, the running one with the turning glyph, and the steps
  done summed up, 「已查閱 3 項」, once text begins), then the text so far as Markdown with a caret;
  where the answer waits for someone's confirmation (`text_hidden`), the steps and
  「答案需經確認後才會顯示」. They are driven by the draft alone: `useConversation` takes it from
  every read of a Core that keeps drafts (`draft`, null for none) and, once one has carried it,
  waits naming the version held (`seen_draft_version`), so that each new version shows as soon as
  the agent writes it; the posted answer takes its place.
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
