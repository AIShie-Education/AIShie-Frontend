# Front-end conventions

How this app is put together, and the rules every view follows. Read
[AIshie Core's concepts](https://github.com/AIShie-Education/AIShie-Core/blob/main/docs/aishie-core-concepts.md)
and [schema](https://github.com/AIShie-Education/AIShie-Core/blob/main/docs/schema.md) first: this app is
one client of Core's tool layer, the same one agents call over MCP, and it has no logic of its own
about who may do what.

## Stack

Vue 3 (`<script setup lang="ts">`, Composition API only), Vite, TypeScript (strict), Vue Router,
Pinia (setup stores), vue-i18n (composition mode; English, Traditional and Simplified Chinese: see
[Text](#text)), Element Plus (registered globally, icons registered globally by their component
names: `<el-icon><Edit /></el-icon>`), dayjs, markdown-it + DOMPurify.

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
  one whose id the operator's has (`id_taken`) takes no write (`isEditable`). A provider's status
  is worded under `ssoAdmin.status`, and why one is not offered under `ssoAdmin.statusWhy`
  (`SsoStatus.vue`, refusals in red). Switched on is not always offered: one whose issuer is plainly
  not at a public address gets `issuer_address_not_allowed` while the server is held to public
  addresses, and switching it on says so instead of promising its button. Every write sends the
  version read, in its body (Core takes it as `If-Match` too); `version_mismatch` reads the list, or
  the provider, again and says so, the dialog keeping what the administrator changed over what it
  reads. Refusals are worded by reason under `ssoAdmin.refusal` (`ssoErrorText`), and Core's refusal
  of a field (`details.field`, `fieldOf`) on that field. A problem of `sso.test`'s whose reason Core
  names in brackets is worded under `ssoAdmin.test.reason` (`problemReason`), with Core's words after
  it, and the test's verdict says how much of the issuer was read (`reportRead`). A client secret is write-only: it lives in its
  password field's ref alone, goes only in the body of the write that gives it (an edit sends it only
  when it is replaced, never its hint), and is cleared once saved, when the kept one is chosen again
  and whenever the dialog closes. Its write goes through `write()` under `writeKey()`, which keeps the
  key only until Core answers or the form changes, and not through `useWrite`, which keeps the
  arguments it sent to compare with. The sign-in page shows a button for each of
  `ssoButtons(authMethods())`: Core's `sso_providers`, or the one `sso` of a Core from before them.
  Where there is one, single sign-on comes first, its first button the page's primary, and the
  password form is behind a link ("Use your student number and password instead"), and back; the
  page waits a moment (400 ms) for Core to say, so as not to show the form and take it away, and
  keeps a form already typed in. The four pages before the app (signing in, an invitation, a join
  link, a password of one's own) are one card on the flat ground, `.app-auth-page` with its
  `__lang`, `__card` and `__wordmark` (`styles/main.css`), under the public site's line
  (`common.tagline`).
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
  file), PUTs the bytes there and returns an `UploadedFile`. A document's file is named at its URL
  (`filename`: `safeFileName` from `@/utils/files`, the file's own name made one Core takes, as Core
  makes one of a title: no control or bidi characters, no slashes, 255 characters at most, the
  extension kept), and that name comes back as `fileName`. It reports where it
  is (`preparing`, `sending`, `finishing`), the bytes sent, and the speed and time left over the last
  few seconds (`RateMeter`, `@/utils/transferRate`). A failure on the way (no answer, a gateway or
  server error, a rate limit, nothing moving for a minute) is tried again three times, after 1, 2 and
  4 s or once the browser is back online, each at a fresh URL (Core's own store takes a URL's file
  once); a refusal is not. Aborting `signal` cancels it (`isAbort`). What Core takes is remembered
  from each upload URL and asked once by `uploadLimits` (`maxBytes`; for a document's files
  `maxFiles` a version and `maxVersionBytes` a version's all together; for a conversation's files
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
  cancel, retry or remove; a file over the limit fails at once and is not tried again; a queue made
  with `version`, one version's files, lets each file in, in the order listed, while a version has
  room for it, and fails one there is no room for before it is sent, `overLimit` saying why, to try
  again once another is taken off; `move` puts a file elsewhere, `learn` takes a smaller limit a
  refusal named, and `excess` says what is too much then) and is listed
  with its progress, speed and time left, what it is doing in words, and buttons named for the file;
  a screen reader hears what was added, each quarter sent, and what was uploaded, failed or was
  cancelled. `busy` is true while any is still to upload: disable the submit button with it and say
  why ("Waiting for the files to upload…"). Without `multiple`, a new file takes the place of the one
  there. With `version` the files are one version's (the zone says "Up to 20 files, 50 MB each, 200
  MB in all"), and with `reorder` the list is an ordered one, numbered, each file moved up or down
  by buttons named for it, `files` following the order. `files` is `UploadedFile[]`: hand each to
  the tool that attaches it by its `uploadToken` and `fileName` (`document.create`/`add_version`
  `files: [{upload_token, filename}]`, in order, by `uploadedPayload` or, from a queue,
  `filesPayload` (`@/utils/documentFiles`); `grade.submit` `feedback_files` with `filename`);
  taking one off the list takes it out of `files`, and one the caller takes out (once attached)
  leaves the list. A caller that reads each file's item (to say what is left out, to mark the files
  a refusal was about) makes the queue itself (`useUploadQueue`) and passes it as `:queue`, with an
  `#item="{ item }"` slot beside each file if it puts anything there; `v-model` is not kept then.
- Where a document is made (new material, a new version, new instructions or a rubric), the files
  come first and its text second, in the same version: the drop zone is what opens, and under it
  `<DocumentTextField v-model="body" v-model:open :summary>` (`@/components`), one line that opens
  on a Markdown editor ("Add a text note (optional)", 「加入文字說明（選填）」, or what the text is once
  there is one), with the caller's actions on that line (`#actions`: a new version's "Leave the text
  out" and "Keep version N's text"). A new version starts from the latest version's text, folded
  away unless that version is text alone. Material that is text alone is written by "Write text
  instead" (back, "Upload files instead"), offered while no file is listed; files dropped then
  take its title and text. A version holds several files (一份文件含多個檔案, AIShie-Core #49):
  new material makes one document of every file listed, in their order, titled from the first
  file's name without the extension (`titleFromFileName`) until the title is written; a new version
  takes every file dropped in it or on the document's page, and names the latest version's files it
  does not carry over. Their queue is made with `version`, and the zone with `multiple reorder`.
  What Core refuses because of the files (`too_many_files`, `version_too_large`, `file_too_large`,
  `bad_filename`, an upload it no longer takes, …) has words in `common.upload.refusal`
  (`FILE_REFUSAL_SCOPE`, sizes shown by `detailsForWords` as `{max_bytes_shown}`), and
  `versionFilesRefused(queue, error)` marks the files it was about: a file too large fails, uploads
  Core no longer takes are uploaded again at fresh URLs (say so: "The files are being uploaded
  again"), and a limit it names is learnt. A submission's files are attached with
  `document.create` (`kind: 'submission'`, `submission_id`, `files` of one) as each is up, while it
  is a draft; `submission.submit` then takes the list of their document ids as a guard.
- **A version's files** are read from `version.files`, by `versionFilesOf(version)`
  (`@/utils/documentFiles`): in order, each with its `id`, `position`, `filename`, type, size and
  text version; a purged version has none. List them with
  `<VersionFileList :course-id :document-id :version-id :files :doc-title :date />` (`@/components`):
  an icon by type (`fileKind` and `FILE_ICON`, `@/utils/files`, shared with the chat), the name and
  size, which opens the file viewer (below) on it among the version's others, and beside it a
  download under the name from a fresh short-lived URL asked for on the click
  (`downloadDocumentFile`, `document.file`), never a URL read with the version, which may have
  expired; `text-status` and `open-text` add each file's text version. Where only a document's id
  and title are known (a submission's documents, a grade's feedback files), use
  `<DocumentFiles :course-id :document-id :title />`, which reads its one version once for the page
  and lists its files, the title heading several. Each file of material, instructions or a rubric
  has its own text version: every `document.text`, `text_update` and `text_retranscribe` names its
  `file_id`, which Core requires, and the document page has a `TextVersionPane` for each file,
  picked with `TextFilePicker` and kept in the address (`?tab=text&file=`).
- **Previewing a file (預覽).** Every list of files opens the file viewer, never a page of its own and
  never the file's URL: `openPreview({ files, index, title, courseId })` from
  `@/components/preview/viewer`, with `documentPreviewFiles(courseId, documentId, versionId, files,
  date)` for a version's files and `attachmentPreviewFiles(courseId, attachments)` for a message's
  (each file knows how to have a fresh URL, `document.file` or `conversation.attachment`, how to
  download itself, and, for material, instructions or a rubric, how to read its text version). The
  viewer (`FileViewer`, mounted once by `AppLayout`) is a large dialog, the whole screen on a phone,
  upright or on its side (a window 480 px tall or less), with the previous and the next file
  (buttons, and the left and right arrow keys where nothing in it takes them), the download under
  the file's name, and its close button; Escape closes it and the focus goes back to the row.
  What a file is shown as is `previewKind(type, name)` (`@/utils/preview`,
  the name's extension first, then the declared type): a PDF in the page with pdf.js (`PdfView`,
  loaded only when one is opened, the legacy build, its worker, character maps, WebAssembly decoders
  and two standard fonts all files of the build under `/assets/`: `pdfjs.ts`), pages one under the
  other drawn as they come near the screen, page by page, zoom and fit to width (`pdfZoom.ts`), a
  pinch of two fingers or a touchpad's zooming the pages and not the screen, the text selectable,
  and one page control, none for a page alone; on a phone (640 px or less of the view's own width,
  or 400 px or less of its own height) the page control and the zoom are one compact bar at the
  bottom, within a thumb's reach, fitted to the width saying so rather than its per cent (zoomed by
  hand, its per cent again; where the bar has no room, it measures and leaves out its per cent, then
  its count of pages, never cutting a digit short), and the viewer's previous and next file two
  arrows by its close button, their position said only to a screen reader, so that one count is
  on the screen;
  an image as an `<img>` (an SVG too, never inline), zoomed or fitted; Markdown by `MarkdownView`,
  code highlighted as fenced code, plain text as it is, CSV as a table of its first thousand rows
  (`parseCsv`), text read as UTF-8 or the legacy encoding of the reader's script (`decodeText`);
  audio and video in the browser's players; an Office file as its PDF rendition (below), or, where
  Core keeps none, as its text version where Core has one done (a staff text too), and otherwise a
  note and its download, as anything else. Bytes are fetched
  whole with `fetchBlob` from the fresh URL, up to a size by kind (`PREVIEW_MAX_BYTES`: 2 MB of
  text, 40 MB of an image, 100 MB of a PDF or a recording; past it, a note and the download), and
  shown from object URLs revoked as soon as another file is shown or the viewer closes
  (`ObjectUrls`). The page's policy needs nothing more for this (`index.html`).
- **An Office file's PDF (its rendition, 統一轉 PDF).** Core converts every Office, OpenDocument and
  RTF file it decides to (by name and type: AIShie-Core#53, migration 0026) to PDF once, through the
  site's runtime, for every kind of document and every message's files; such a file carries
  `rendition: { state, page_count?, byte_size?, reason?, download_url?, download_expires_at? }`
  wherever it is read (`document.get`, `document.file`, `conversation.attachment` with the URL once
  done; `document.versions` and `conversation.messages` without it), and any other file none. A file
  listed with a `rendition` is previewed through it alone (`@/utils/rendition`; the preview files
  carry the listed one, `readRendition`, which reads it afresh from `document.file` or
  `conversation.attachment` as it is shown, and, where the caller may, `retryRendition`): `done`, the
  PDF fetched from the fresh URL into `PdfView`, with 「下載 PDF」 (`savePdf`, under `pdfNameOf`: the
  file's name with `.pdf`) beside the file's own download and its page count in the head;
  `queued`/`claimed`, 「正在轉換為 PDF…」 with a spinner, said to a screen reader, asked again after
  `renditionPollDelay(n)` (2 s doubling to 30 s) while the viewer shows that file, and never once it
  shows another or closes (nothing is pushed); `failed`/`skipped`, why, in words for the
  rendition's `reason` (`preview.rendition.reason.<reason>`: `password_protected`, `unsupported`,
  `too_large`, `conversion_failed`, `timeout`, `attempts_exhausted`, else `other`), with the file's
  download, and 「再試一次」 where the caller may send it back: `document.rendition_retry` for whoever
  holds the document's kind's write permission (`retryPermOf`: `document_write` for material,
  instructions and a rubric, `submission_write` for a submission, `grade_submit` for feedback; pass
  `retry-renditions` to `VersionFileList`, which `DocumentFiles` works out itself), and
  `conversation.rendition_retry` for whoever may withdraw the message (`retry-renditions` on
  `ChatMessageFiles`). A retry that waits for approval says so; `rendition_done` and `no_rendition`
  are answered by reading it again; other refusals are said in `preview.rendition.refusal`. A file
  listed with no `rendition` (a Core from before renditions, or one Core converts not) is shown as
  before. A listed file whose PDF is done has a small PDF tag; one waiting is not marked, since the
  list is not read again.
- **Download as PDF (下載為 PDF).** A text that is read as a document (a version's text note, a
  file's text version, a text or Markdown file in the viewer, a submitted text, a conversation) is
  offered as a PDF through the browser's own print window, which sets it in the fonts the page
  already has, Chinese among them: `<PrintButton :source />` (`@/components`), or
  `usePrintLayout().print(source)` from a menu, where `source` gives the title, the lines under it
  (the course, `courseLine(courseId)`, and the date, `dateLine(at)`) and the body as Markdown, plain
  text or HTML made of sanitised parts. `printDocument` (`@/utils/printLayout`) lays it out with the
  app's style sheets and print rules (margins, the page's number at its foot where the browser draws
  margin boxes) in a hidden frame of this origin, waits for its fonts and images, and calls its
  `print()`; its title is the PDF's name. The button says what it does, 「下載為 PDF」, with
  「在列印視窗選擇『另存為 PDF』」 in its tooltip, to a screen reader, and as the window opens. No PDF
  is made in the page.
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

- **How an agent runs is chosen once, when it is created, and never changed** (`hosting`,
  `AgentHosting` in `@/api/types`, read with `hostingOf()`): `runtime`, hosted on AIshie, which the
  runtime runs by the agent's id and members of its courses ask on the site; or `mcp`, MCP access,
  which its owner's own tools use with tokens the owner issues (`agent.issue_token`), and which
  nobody asks on the site. Every place an agent is made asks for it with `<HostingChoice v-model>`
  (no default; it says it is for good) and sends it: `agent.create`, `actor.register` for an agent,
  and a new course agent. Nothing offers to change it (Core refuses: `hosting_fixed`). Show it,
  wherever an agent is shown in detail, with `<HostingTag :hosting :site-chat>`, which for one hosted
  on AIshie says whether it can be asked now (`site_chat`) where that is known. An agent with MCP
  access has no hosting anywhere (its page shows `McpAccessCard`: its tokens, Core's MCP endpoint,
  the header and Claude Desktop's configuration); one hosted on AIshie has no token anywhere for its
  owner (Core refuses one: `hosted_by_runtime`), and its page shows `HostingPanel`.

- **Show hosting only where there is a runtime.** `useRuntime()` from `@/composables/useRuntime`
  gives `available`, `info`, `error`, `checked` and `refresh`, from one `GET /info` per page load.
  Until `checked`, show neither the feature nor its absence. `info.features` are booleans the runtime
  works out as it starts (`host_by_id`, `own_key`, `school_key`): offer what each names only
  while it is true.
- **Calls**: the contract's own, `runtime.me()`, `.models()`, `.testKey(req)`, `.inspect(agentId)`,
  `.host(agentId)`, `.list()`, `.get(id)`, `.update(id, version, patch)`, `.renewToken(id)`,
  `.pause(id)`, `.resume(id)`, `.remove(id)`, each resolving `{ data, etag, status, replayed }`. Each goes as the person signed in, with an assertion Core makes for them; the client
  asks for it, keeps it in memory, and asks again as it needs. The runtime reads no idempotency key:
  the client sends again what the runtime answers once however often it is sent, and never a PATCH
  or a key test. `update` names the version it read; the other writes name none, but any of them may
  still answer 412: `isVersionMismatch(e)` says the agent changed since, so read it again and say so,
  keeping what the person typed.
- An agent is hosted by its id alone: `inspect` it (nothing is written; it says whether it may be
  hosted and why not), then `host` it (`HostOnRuntimeDialog`, then `ModelKeyDialog`). The runtime is
  issued the agent's one token by Core itself: nothing in the app issues, shows, pastes or sends an
  agent's token to it. Only an agent created hosted on AIshie, active and not hosted yet, is offered.
  `needs_token` (its token revoked in Core) is mended with `renewToken` ("Connect again"). `pause`
  and `remove` answer what became of its token in Core (`revocation`): where it was not revoked
  (`failed`, `not_attempted`), tell the owner that people may still be offered to ask it
  (`revocationNotice`). After any of these, read the agent from Core again: whether it can be asked
  follows.
- Errors are `RuntimeError` (an `ApiError`) with the runtime's `reason`; choose the words by reason
  (`hostingErrorText` in the agents' components). A 401 from the runtime is not a lapsed session
  (the client has already tried a new assertion): say the runtime refused, not that the person was
  signed out. A lapsed session shows as Core's 401 when the assertion is asked for, and the app
  handles it.
- Never keep a token or a model key in reactive state, storage, a log or an error: a credential the
  page issues for the runtime (the transcriber's) lives in one local variable until the runtime has
  it.
- **The runtime's daily counts** (the school plan's quotas, tenants' quotas, agents' budgets, the
  transcriber's pages a day) start again once a day. Say when with `<DailyReset :since />`
  (`@/components/DailyReset.vue`), as a message's `{reset}` slot, never as "00:00 UTC" in words: the
  time on the reader's own clock with their time zone named in the page's language ("08:00 (Hong Kong
  Standard Time)", 「香港標準時間 08:00」; `formatTime` and `timeZoneName` from `@/utils/format`),
  and the exact instant in UTC in its tooltip (`formatUtc`). The instant is `nextDailyReset`
  (`@/utils/dailyReset`): a day after the `since` the runtime gives with what was used (an agent's
  `today.since`, `admin/school-plan/usage`'s `since`), so that a runtime whose day starts at another
  hour is followed; where its answer gives none (`GET /models`, the settings), the next 00:00 UTC,
  the rule its documents state, written there alone. It moves on by itself once it has passed
  (`useNow`), for a page left open with no fresh `since`. The school's ceiling (`per_day`) counts
  everything on the school's key, whoever's agent answers, and the transcriber's model calls in
  dollars; nothing on anyone's own key: say so where it is set. Today's use
  (`admin/school-plan/usage`) costs the answers' model calls alone, so where its cost stands beside
  the ceiling in dollars, say that transcription is not in it.
- The runtime's administrators (Core's root and admins, as many of them as its operator names: `GET
  /me`'s `is_admin`) set it on *AI and documents* (`/admin/runtime`, `RuntimeAdminView.vue`, and its
  parts in `src/views/admin/runtime/`), through `runtimeAdmin` (`@/api/runtime`): the school's plan
  (its offers, each with the school's key, write-only, and its daily quotas in answers and dollars),
  pricing (the price table beside the operator's price file, tenants' daily quotas, hosted agents'
  daily budgets, and what things cost), today's use of the plan, OCR, and Agent hosting: the
  runtime's own credential for Core (`AgentRuntimeCard`, the service `agent_runtime`), listed,
  issued (shown once, with where it goes) and revoked through Core alone, never handed to the
  runtime by the page, since setting up the server makes it and `aishie runtime-credential` on the
  server rotates it, which the card says first. The side bar offers the page to platform administrators where there is a runtime; the page
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
  cent at least, as US dollars (`formatMoney`, "US$0.0184") and typed as decimals (`usdProblem`), empty for no limit. A refusal
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
  whether it has it before revoking it. Its token lives in one local variable, and the runtime
  client takes a service's token (`aissvc_…`) out of any error as it does an agent's. "Revoke" is `withdrawServiceCredential`: the runtime forgets it,
  then Core revokes it (by the id it was given, or the live one its hint's prefix names). What comes
  next is another tab, or another card in its tab.
- The runtime's route and field names live in `src/api/runtime.ts` (`RUNTIME_ROUTES`) and
  `src/api/runtime-types.ts`, and nowhere else.
- **A file's text version (文字版)** is Core's, one for each file of a version (`files[i].text` in
  `document.get` and `document.versions`, `document.text`, `document.text_update`,
  `document.text_retranscribe`, each naming its `file_id`), and whether anything transcribes is the
  runtime's: `info.features.transcription`, false without a runtime. The document page shows it on
  a tab of its own (`TextVersionPane` for each file, `TextFilePicker` to pick one of several,
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
  (`## 第 N 頁`, `## 投影片 N`) ids of their number alone (`pageHeadings` lists them), with the
  file's place before them from the second file on (`text-f2-page-3`).

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
  `errorMessage()`, and so is `owner_would_be_refused` (a proposal of the owner's agent that
  approving now would refuse), with the refusal it would meet (`details.refusal`) in the reader's
  words where the app has them, and Core's alone for a bare `forbidden`; `reasonText()` says either
  in the same words where a decision refused so is listed, as the failed action Core records.
  In the queues, an agent's action that is not its owner's to decide says so to the owner in one
  sentence naming who decides (the people whose seat decides, by name where the member list is
  readable, else "the course's teaching staff"), with no Approve or Reject to press: for a proposal,
  both reasons the queue's `yours_to_decide` false may stand for (their own level or reach, or
  approving it now would be refused), until Core says which; in the review queue, the first alone
  ("Reviewed by …"). The approvals page says its rules once, in a disclosure under its title
  (「規則」, with a chevron), open the first time it is shown in this browser and closed on each visit
  after that unless the person left it open (`aishie.approvalsRules`); where the browser keeps
  nothing, closed. It is not said again over each tab, so a rule about one tab begins with that
  tab's name ("Awaiting review: everything listed there has already happened…"), and every rule is
  a whole sentence.
- **A proposal sent back for changes.** Wherever a proposal is decided (`DecidePanel`), *Request
  changes* (要求修改) is offered beside Approve and Reject, under the same rules as Reject:
  `action.decide` with `decision: 'request_changes'` and the note as `reason`. The note is required,
  1 to 2000 characters and not spaces alone: the confirm button stays off until there is one, and
  Core's refusals of it (`note_required`, `note_too_long`) are worded under
  `actions.decision.refusal`. Opening Request changes or Reject puts the focus in the form's field,
  which is named for what it asks (`actions.decision.fieldLabel`, never by its placeholder alone),
  `aria-required` while a note is required, and described by the hint and the line saying a note is
  needed; the confirm button comes right after it for Tab (the row is drawn Cancel first, with
  `row-reverse`) and, while the note is missing, is `aria-disabled` and described by that line, not
  `disabled`, so that Tab still reaches it and it says why: type, Tab, Enter sends it. The proposal
  ends in `changes_requested`, a final state that is no failure: its tag is `warning`, amber, as it
  waits on its proposer to propose again, not a rejection's `danger`. Its button is outlined, as
  Reject's is, and pressed in while its form is open, whose confirm button is the one primary. Its
  note is read where a rejection's reason is (`result.decision.reason`, `storedDecision()`), and who
  asked and when from `decided_by_member_id` and `decided_at`. A revision names the proposal it
  revises (`revises_action_id`, Core's `Revises` header), which `RevisesLine` links to in the queue,
  *My actions* and the action's page, as the feed does from the revision's `action.proposed`; the
  earlier one says nothing of it. Its icon hangs beside the text, which wraps under itself, so it
  stays on the line of the link's first word. On the action's page, under the label "Revises", the
  link names only the earlier proposal (`labelled`), and beside it is what to change in it, in *My
  actions*' words (`actions.outcome.changesLabel`): read with `action.get` by whoever read the
  revision so, a decider or the owner of the agent that proposed it (a revision revises its own
  proposer's), with `action_decide` or without. `action.changes_requested` is listed in the feed
  with its decision, as `action.rejected` is. Every proposal is offered for changes, an agent's
  answer in a conversation too, which the site's agent runtime answers again once sent back
  (AIShie-Agent-Runtime#52): this front end is deployed beside a runtime that does, never ahead of
  it.
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
  the Account page or a person's administration page (an agent's page and *My agents* issue them,
  for an agent with MCP access alone).
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
  Actions that are all `v-if`'d away leave no empty row. Its title is the page's one `<h1>`: nothing
  else the app draws on a page is one (headings inside rendered material, a document's or an
  assignment's Markdown, are the author's, and are left as they wrote them).
- **A course's pages** (`CourseLayout`): the top bar is the way back up, not the page's name again
  (`CourseCrumbs`: "CS101·A Introduction to Programming › Materials", the course leading to its
  overview, the tab to its page where the page is one under it, and only the last step marked as the
  page, `aria-current`); then a line of context, the course's code, its name in the sans and its
  status, never a heading, on one line (a long name is cut short with an ellipsis; only on a phone's
  page does it wrap, to two lines at most); then the tabs, one row (above). A page's title that only
  names the tab chosen is not shown again: `PageHeader` keeps it for screen readers, and its
  subtitle and actions share one row (`coursePage.ts`, by the title's
  words, so title a tab's page with the tab's own name). A page's own title (a document, a member)
  shows as before. The tabs, which a seat is offered, and which one a page belongs to are
  `useCourseNav()` (`src/layouts/courseNav.ts`), which the strip, the top bar and the phone's menu
  all read; the phone's menu lists the course's tabs under the course the page is in. The gradebook
  and the grading scheme are pages of the Grades tab, all three read with `grade_read`: their
  header shows the grades' own tabs (`CourseSubTabs`) in the title's place, the student a page is
  about going with the way to the other; the first is All grades (a student's, My grades), never
  Grades again. A new tab goes in `COURSE_TABS`, in the order most used, and the target stays: on a
  laptop's screen (1280 × 800), with the side bar open, a course page starts its content within
  200 px of the window's top. Inside a course the page's header has 12 px under it, not 20. Known
  to miss it, by a line of their own: an assignment, a submission and a proposal, whose header has
  a back link, a title and a line of facts beside their actions (about 220 px), and the Submissions
  and Grading scheme pages (205 and 215 px), whose subtitle takes a second line; in English, whose
  subtitles are longer, the Grades page too (214 px), and Submissions and Agents by a pixel or so
  (201 px); do not add to them.
- **Navigation's icons are outlined, never filled**: the activity bar, the side bar, the phone's
  header, a course's tabs and More's menu, the grades' tabs. A filled glyph among outlined ones
  reads as chosen, or as news. Element Plus's `*Filled` icons, and those solid by design whose names
  do not say so (`Stamp`, `List`, `Grid`, `Menu`), are refused in navigation's files
  (`src/layouts`, `src/components/sidebar`) by `npm run lint` (`eslint.config.js`), however they are
  named: imported, as a string, or as a tag in a template. Another solid glyph found among them goes
  on that list.
- A page inside a course whose route does not say which tab it belongs to calls
  `useCourseTab(() => routeName)` (`@/composables/useCourseTab`) with the route whose tab to highlight
  (a document that is an assignment's instructions → `'course-assignments'`). A page that is another
  page for some callers names itself in the header and the browser's tab with
  `usePageTitle(routeName, () => key)` (`@/router/title`): the approval queue, for someone who decides
  nothing there, is their agents' proposals.
- Wrap anything loaded in `<AsyncState :loading :error :empty @retry="reload">`.
- Tags for Core's vocabularies: `<StatusTag vocab="submissionState" :value="s.state" />` — see
  `StatusTag.vue` for the list; labels come from `enums.<vocab>.<value>`.
- **Colour** runs along two axes. A hue says an outcome alone: done in green (executed, posted,
  approved), refused, failed or missing in red, waiting on someone in amber (proposed, sent back
  for changes, late, not published). A category is neutral, the ground's second shade under the third ink, told apart by
  its icon's shape: the activity feed's kinds of event, roles and platform roles, kinds of actor and
  of seat, how an agent runs (`HostingTag`). Whether an agent can be asked is neutral too, never
  green as "online" is; only its not running, which wants its owner, is amber. What is new or
  unread, and a count of what waits for the reader's decision, is indigo. A
  level of autonomy is told by its mark and its weight, never by red and green (`LevelIcon`, the
  `app-level-tag` classes StatusTag gives `level` and `answerLevel`): denied a lock, neutral;
  confirm_required a raised hand on the indigo's tint; pending_review an eye, outlined in ink;
  autonomous a bolt, solid ink, the heaviest, for the level that leaves an agent most to itself.
  The 「需批准」 beside an action the caller's seat must have approved is that level too:
  `<StatusTag vocab="level" value="confirm_required" />`, never an amber tag of its own.
- Markdown: `<MarkdownView :source />` to show, `<MarkdownEditor v-model />` to write. Never use
  `v-html` with anything else. Images load only from this origin (or inline `data:`); one from
  elsewhere is shown as a link to it, so a text cannot tell another host who read it.
- Forms: `el-form` with `label-position="top"` and rules; dialogs with `el-dialog` (`width="560px"`,
  `destroy-on-close`; a global rule keeps every dialog within a phone's width), the submit button
  bound to `pending` from `useWrite`. Confirm destructive or
  irreversible actions with `ElMessageBox.confirm`.
- **Buttons** go by rank, as `styles/element.css` draws them, and by nothing else: `type="primary"`
  (solid indigo) for the one main action of a view or a dialog, approving and publishing among them;
  no type (outlined, the ink's text) for everything beside it, rejecting, requesting changes and
  cancelling among them, rejecting being the safe choice, not a destructive one; `type="danger" plain` (a red outline) for a
  destructive action on a page (archive, remove, revoke), which asks first; and solid red alone for
  the last step of that confirmation (`confirmButtonClass: 'el-button--danger'`, or a dialog's
  button that does it at once). `success`, `warning` and `info` are outcomes' colours, for tags,
  never a button's. A disabled button has no hue, whatever its rank. What cannot be taken back is
  not put beside what is done every day: it goes in the toolbar's ⋯ menu (`MoreFilled`), at its far
  end, as undoing final grades is beside posting them.
- Tables: `el-table` with `:data`, `row-key`, `@row-click` to navigate where rows are things; keep a
  mobile width in mind (`min-width` on columns, not fixed widths everywhere). A table has no ground of its own:
  it lies on its card (`styles/element.css`), white being a field's alone, and a column of figures is
  right-aligned, where its digits line up (`tabular-nums`; `data-num` elsewhere). `el-descriptions`
  with `border` is drawn as rows parted by a thin line on the card, not a boxed grid.
- **The whole class's gradebook** (`/gradebook` for staff before a student is chosen: `ClassGradebook`
  in `views/course/grades/components/`; a student, or a chosen student, has `GradebookView` as before)
  is students by assignments, read from what the seat may read alone (every page of `grade.list`
  and, where it reads them, `submission.list`, the assignments, the scheme and the member list) and
  worked out in `classMatrix.ts`, which computes nothing Core computes: a cell is the posted grade
  on the highest attempt that has one, or a newer draft, or work recorded missing or waiting to be
  graded, and work handed in on a later attempt than any graded (a resubmission, late work after a
  graded missing row) waits to be graded beside the grade shown; a total is the one written down at
  posting, its override in its place. Of grade.list, mostly superseded totals with their working,
  only what the matrix needs of the live grades is kept (`slimGrade`). Rows are the students within
  the seat's student scope, removed ones (marked, and left out of the averages) when asked for; a
  seat limited to listed assignments has no totals or components. A scheme that cannot be read is
  an error, never every assignment shown as not counted. Drafts, missing work and work to grade are
  said in words, never by colour alone. The search, the filter and the order are in the address
  (`?q=`, `?show=`, `?sort=`), and `GradebookView` keeps the page alive (`KeepAlive`) while a
  student's own gradebook is open, so that coming back finds it as it was, read again behind it.
  It is not an `el-table`: `GradeMatrix` is a table in a box of its own, its header row and names
  sticky, whose rows are all 44 px and of which only those near the screen are drawn (300 × 30
  stays smooth), in a box as tall as the window has room for below where it begins; where its
  toolbar is 542 px or less it is a list a student at a time (`StudentGradeList`). Its CSV
  (`matrixCsv`) is what is shown, UTF-8 with a byte-order mark and CRLF lines, drafts, overrides,
  waiting work and paused or removed students marked, and no text a spreadsheet would run as a
  formula (`csvText`).
- Link with route **names** and params: `{ name: 'course-assignment', params: { courseId, assignmentId } }`.
  Route names are in `src/router/modules/*.ts`; views receive route params as props.
- What a browser remembers (`localStorage`, `sessionStorage`) is kept under a key starting `aishie.`,
  read and written in a `try`, since a browser may refuse storage. Versions from before the name
  AIshie kept theirs under `aishiteru.`: `src/migrateStorage.ts`, the first thing `main.ts` imports,
  moves those at start, before anything reads a key, so nothing else reads the old names.
- Views are responsive down to phone width, and work in light and dark (use Element Plus CSS
  variables, never hard-coded colours). A page takes its layout from its own width, never the
  window's, a table or a card per row included (below): the side bar can leave a page narrow on a
  wide window. Only what belongs to the window asks it, with `@/composables/useMediaQuery`:
  `usePhoneScreen()` (640 px or narrower) for a dialog or a drawer laid over the page that fills a
  phone's screen, and `useMediaQuery()` for the side bar's drawer, the chat's sheet and touch. On a
  touch screen (`pointer: coarse`, `styles/element.css`) Element Plus's controls are 44 px (40 small,
  48 large) and its fields' text 16 px, below which iOS zooms into a field it focuses; a component
  that sets the text size of a field one types into (`MarkdownEditor`'s 13 px monospace, the PDF
  viewer's page number) outweighs that rule, and so sets 16 px under `pointer: coarse` itself. A
  control of the app's own that is pressed often is at least 40 px there: a course's tabs (44), the
  grades' own tabs (40) and the links of the phone's menu (44) among them. Never set `maximum-scale` or
  `user-scalable` in the viewport: zooming is the reader's.
- Back closes what is laid over the page, as a phone's back gesture or button is expected to:
  `useBackCloses(open, close, { when })` from `@/composables/useBackCloses`, once in the overlay's
  component. Opening adds an entry to history at the page's own address, back closes the overlay
  on top (one at a time, where one is open over another; a message box asked over them, ElMessageBox,
  is dismissed first, as cancelled), and closed by its own means (its button, Escape, a click beside
  it) it goes back over its entry, so that history is as it was. It is used by the file viewer, the
  phone's menu, the chat's sheet (`when` it is a sheet: the window on a wider screen stays open from
  page to page, and back moves between them), the agent's conversation log, the invite link put up
  full screen, and the administrators' drawers of a preset and of a department's administrators
  (full width on a phone, `DRAWER_SIZE`), who can read a conversation, the chat pane's dialog
  opened over the sheet or the log, and About (`AboutDialog`), which on a phone opens over the
  menu from the account's row at its bottom; a new drawer or dialog that fills a phone's screen, or that opens
  over one of these, uses it too. The router (`installBackCloses`) goes back over the overlays' entries before it adds a page's,
  so that a link followed from one takes its place, and over those a page left before it was
  reloaded; going back to a page's own entry leaves it where it was scrolled.
- A page's two columns follow the page's own width, not the window's, since the side bar takes from it
  (the chat's window floats over the page, and takes nothing): the view's root is an inline-size container (`container-type:
  inline-size`), and an `@container (max-width: …)` stacks the columns where the main one would be
  left less than about 420 px (the overview at 800 px of page, an assignment at 740, two cards of an
  actor's page at 856). A course's tabs keep to one row at any width, never wrapped: as many as fit
  by the strip's own width show (`fitTabs`, from each tab's width laid out unseen), and only those
  that do not fit are under More (更多 ▾) in the last place, each still a link (its address to open
  in a new tab or to copy), More marked as the tab chosen while the page is one of them. On a phone,
  where the side bar is the menu's drawer and the page is a phone's (592 px), every tab is in the
  strip, which scrolls sideways, each end fading over 16 px; beside the docked side bar the strip
  never scrolls, however narrow the page, since a mouse might not reach its end. What the template itself switches follows the same width: `useContainerNarrow(el, max)`
  from `@/composables/useContainerWidth` says whether an element is `max` px wide or less, as
  `@container (max-width: …)` would, for el-descriptions' columns, which of a table's columns show,
  or a table or a card per row (the administration's courses, departments, people and an actor's
  page). A table that folds its columns under its first does so where they no longer all fit at
  their `min-width`s, when the fold keeps what they say (sign-in's providers, the school's AI plan,
  prices and quotas per person, the gradebook) or leaves out no more than an ID (the departments,
  the terms) or when a course was created, which its own page shows (the courses). A phone's
  layout, a card per row, or a fold that leaves out more, switches where the page is as narrow as
  in a window of 640 px without the side bar: 592 px of page, 542 of a card's content (the members,
  a member's page, My actions and the people, which switched at 767 px, at 719 and 669). Measure a
  part as wide as the card that no `el-table` changes the size of, its title or its toolbar, never
  the card around an `el-table`, which lays itself out again from a `ResizeObserver` of its own
  (the card would change height in that observer's callback, a loop the browser reports). What the
  switch itself changes in the measured part is safe, a toolbar's row that wraps, say: the switch
  is never made in an observer's callback, but a task later or on the window's `resize`. A table
  whose columns, or their widths, follow the switch is given it with `useTableRelayout(table,
  narrow)` (the same module), which lays the table out again in that same task: left to itself, an
  `el-table` lays a change of its columns out 50 ms later, the browser lays its rows out on the old
  columns' widths in between, and where they then change height the table's own observer lays it
  out again in its callback, a loop the browser reports (as the side bar opens on the members, at
  900 px of window). The unit tests give elements widths with `fakeContainerWidths()`
  (`@/composables/containerWidthFakes`), and without it jsdom shows the wide layout. A dialog's
  breakpoints, and a phone's CSS (a card's padding, a filter taking the toolbar's whole row, at
  640 px and narrower), stay `@media` queries on the window. Columns of
  cards use the shared `.app-columns` (the grid) and `.app-column` (a stack of cards, 16 px apart)
  from `styles/main.css`: side by side, both columns are as tall as their row and the last card of
  each grows to fill it, so that they end on one line, with what each card holds at its top;
  stacked, nothing grows. Leave `align-items` off such a grid, or it wins over `.app-columns`.
- Short ids: `shortId(id)` / `<IdText>` show the *end* of an id. Core's ids are UUIDv7, whose
  first characters are a timestamp shared by everything made in the same moment.
  `<IdText>` is quiet (12 px, the third ink, its copy button on hover): an id is for an administrator
  to find or paste, beside a name, never a chip as heavy as an email. A student's seat shows no member
  ID (the course overview's seat card, their seats on Account), nor does their grade show the ids of a
  newer grade or of its rubric's version. What they may be asked to quote stays: the action that made
  a grade, an action's own page (its id, its actor's and its target's), and their account's ID on
  Account. Where a person cannot be named to them (a student may not read the member list),
  `<MemberName>` says "someone in the course" (「一位成員」), a grade's grader say, until Core names
  them: never a hash in a line that says who acted ("→ 430c5829 approved"), and no member ID in a
  `title` either, which a touch screen or a keyboard cannot reach and a screen reader reads out
  whole. What they quote instead is the action, its ID on its page (a grade's, under the grade),
  which tells whoever reads the action log who it was. Where the name is known otherwise, pass it
  (`:agent`): a student's own agent by the name in its proposal or in her agents (agent.list), the
  agent a conversation is with by the name `conversation.get` gives it.
- `<MemberSelect :statuses="['active', 'paused']">` for lists Core takes paused members in;
  `<PermEditor :changed :warn>` marks rows; `<DocumentTextField>` takes its line's actions in
  `#actions`; `MCP_ENDPOINT` (`@/api/http`) is where an agent connects.
- **An agent always looks like one, and never like a person or a machine.** Its shape says so, not a
  hue of its own (no orange for agents: it would be taken for a waiting pill or the brand's light):
  - One agent in particular is shown by `<AgentAvatar :name size>` (`@/components`): a rounded square
    (radius 8 at 28 px; a person is always a circle) on `--app-indigo-tint`, its initials in
    `--app-indigo` (`agentInitials`, `@/utils/initials`: two letters, or one Chinese, Japanese or Korean
    character), with the brand's light at its top right corner. 28 px (`default`) where it heads a row
    of a list of agents (the chat's list to ask, the course's agents), 20 px (`small`) inline in a line of
    text (the chat's header and author line, a proposal's proposer or target, a name in a table, the
    feed's who line, a draft's drafter), 36 px (`large`) heading an entry of a list of agents with their
    details (My agents, the administration's card). It is decorative (`aria-hidden`); its initials are
    drawn by CSS.
  - Agents as a kind (a view of the activity bar, a course's tab, a kind to choose, a note about
    agents) take `<AgentSeatIcon />`, the person-beside-a-seat line icon of aishie.app (stroke 1.8,
    round caps; in an `<el-icon>`, or by component where icons are listed). Never the chip (`Cpu`).
  - After an agent's name, wherever the name is shown, `<AiBadge />`: "AI" in every language
    (`common.agent.ai`), 11 px, on the indigo tint, radius 4, its words on hover; it takes no focus.
    It never parts from the name: `<AgentName :name />` keeps the name's last character (with any
    punctuation after it) on the line of the "AI" when the name wraps, and nothing more, so a name with
    no spaces (`cs101-introduction-to-programming-weekly-revision-tutor`) still breaks wherever it must
    and never pushes the "AI" out of its row; a last word breaks no sooner than it would have. `<AgentName
    :name ellipsis />` cuts the name short on one line and keeps the "AI" whole. `<AgentBadge :kind :owner-name :mine />` beside
    an actor's or member's name says it and whose agent it is ("Your agent", "Yuki's agent") in ink on an
    outline, never in the links' indigo; nothing for a person; `no-ai` after an `AgentName`.
    `<MemberName :id show-kind />` shows a member who is an agent with its avatar and "AI". Inside a
    control (a row that is a button), `AgentBadge` and `AskableText` take `hint-id`: they take no focus,
    and what their tooltips say goes in hidden elements of those ids, for the control's
    `aria-describedby`.
  - An agent seated as someone's delegate is in Core's role `assistant`, a person's word: `<RoleTag
    :member />` shows which kind of agent it is (course agent, personal agent) in its place.
  - An agent is never "online". To those who ask it (the chat's header and list of agents),
    `<AskableText :who :name />` says "Can be asked" or "Paused" (可提問／暫停, 可提问／暂停) from
    `availabilityOf`, and why on hover; in the chat's header, after whose agent it is (`whose`), which
    the header has no room to show. To its owner and those who manage it,
    `<PresenceText :value="last_seen_at" />` speaks of a program connecting (never connected /
    connected within two minutes / last connected). Both in plain ink, with no dot of colour.
  - What an agent made says so where it is shown: a draft grade names its drafter, and what its draft
    filled into a form carries a 3 px `--app-indigo` line at its left (the indigo line is under 3:1)
    until it is changed, and says so in its label to a screen reader (`GradePanel`). Each row of the
    feed starts with who acted: who did it, or who proposed it and who decided it, read from the
    action it was done under (`action_id`, or the action a log event is about), where the caller may
    read that action (`actors.ts`). Those who decide actions read any (`action.get`); anyone else reads
    their own (`action.list_mine`) and, owning an agent seated there, that agent's (`action.get`, as
    its owner; asked only of events about their own work), and learns nothing of anyone else's, until
    the feed itself says who acted. The *Agents* chip keeps what agents did, for those who decide
    actions and those who own an agent there.

  `seatPurpose()` (`@/utils/agents`) tells a course agent from a personal agent by the seat's
  `answers_course`; `delegateArgsFor()` gives `member.add_delegate` both the preset and
  `answers_course`, always said outright. `<HostingTag>` says how an agent runs, beside it.
- People ask an agent on the site only while AIshie's runtime hosts it: one hosted on AIshie for which
  the runtime holds a live token (`site_chat: true`, which nobody declares or switches any more). One
  with MCP access never is, and has no chat box anywhere. Show `site_chat` as a status, never a switch
  (`SiteChatCard`; `notAskable()` in `courseAgents.ts` on the course's agents). `conversation.respondents`
  lists only the agents that can be asked, and a conversation's opener learns from it (`offeredIn`)
  whether its agent may still be; Core refuses one that cannot as `mcp_agent` or `agent_not_hosted`
  (`notAskableReason()`), which the pane and `errorMessage()` say as `common.agent.notAskable`.
- The left of every signed-in page is laid out as an editor's: an activity bar along the window's edge
  (`src/components/sidebar/ActivityBar.vue`, mounted by `AppLayout`), with the brand's mark and a button
  for each view the caller is offered (their courses; their agents, for a person; administration, for
  whoever may open its pages), the caller's account at its bottom, and beside it the side bar (`SideBar.vue`) showing the one chosen, at a
  fixed 260 px, with no edge to resize it by. A view's button, pressed again, collapses the side bar.
  Going to a page of a view (a course's pages, `/account/agents…`, `/admin…`) shows that view, and never
  opens a collapsed side bar. `useSideBarStore()` (`@/stores/sidebar`) holds the view and whether it is
  open, which this browser remembers. A new view is a `SideView` in `components/sidebar/frame.ts` (its
  icon, its name, whose it is, the path of its pages) and a component for its body. On a phone there is
  no activity bar: three lines at the header's left (`Expand`, an outlined icon, 20 px in a 44 px
  button named 「選單」) open the views in a drawer, with the wordmark (`AppWordmark`) at its top and
  the views as tabs under it (the course the page is in with its tabs under it), and following a link
  in it closes it, as back does.
- The account is one menu button, as an editor's Accounts (`src/components/sidebar/AccountMenu.vue`): the
  initial of the caller's name at the bottom of the activity bar (on a phone, a row at the bottom of the
  side menu). Its menu says who is signed in (name, email or login ID, platform role) and holds the
  account's settings, the language and the theme, each a submenu with the choice in use checked, About AIshie
  (`AboutDialog`: the web app's version from `/version.json` and the server's from `/healthz`, the only place
  either is shown; the sign-in page names none; `append-to-body`, as the activity bar's sticky layer would
  hold it under the side bar and the header, and focus returns to the account button as it closes) and
  signing out. It works from the keyboard as a menu does (the arrow keys, Home and End; ArrowRight into a
  submenu and ArrowLeft out; Escape or Tab closes it, back on its button). The header holds the page's
  title (on a course's pages, the way up to it: the course and the tab) and, at its right end, the
  chat's button (on a phone, the menu's button before the title and no chat's button): nothing else
  is offered there.
- A tab left open runs the build it loaded. While it is shown, `useNewVersion` (`NewVersionNotice`,
  mounted by `AppLayout`) reads `index.html` again (`cache: 'no-store'`) every five minutes and when the
  tab is shown again, and compares the entry script it names (`/assets/index-<hash>.js`) with the one
  this page loaded; another one is a small notice, 「已有新版本」, with Reload and Later. It never reloads
  by itself: someone may be writing. It is off in development, and says nothing against the one build a
  preview serves.
- The chat with agents is one window over every signed-in page (`src/components/chat/ChatPanel.vue`,
  mounted by `AppLayout`), not a page of a course: every conversation in it is in a course and with an
  agent. Nothing runs along the window's right edge: the header and the page reach it. The chat's
  entry (`.app-chat-entry`, `#chat-panel-toggle`), with the count of answers not read in the indigo,
  is, from 900 px up, an icon button at the header's right end (`.app-header__chat`), with a tooltip
  saying its shortcut: nothing floats over the page, whose rows keep their actions, times and status
  at their right end in sight. It stays while the chat is open (`aria-expanded`, on the indigo's
  tint), and pressed again minimizes it. On a phone (up to 899 px) it is a 48 px round button
  floating at the bottom right (`.app-chat-fab`), 16 px from the screen's edges and above the safe
  area, in the thumb's reach: it slides out of the way while the page is scrolled down and comes back
  as soon as it is scrolled up, reaches its top, or the button takes focus (at once, with no slide,
  where motion is reduced), and the page keeps room below its last item for it (`.has-chat-fab`,
  88 px and the safe area), so that a list's last item, its pages or a button are never under it; a
  page that pins something to the bottom of the screen keeps it clear of the button too, and so does
  a toolbar whose action at its right end would be under it when the page opens (`.has-chat-fab`
  `.grades-view__post`: the button's column kept clear). The
  activity bar holds only the side bar's views. The button opens the chat in its corner (a phone's
  button is gone while the sheet is open); Ctrl/⌘+J opens it too. It is a window over the page, not docked beside it: it takes nothing from the page's
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
  either way focus goes back to the chat's button. Files dropped anywhere on the window, its title bar
  too, go to the conversation it shows, as below. On a phone (up to 899 px) it is a sheet over the whole
  screen, a modal dialog with no edge to drag, closed with its one button, Escape or back, keeping what it
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
  (`ChatPane.vue`) is laid out as an editor's agent chat: one header row with the agent (its avatar, name
  and "AI"; only the course and the name give way to a narrow panel), whether it can be asked now
  (`AskableText`) and, only once it is closed, its state, and a ⋯ menu for who can
  read it, how its answers arrive, and to download it as a PDF, every message read back to the first
  (nothing ends a conversation from the chat); the messages; and
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
  it is and its size, the person's over their bubble and the agent's under its words; a click opens
  it in the file viewer (`attachmentPreviewFiles`), among the message's others, and the button on
  the card asks for a fresh URL (`conversation.attachment`) and saves it under its name
  (`downloadAttachment`: through this origin with the download attribute, an object store's in a tab
  of its own). A small
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
- **What an answer relied on** (its `sources`, AIShie-Core#69, `MessageSource`) is under its words
  and files (`ChatMessageSources`, each source a `ChatMessageSource`), as Core shows it to the reader
  now: one named on a quiet line (「依據：《title》· lecture2.pdf · 第3頁」: Core takes a page or a
  slide only with a `file_id`, so the file is always named before it), several summed up by the
  first with a title and how many, the line opening to list them; a title with no spaces (one taken
  from a file's name) breaks anywhere, in the summary as on the line, so that nothing in the chat
  scrolls sideways. A whole source opens the version read: with a file, that file in the viewer
  among the version's (`document.get` with its `version_id`, read on the click), at the page or
  slide named (`openPreview`'s `page`, which `PdfView` opens at, a slide's in its PDF); without
  one, the document's page at `?version=`. `other_version` is a version the reader may not open,
  older or newer than the one they may (a draft, or one published before an earlier one was
  published again): it is "another version" (「另一個版本」), never an earlier one, and its link,
  to the document as it is now, says so beside it, not only in its tooltip ("(opens it as it is
  now)", 「（開啟的是目前的版本）」); `restricted` is said to be a course material the reader cannot
  open, with no title and no link. An empty list is the neutral pill 「未引用課程教材」, which takes
  focus and says that the agent said so in a tooltip on hover, focus or a tap; no `sources` (or
  `null`) is an answer that did not say, and shows nothing. A proposed answer keeps its sources by
  id alone: the queue and the action's page count the course materials, each `document_id` once
  (two pages of one lecture are one material), on a line whose tooltip, on hover, focus or a tap,
  says each is checked again on approval (`AnswerSources`).
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
  namespace, in each of the three languages the app offers (`LOCALES` in `src/i18n/index.ts`):
  `src/i18n/messages/en/<ns>.ts`, `src/i18n/messages/zh-Hant/<ns>.ts` and
  `src/i18n/messages/zh-Hans/<ns>.ts`, all exporting the same key tree (the file name is the
  namespace: `t('members.add.title')`); `npm run check:i18n` fails on a key or a placeholder one of
  them lacks. Traditional Chinese is written for Hong Kong / Taiwan readers (繁體中文), not
  machine-literal. Simplified Chinese (简体中文) is written in the Mainland's own wording, not
  converted from the Traditional character by character: 保存, 创建, 搜索, 智能体, where the
  Traditional has 儲存, 建立, 搜尋, 代理.
- Which language a page is in is chosen by the reader (the account menu's *Language*, or the
  select on the sign-in, `/welcome`, `/join/<token>` and change-password pages), remembered in this
  browser (`aishie.locale`), and at first is the browser's (`localeForTag`: `zh-Hant` or `zh-Hans`
  as its tag's script says, or else by its region, Traditional for TW, HK and MO and Simplified
  otherwise; English for anything not Chinese). The language is `useUiStore().locale`: the menu and
  the selects all set it, and code that changes the language sets it too, never calling `setLocale`
  itself. The store's watcher calls `setLocale`, which switches vue-i18n, dayjs, Intl's numbers,
  `<html lang>` and the typefaces it chooses (`styles/tokens.css`, `styles/fonts.ts`) and saves
  `aishie.locale`. Element Plus follows the same `ui.locale` through `App.vue`'s
  `<el-config-provider>` (`elementLocale` in `i18n/elementPlus.ts`), as does the menu's check mark.
- Shared words are in `common` (`common.actions.save`, `common.labels.status`, …) and Core's
  vocabularies in `enums` (`enums.perm.grade_submit`, `enums.actionStatus.proposed`, …). Use them
  rather than repeating them.
- One word for an agent in each language, and one for each of its two kinds: 代理, 課程代理, 個人代理
  (zh-Hant); 智能体, 课程智能体, 个人智能体 (zh-Hans); agent, course agent, personal agent (English).
  Never 助手, 助理, 小幫手, assistant or helper for an agent: the role `assistant` (助理, Assistant) is
  Core's name for a seat's role, which a person may hold too. The names people give their agents are
  theirs, and are shown as given.
- Examples in placeholders and hints name no real school: ids such as `school-adfs` or
  `university-sso`, emails such as `name@example.edu`, domains such as `example.edu`. Tests and
  their fixtures use the same, so that none is copied into the page from them.
- Core's error messages are English and are shown as they are, after a translated lead
  (`errorMessage()` does this).
- **Say what happens, not what does it.** No message names Core, the runtime, a tool (`actor.list`), a field of
  an answer (`details.reason`) or a setting of the server (`OCR=off`, `SECRETS_KEY`, `runtime.yaml`): a teacher
  who has never heard of Core takes it for a second authority deciding behind the first. Say what happens: "the
  system checks the permissions again" (「系統會再檢查一次權限」), "the agent service" (「執行環境」, 「运行环境」),
  "The server has turned this off; ask the server's operator" (「伺服器已停用此功能，請聯絡伺服器營運者」), "This
  server cannot … yet". What only the server's operator acts on (a setting, a command) goes in a tooltip beside
  the words: `<OperatorDetail :text>` (`src/views/admin/components`), its text in `runtimeAdmin.flags` or
  `ssoAdmin.flags`. The one exception is a task only the operator does, whose steps are the command and the
  path they follow (issuing the agent service's credential by hand, `AgentRuntimeCard`): those stay inline, in
  `<code>`. `src/i18n/copy.spec.ts` scans every message in every language for these words (a dotted or an
  underscored tool name, a setting or a family of them such as `OIDC_*`); a message only an operator reads, or
  one that sets up an agent's MCP client, is let through there by its key, saying why.
- **No punctuation in templates.** What joins words is the language's, so it is in the messages:
  "(you)" after a name is `common.labels.youTag` (「（你）」, with the `app-you` class), a label and
  its value `common.pair` ("Model calls: 380", 「模型呼叫：380」; `<i18n-t keypath="common.pair">`
  where the value is a component). Numbers go through `@/utils/format`: a percentage through
  `formatPct` (a fraction; the gradebook's `formatPct` for a percentage Core worked out), money
  through `formatMoney` ("US$0.0184": a "$" alone reads as Hong Kong's), a list through
  `formatList` ("a, b, and c", 「甲、乙和丙」), never `"%"` written after a number nor
  `.join(', ')`. The dot between a course's code and its section is `<span class="app-sep">·</span>`
  with no spaces, so that a Chinese typeface does not make it a full-width one.
- **Chinese messages put no space around a placeholder** beside a Han character: 「{owner}的代理」,
  never 「{owner} 的代理」, nor around a figure written in the message: 「1個學期 | {n}個學期」, never
  「1 個學期」 (`src/i18n/spacing.spec.ts` refuses both). The page puts the room between Han
  and Latin letters or figures itself (`text-autospace` under `html:lang(zh)`, `styles/main.css`),
  which also keeps a paragraph from leaving one character alone on its last line (`text-wrap`).
  Small capitals' tracking (a side bar's headings) is 0 in Chinese.
- Some vocabularies are keyed by Core's own dotted names (`enums.event`: `grade.posted`, …).
  vue-i18n splits a key path on dots, so look those up with a bracketed segment:
  ``t(`enums.event['${type}']`)``.

## Files each part owns

The shared foundation — `src/api/**`, `src/stores/**`, `src/composables/**`, `src/utils/**`,
`src/components/**`, `src/layouts/**`, `src/router/**`, `src/i18n/index.ts`,
`src/i18n/messages/*/{common,enums,layout,auth,home}.ts` — changes only on purpose, for every part
at once. A part keeps its own components next to its views (`src/views/<area>/components/…`).
