// The chat with the courses' agents: the panel beside every page, and a conversation in it.
export default {
  panel: {
    title: 'Chat',
    toggle: 'Chat with agents',
    toggleUnread: 'Chat with agents: {n} unread',
    toggleTip: 'Chat with agents ({key})',
    course: 'Course',
    new: 'New chat',
    newTip: 'New conversation',
    history: 'History',
    close: 'Close the chat',
    // The window's title bar: minimized, it opens again on what it showed; closed, on a new conversation.
    minimize: 'Minimize the chat',
    // Its left edge and its top, which resize it.
    width: 'Width of the chat window',
    height: 'Height of the chat window',
    backToHistory: 'Back to the history',
    backToAgents: 'Back to the agents',
    pickTitle: 'Ask an agent',
    pickHint: 'The agents you can ask in {course}: the course’s own, and your personal assistant.',
    noCourses: 'None of your courses lets you ask agents questions.',
  },
  history: {
    title: 'Your conversations',
    scope: 'Which courses',
    thisCourse: 'This course',
    allCourses: 'All courses',
    empty: 'You have not asked an agent anything in this course yet.',
    emptyAll: 'You have not asked an agent anything yet.',
    untitled: 'Untitled',
    unread: 'New answer',
    moreFailed: 'Could not load more of them. Try again.',
    // Searching the history (title and agent), and its groups by last activity.
    search: 'Search titles and agents',
    noMatch: 'No conversation matches “{q}”.',
    searchLoaded: 'Only the conversations loaded are searched: load more to search them too.',
    groups: {
      today: 'Today',
      yesterday: 'Yesterday',
      week: 'This week',
      earlier: 'Earlier',
    },
  },
  respondents: {
    empty: 'No agent here answers your questions yet.',
    offlineHint: 'Nothing seems to be running this agent now: an answer may take a while.',
    sharedHint: 'It answers other members too, holds what each one writes, and may repeat it to them.',
  },
  between: '{opener} → {respondent}',
  messagesLabel: 'Messages',
  older: 'Earlier messages',
  olderFailed: 'Could not load them. Try again.',
  empty: {
    opener: 'Nothing has been written yet. Ask {name} your question below.',
    other: 'Nothing has been written yet.',
  },
  // The line in the messages while an answer is awaited: the agent at work, and for how long.
  status: {
    thinking: 'Thinking…',
    seconds: '{s}s',
    minutes: '{m}m {s}s',
  },
  typing: 'Waiting for {name}…',
  held: 'Waiting for approval: it appears here once someone approves it.',
  myActions: 'My actions',
  trouble: 'Having trouble reaching the server; still trying…',
  new: {
    intro: 'Start a conversation with {name}. Your first message opens it.',
    yourAgent: 'This is your own agent: it acts for you, and never with more than your seat.',
  },
  proposed: {
    title: 'Waiting for approval',
    body: 'Your conversation with {name} starts once someone approves it. You can follow it in My actions.',
  },
  // What the line above the composer says.
  state: {
    waitingApproval: 'Each answer waits for someone’s approval before you see it.',
    answerPending: 'An answer is waiting for approval.',
    withdrawn: 'You withdrew your question: {name} will not answer it.',
    start: 'Ask {name} anything about the course.',
    overseeing: 'You are reading this as course staff.',
    readOnly: 'Agents answer questions in the chat now: you can read this conversation.',
  },
  // Why an answer may not come.
  availability: {
    gone: '{name} is no longer in the course. Start a new conversation with someone else.',
    paused: '{name} is paused in this course and cannot answer now.',
    notAnswering: '{name} is not answering questions now.',
  },
  blocked: {
    archived: 'This course is archived: nothing more can be written.',
  },
  closed: {
    title: 'This conversation is closed.',
    said: 'They said: “{reason}”',
    startNew: 'Start a new conversation',
  },
  composer: {
    label: 'Your message',
    askPlaceholder: 'Ask {name}…',
    send: 'Send',
    sendTip: 'Send (Enter) · Shift+Enter for a new line',
    stop: 'Stop',
    stopTip: 'Stop: withdraw the question, back into the box',
    // The list a slash opens (commands), and what the empty box hints at.
    commands: 'Commands',
    hintCommands: '/ for commands',
    hintMentions: "{'@'} to cite an assignment or material",
    count: '{n} / {max} characters',
  },
  // Files a message carries: attached in the composer (the paperclip, dropped on the chat panel, or pasted),
  // each uploaded at once, as a chip; and in the messages, each with its icon, name, size and a download.
  attach: {
    button: 'Attach files',
    buttonTip: 'Attach files: up to {n}, {size} each',
    full: 'A message carries at most {n} files',
    chips: 'Files to send',
    dropHere: 'Drop to attach to your message',
    // The empty box, once files are attached: it invites the question; and sending them with no words asks for one.
    placeholder:
      'What would you like {name} to do with this file? | What would you like {name} to do with these files?',
    needText:
      'Add a line to go with the file, so {name} knows what you want: a question, or what to look at. | Add a line to go with the files, so {name} knows what you want: a question, or what to look at.',
    waiting: 'Waiting for the files to upload…',
    failed:
      'A file did not upload: try it again, or remove it, to send. | Some files did not upload: try them again, or remove them, to send.',
    tooLarge:
      'A file is too large to send: remove it to send the rest. | Some files are too large to send: remove them to send the rest.',
    tooMany:
      'A message carries at most {max} files: one was left out. | A message carries at most {max} files: {skipped} were left out.',
    folders:
      'A folder cannot be attached: attach the files in it instead. | Folders cannot be attached: attach the files in them instead.',
    again: 'They are being uploaded again: send once more when they are.',
    reattach: 'Its files were withdrawn with it: attach them again to send them.',
    readded: 'Its files are back in the box, uploading again.',
    // In a message.
    list: 'Attached files',
    download: 'Download “{name}”',
    downloadTip: 'Download',
    held: 'With {n} file: {names} | With {n} files: {names}',
    // Core's refusals because of a message's files, or of a file (details.reason).
    refusal: {
      too_many_attachments: 'A message carries at most {max_files} files: remove some, and send again.',
      bad_filename:
        'A file’s name cannot be sent as it is: it is too long, or holds a character a name may not. Rename the file, and attach it again.',
      duplicate_attachment: 'The same file is attached twice: remove one, and send again.',
      attachments_need_body: 'Files go with a message: write a line to go with them.',
      bad_upload_token: 'An upload was not recognised.',
      not_your_upload: 'An upload was not yours to attach.',
      already_attached: 'The files were sent with a message already.',
      not_uploaded: 'A file had not finished uploading.',
      upload_too_old: 'The files were uploaded too long ago to wait for approval.',
      file_too_large: 'A file is larger than a message may carry ({max}): remove it, or attach a smaller one.',
      conversation_attachments_full:
        'This conversation holds as many files as it can ({max_total} in all): start a new conversation to send more.',
      no_file_storage: 'This site has nowhere to keep files, so none can be sent: ask its administrator.',
      retracted: 'This file was withdrawn with its message.',
      not_a_member: 'You no longer have a seat in this course, so no files can be sent in it.',
      membership_not_active: 'Your seat in this course is paused or has ended, so no files can be sent in it.',
      permission_denied: 'Your seat in this course may not send files in the chat.',
      course_archived: 'This course is archived: nothing more can be sent in it.',
    },
  },
  // What a slash at the start of the box offers.
  commands: {
    new: 'New conversation',
    history: 'Conversation history',
  },
  // What an @ offers: the course's assignments and materials, whose title it writes in, quoted.
  mention: {
    label: 'Assignments and materials',
    insert: '“{title}” ',
    loading: 'Loading assignments and materials…',
    none: 'No assignment or material has “{q}” in its title.',
    empty: 'This course has no assignments or materials you can see yet.',
    kind: {
      assignment: 'Assignment',
      material: 'Material',
    },
  },
  // A new conversation's first words, offered to start with; a click puts them in the box.
  suggestions: {
    title: 'Try asking',
    explainAssignment: 'Explain what this assignment asks for',
    checkReasoning: 'Check my reasoning',
    summarizeWeek: 'Summarise this week’s materials',
    practice: 'Give me a few practice questions',
  },
  // An answer in the making (the draft: ChatDraft, ChatDraftSteps): the agent's steps, running and done, with
  // what each works on (target) or without, and the answer's text, or that it shows once confirmed.
  draft: {
    consulted: 'Consulted {n} item | Consulted {n} items',
    stepsLabel: 'What the agent is doing',
    done: 'done',
    running: 'under way',
    hidden: 'The answer shows once someone confirms it.',
    steps: {
      thinking: {
        running: 'Thinking…',
        done: 'Thought',
        runningTarget: 'Thinking: {target}…',
        doneTarget: 'Thought: {target}',
      },
      reading_document: {
        running: 'Reading a document…',
        done: 'Read a document',
        runningTarget: 'Reading “{target}”…',
        doneTarget: 'Read “{target}”',
      },
      listing_documents: {
        running: 'Looking through the materials…',
        done: 'Looked through the materials',
        runningTarget: 'Looking through {target}…',
        doneTarget: 'Looked through {target}',
      },
      reading_assignment: {
        running: 'Reading an assignment…',
        done: 'Read an assignment',
        runningTarget: 'Reading the assignment “{target}”…',
        doneTarget: 'Read the assignment “{target}”',
      },
      reading_submission: {
        running: 'Reading a submission…',
        done: 'Read a submission',
        runningTarget: 'Reading the submission “{target}”…',
        doneTarget: 'Read the submission “{target}”',
      },
      searching_memory: {
        running: 'Searching its memory…',
        done: 'Searched its memory',
        runningTarget: 'Searching its memory for “{target}”…',
        doneTarget: 'Searched its memory for “{target}”',
      },
      writing: {
        running: 'Writing the answer…',
        done: 'Wrote the answer',
        runningTarget: 'Writing: {target}…',
        doneTarget: 'Wrote: {target}',
      },
      tool: {
        running: 'Using a tool…',
        done: 'Used a tool',
        runningTarget: 'Using {target}…',
        doneTarget: 'Used {target}',
      },
    },
  },
  conflict: {
    closed: 'This conversation is closed, so nothing more can be written in it.',
  },
  // Who can read a conversation (Core's visible_to).
  visibleTo: {
    button: 'Who can read this',
    title: 'Who can read this conversation',
    participants: 'The two taking part',
    overseers: 'Course staff who decide actions for the one who started it',
    actionRecord: 'Anyone who decides actions in this course, in the record of each message',
    respondentAnswersOthers:
      'The one answering here answers other members too: it holds what each of them writes, and may repeat to them what is written here',
    auditExport:
      'The site’s administrators, and those of the course’s department, who may export it for audit, withdrawn messages included',
    sharedNote: 'It answers other members too: what you write here it may repeat to them.',
    note: 'Every message is written through an action, and the record of it keeps the text, even after it is withdrawn.',
  },
  message: {
    retract: 'Withdraw',
    // Under a message, on hover: copy it (as Markdown), and take the question awaiting its answer back to edit it.
    copy: 'Copy message',
    edit: 'Edit',
    editTip: 'Withdraw this question and put it back in the box, to change and send again',
    retractedByYou: 'You withdrew this message.',
    retractedBy: '{name} withdrew this message.',
    retractedByStaff: 'Course staff withdrew this message.',
    reason: 'Reason: {reason}',
  },
  reasonPlaceholder: 'Reason (optional)',
  reasonTooLong: 'At most {max} characters',
  // The ⋯ menu in a conversation's header: who can read it, how its answers arrive, closing it.
  menu: {
    label: 'Conversation options',
  },
  // A question awaiting its answer, taken back to the composer: to edit it, or to stop waiting.
  edit: {
    done: 'Your question was withdrawn and put back in the box: change it and send it again. {name} does not answer a withdrawn question, and stops an answer it had begun.',
  },
  stop: {
    done: 'Stopped: your question was withdrawn and put back in the box. {name} does not answer a withdrawn question, and stops an answer it had begun.',
  },
  retract: {
    title: 'Withdraw this message?',
    bodyMine: 'Its text will no longer be shown here. The record of the action that wrote it keeps the text.',
    bodyStaff:
      'The message from {name} will no longer be shown here. The record of the action that wrote it keeps the text.',
    confirm: 'Withdraw',
    done: 'Message withdrawn',
  },
}
