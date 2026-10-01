// Exporting conversations for audit (匯出對話): the administration page that
// exports them (conversation.export) and gives their files again
// (conversation.export_file).
export default {
  title: 'Export conversations',
  subtitle:
    'Take conversations away for audit, as JSON Lines and CSV files: a course’s, a department’s or the whole site’s.',
  subtitleDept:
    'Take conversations away for audit, as JSON Lines and CSV files: those of a course or department you administer.',

  form: {
    title: 'What to export',
    intro:
      'An export holds every message of the conversations it chooses, withdrawn ones with their text and marked so; what files each message carries, described but not included; and the answers and questions proposed and never posted. Each export is recorded: who made it, when, and what it chose.',
    scope: 'Conversations of',
    course: 'Course',
    department: 'Department',
    departmentPlaceholder: 'Choose a department',
    departmentHint: 'Its courses, and those of every department beneath it.',
    siteHint: 'Every conversation, in every course on the site.',
    participant: 'Participant (optional)',
    participantHint:
      'Only the conversations this person asked in, or this agent answered. Find them by name, email or student/staff number, or paste their ID.',
    participantHintDept:
      'Only the conversations this person asked in, or this agent answered. Find a person by their whole email or student/staff number; paste an agent’s ID.',
    from: 'From (optional)',
    to: 'Up to and including (optional)',
    anyStart: 'From the beginning',
    anyEnd: 'Up to now',
    zone: 'Days are on your calendar, in {zone} (UTC{offset}): from midnight as the first day starts to midnight as the last one ends.',
    zoneOffset:
      'Days are on your calendar (UTC{offset}): from midnight as the first day starts to midnight as the last one ends.',
    sent: 'Sent as',
    submit: 'Export',
    exporting: 'Exporting…',
  },

  // What an export is about.
  scope: {
    course: 'A course',
    department: 'A department',
    site: 'The whole site',
  },

  // The days an export chose, in words.
  span: {
    all: 'Everything written, whenever it was.',
    from: 'What was written from {from} on.',
    to: 'What was written up to and including {to}.',
    both: 'What was written from {from} up to and including {to}.',
  },

  problem: {
    course: 'Choose a course.',
    department: 'Choose a department.',
    dates: 'The last day comes before the first.',
  },

  // An export asked for in this tab, which got no answer before the page was left.
  pending: {
    title: 'An export asked for at {time} got no answer',
    body: 'The form shows what it chose. Export again to get it: the server gives the export it made rather than exporting twice.',
    discard: 'Start afresh',
  },

  running: {
    title: 'Exporting',
    elapsed: 'Under way for {time}.',
    note: 'A large export can take a few minutes. You may go to another page and come back: it carries on, and what came of it shows here. If the connection drops, export again with the same choices: the server gives what it made rather than exporting twice.',
  },

  outcome: {
    title: 'Exported',
    replayed: 'Given again',
    recorded: 'Recorded as action {id}: who made it, when, and what it chose.',
  },

  privacy: {
    title: 'These files hold personal data',
    body: 'They hold what people wrote, withdrawn messages included, under their names. Keep them only where your institution’s rules allow, and give them to nobody who should not read them. Each download link works for about 15 minutes, and the page gets a new one when it is needed. The files are deleted from the server at {time}, and cannot be downloaded after that.',
  },

  refused: {
    title: 'Not exported',
    noAnswer: 'No answer from the server',
    noAnswerBody:
      'The export may still be under way, or done. Export again with the same choices: the server gives what it made rather than exporting twice.',
  },

  // Ways to narrow an export Core refused as too large.
  tooLarge: {
    course: 'Export one course rather than a department or the whole site.',
    participant: 'Keep to one participant.',
    days: 'Keep to fewer days.',
  },

  // Core's refusals, by reason (details.reason), and what was not found.
  refusal: {
    export_too_large:
      'This export would hold {messages} messages and {text} of text in {conversations} conversations, past the limits of {maxMessages} messages and {maxText}. Narrow it:',
    department_out_of_scope:
      'That course or department is not in the departments you administer, or no longer is. Choose one at or beneath your appointments.',
    platform_role_required:
      'Only the site’s administrators export conversations, and a department’s administrators those of its courses, by naming one of their courses or departments. The whole site is a platform administrator’s to export.',
    people_only: 'Conversations are exported by a person, who answers for taking them away: an agent exports none.',
    export_expired:
      'This export’s files have been deleted, as every export’s are a while after it is made. Export again.',
    no_file_storage: 'This server keeps no files, so nothing can be exported. Its operator can set up a file store.',
    notFound: 'The course, department or participant chosen does not exist, or no longer does.',
    fileNotFound: 'This export is not one of yours, or no longer exists.',
    proposed: 'The server did not carry out the export at once, so nothing was exported.',
  },

  recent: {
    title: 'Recent exports',
    note: 'Exports you made in this browser whose files are still kept, to download again. The files hold personal data; each link works for about 15 minutes.',
    forget: 'Take off this list',
    gone: 'That export’s files have been deleted, so it is off the list.',
  },

  files: {
    format: {
      jsonl: 'JSON Lines',
      csv: 'CSV',
    },
    about: {
      jsonl: 'The conversations, one to a line, each with its messages and proposals: for a program to read.',
      csv: 'The messages, one to a row, withdrawn ones marked: opens in a spreadsheet, Chinese text included.',
    },
    checksum: 'Checksum',
    download: 'Download {format}',
    linksLive: 'The download links work for another {time}.',
    linksExpired: 'The download links have expired.',
    linksNone: 'Each download asks the server for a new link.',
    refresh: 'Get new links',
    deleted: 'The files have been deleted from the server.',
  },

  summary: {
    site: 'The whole site',
    scoped: '{kind}: {label}',
    participant: 'Participant: {who}',
    conversations: 'Conversations',
    messages: 'Messages',
    withdrawn: '{n} withdrawn',
    proposals: 'Proposals never posted',
    attachments: 'Files described',
    text: 'Text',
    asOf: 'Made',
    expiresAt: 'Files deleted',
  },

  course: {
    placeholder: 'Find a course by its code or title, or paste its ID',
    notFound: 'There is no course with this ID that you administer.',
    none: 'There are no courses to choose from.',
    noMatch: 'No course matches.',
    typeMore: 'Showing the first {n} matches: type more to narrow them.',
    pasteId: 'Only the first {n} courses are searched: paste the ID of one past them.',
  },

  participant: {
    placeholder: 'Anyone: find a person or agent by name, email or number',
    placeholderId: 'Anyone: paste a person’s or agent’s ID',
    pasteId: 'Paste their ID to find them.',
    noMatch: 'Nobody matches.',
    lookupPlaceholder: 'Whole email, student/staff number, or an ID',
    find: 'Find',
    invalid: 'Give a whole email address, a whole student or staff number, or an ID.',
    notFound: 'Nobody is registered as {who}.',
    byId: 'ID {id}',
    byIdShort: 'By ID',
    clear: 'Anyone instead',
  },
}
