export default {
  title: 'Materials',
  hintReader: 'The course material that has been published, in the order it is meant to be read.',
  hintDrafts: 'You also see material that is not published yet. Students see only what is published.',
  newMaterial: 'New material',
  includeArchived: 'Show archived',
  empty: 'No material has been published yet.',
  emptyDrafts: 'No material yet.',
  sortOrder: 'Sort order',
  added: 'Added',
  published: 'Published',
  unpublished: 'Not published',
  purged: 'Purged',
  pendingLink: 'See my actions',
  dropHint: 'Drop files anywhere on this page to add each one as new material.',
  dropHere: 'Drop to add each file as new material',
  pending: {
    create: '“{title}” was sent for approval. It will appear here once someone approves it.',
    createPublish: 'Publishing is not part of that proposal: once it is approved, open the material and publish it.',
    createMany: '{n} materials were sent for approval. They will appear here once someone approves them.',
  },
  create: {
    title: 'New material',
    name: 'Title',
    namePlaceholder: 'e.g. Week 3 — Loops',
    sortOrder: 'Sort order',
    sortOrderHint: 'Material is listed by this number, lowest first.',
    body: 'Text',
    publish: 'Publish at once',
    publishHint:
      'Students can read it straight away. Otherwise it stays a draft, seen only by members who can read drafts, until it is published.',
    publishNeedsContent: 'Write some text first: an empty document has nothing to publish.',
    emptyNote: 'With neither text nor a file, an empty document is created; give it content later by adding a version.',
    dropLabel: 'Files for new material: drop them here, or press Enter to choose them',
    writeInstead: 'Write text instead',
    uploadInstead: 'Upload files instead',
    titleOf: 'Title for “{name}”',
    sortOrderMany: 'Each file becomes material of its own, numbered on from this one in the order listed.',
    publishNeedsFile: 'Upload a file first: there is nothing to publish yet.',
    waitForUploads: 'Waiting for one upload to finish… | Waiting for {n} uploads to finish…',
    noFiles: 'Drop or choose a file, or write text instead.',
    untitled: 'Give each file a title.',
    leftOut:
      'One file was not uploaded: it is left out unless it is tried again. | {n} files were not uploaded: they are left out unless they are tried again.',
    submitMany: 'Create {n} materials',
    doneMany: 'Material created | {n} materials created',
    donePublishedMany: 'Material created and published | {n} materials created and published',
    approvalNote:
      'Writing material needs approval here: this is sent as a proposal, and nothing is created until someone approves it.',
    submit: 'Create',
    done: 'Material created',
    donePublished: 'Material created and published',
    notPublished: 'The material was created but not published. Open it to publish it.',
  },
  document: {
    title: 'Document',
    versionShort: 'v{seq}',
    version: 'Version {seq}',
    latest: 'Latest',
    published: 'Published',
    notPublished: 'Not published',
    created: 'Created',
    kind: 'Kind',
    status: 'Status',
    sortOrder: 'Sort order',
    file: 'File',
    downloadFile: 'Download the file',
    checksum: 'Checksum',
    noText: 'This version has no text; its content is the file.',
    noVersion: 'There is no version of this document that you can read.',
    emptyDoc: 'This document has no content yet.',
    addFirst: 'Add the first version',
    viewingOther: 'You are looking at version {seq}, which is not the current one.',
    viewingPinned:
      'This is version {seq}, not the one published now. You can still read it because a submission you can see was handed in under it.',
    showCurrent: 'Show the current version',
    about: 'About this document',
    usedBy: 'Used by',
    usedAs: {
      instructions: 'The instructions for {assignment}',
      rubric: 'The rubric for {assignment}',
    },
    notUsed: 'No assignment you can see refers to it.',
    unpublishedAssignment: 'not published',
    readers: {
      none: 'Nothing is published yet, so only members who can read drafts see this document.',
      other: 'This version is not published. Everyone who cannot read drafts reads version {seq}.',
      otherUnknown: 'This version is not published. Everyone who cannot read drafts reads the published version.',
      this: 'This is the published version: it is what everyone who may read this document sees.',
      unreleased: {
        instructions: 'Its assignment is not published yet: students see nothing of this until it is.',
        rubric:
          'Its assignment is not published yet: until it is, only members who can see unpublished assignments read this rubric.',
      },
    },
    archivedAlert:
      'This document is archived. It cannot be edited or published until it is brought back, and it is withdrawn from everyone who cannot read drafts; a version that someone’s submission was handed in under stays readable to them.',
    rules: {
      material:
        'Students read the published version. Members who can read drafts see the latest version and the history of every version.',
      instructions:
        'Instructions follow their assignment: students see them only once a published assignment refers to them, and read the published version. A submission stays pinned to the version that was published when it was handed in.',
      rubric:
        'A rubric is read only by members allowed to read rubrics, such as graders — not by students — and only once a published assignment refers to it. A grade stays pinned to the rubric version it was given under.',
    },
    owned: {
      submission:
        'This file was handed in with a submission. It has exactly one version and is managed with its submission.',
      feedback: 'This file is feedback on a grade. It has exactly one version and is managed with its grade.',
      openSubmission: 'Open the submission',
      openGrade: 'Open the grade',
    },
    actions: {
      newVersion: 'New version',
      publishThis: 'Publish this version',
      archive: 'Archive',
      details: 'Title and place',
      unarchive: 'Bring back',
      purge: 'Purge…',
    },
    versions: {
      title: 'Versions',
      hint: 'Versions are never changed. Publishing chooses which one is read, and can go back to an earlier one; only an administrator purges one uploaded by mistake, which leaves a tombstone.',
      empty: 'No versions yet.',
      text: 'Text',
      showing: 'Showing',
      view: 'View',
      publish: 'Publish',
    },
    publish: {
      title: 'Publish version {seq}?',
      body: {
        material: 'From now on, students read version {seq} of “{title}”.',
        instructions:
          'From now on, students read version {seq} of “{title}”. Work already handed in stays pinned to the version it was handed in under.',
        rubric:
          'From now on, those who read rubrics are given version {seq} of “{title}”. Grades already given stay pinned to the version they were given under.',
      },
      older: 'This is earlier than the latest version: publishing it moves what is read back to it.',
      unreleased:
        'Its assignment is not published yet: students see nothing until it is, and news of this goes only to those who can see unpublished work.',
      done: 'Version {seq} published',
      pending:
        'Publishing version {seq} was sent for approval. What is read now stays as it is until someone approves it.',
    },
    archive: {
      title: 'Archive “{title}”?',
      body: 'It disappears from lists and can no longer be edited or published until someone brings it back. Everyone who cannot read drafts loses access to it. Nothing is deleted: a version that someone’s submission was handed in under stays readable to them.',
      usedBy: 'The assignment “{assignment}” refers to it: those who cannot read drafts will no longer see it there.',
      done: 'Document archived',
      pending: 'Archiving was sent for approval. The document stays as it is until someone approves it.',
    },
    details: {
      title: 'Title and place of “{title}”',
      name: 'Title',
      sortOrder: 'Place in the list',
      sortOrderHint: 'Material is listed by this number, lowest first.',
      versionsKept:
        'Its versions stay exactly as they are: only what the document is called, and where it is listed, change.',
      done: 'Saved',
      unchanged: 'Nothing changed.',
      pending: 'The change was sent for approval. The document stays as it is until someone approves it.',
    },
    unarchive: {
      title: 'Bring back “{title}”?',
      body: 'It is back in lists and can be edited and published again, and its published version is read again by everyone who may read this kind of document.',
      done: 'Document brought back',
      pending: 'Bringing it back was sent for approval. It stays archived until someone approves it.',
    },
    purge: {
      title: 'Purge “{title}”',
      titleVersion: 'Purge version {seq} of “{title}”',
      intro:
        'For what was uploaded by mistake, such as someone’s personal data. The text and the file of every version are removed, and the files deleted from storage. The document is archived for good, and a tombstone says who purged it, when and why, to everyone who reads it.',
      introVersion:
        'The text and the file of version {seq} are removed, and the file deleted from storage. The version keeps its place in the history as a tombstone that says who purged it, when and why; if it is the published one, it stays so until another is published.',
      pinned: 'Work handed in under it still names it and reads the tombstone; grades are untouched.',
      irreversible: 'This cannot be undone: nothing purged can be brought back.',
      reason: 'Why',
      reasonPlaceholder: 'e.g. A student’s personal data was uploaded by mistake',
      reasonHint: 'Kept on the tombstone, and shown to whoever reads what was purged.',
      reasonLong: 'At most 500 characters',
      understand: 'I understand that this removes it for good',
      submit: 'Purge',
      done: 'Purged: {v} versions, {f} files deleted from storage.',
      adminOnly:
        'Only a platform administrator, or an administrator of the course’s department, purges anything: removing data is not a seat’s to do.',
      version: 'Purge this version',
    },
    tombstone: {
      tag: 'Purged',
      document: 'This document was purged {time} by {who}.',
      version: 'This version was purged {time} by {who}.',
      why: 'Why: {reason}',
      gone: 'Its text and its file are gone.',
      anAdministrator: 'an administrator',
      you: 'you',
    },
    approvalNote:
      'Writing material needs approval here: this becomes a proposal and takes effect only once someone approves it.',
    addVersion: {
      title: 'New version of “{title}”',
      introFrom:
        'Saving adds a new version; earlier versions stay exactly as they are. What is read does not change until a version is published. Starts from the text of version {seq}, the latest.',
      introEmpty:
        'Saving adds a new version; earlier versions stay exactly as they are. What is read does not change until a version is published. The document has no version yet.',
      body: 'Text',
      file: 'File',
      fileHint: 'Optional. A version holds text, a file, or both.',
      fileNotCarried:
        'Version {seq} has a file ({type}, {size}). A new version does not carry it over: upload it again to keep it. Saving without a file leaves it out of the new version.',
      publish: 'Publish this version at once',
      publishHint: 'Otherwise it stays a draft until someone publishes it.',
      unreleased: 'Its assignment is not published yet: news of this goes only to those who can see unpublished work.',
      needsContent: 'Give the version text or a file.',
      unchanged: 'Nothing has changed from version {seq}.',
      dropsFile: 'The same text as version {seq}, without its file.',
      submit: 'Save version',
      done: 'New version saved',
      donePublished: 'New version saved and published',
      pending: 'The new version was sent for approval. It will be added once someone approves it.',
      pendingPublish: 'The new version was sent for approval. Once approved, it is added and published.',
    },
    // A version's text version (文字版): its file transcribed into Markdown, or written by staff.
    text: {
      tabs: {
        content: 'Content',
        text: 'Text version',
      },
      source: {
        ai: 'AI transcription ({model})',
        aiNoModel: 'AI transcription',
        staff: 'Edited by {name} ({time})',
        staffUnknown: 'staff',
      },
      pages: 'One page | {n} pages',
      jumpTo: 'Go to a page',
      reading: 'Reading part {read} of {parts}…',
      actions: {
        refresh: 'Read it again',
        edit: 'Edit',
        write: 'Write the text version',
        retranscribe: 'Transcribe again',
        transcribe: 'Transcribe',
      },
      queued: {
        pending: 'Queued: this version’s file is waiting to be transcribed into text by AI.',
        working: 'Transcribing: AI is writing this version’s file out as text.',
        after: 'The text version shows here once it is done.',
      },
      failed: 'Transcription failed: {reason}',
      failedNoReason: 'Transcription failed.',
      skipped: 'Not transcribed: {reason}',
      skippedNoReason: 'Not transcribed.',
      none: {
        reader: 'This version has no text version.',
        staff: 'This version has no text version yet. You can write one yourself.',
        staffOld:
          'This version was added before there were text versions, and has none. Transcribe it, or write one yourself.',
        staffOff:
          'Transcription is not turned on for this site, so nothing is transcribed now. You can write the text version yourself.',
        staffFailed: 'Transcribe it again, or write the text version yourself.',
      },
      editor: {
        hint: 'Markdown, as it is shown to readers and given to the course’s agents. A heading for each page (## 第 1 頁) keeps the pages easy to find. What you save replaces the text version, and no later transcription writes over it.',
        save: 'Save the text version',
        done: 'Text version saved',
        unchanged: 'Nothing changed.',
        empty: 'Write the text first.',
        pending:
          'Your text version of version {seq} was sent for approval. The text version stays as it is until someone approves it.',
        changed:
          'The text version changed while you were editing it (it is at revision {revision} now). Your draft is kept here.',
        changedNoRevision: 'The text version changed while you were editing it. Your draft is kept here.',
        reload: 'Load the latest',
        reloaded:
          'The latest text version is loaded. Your draft is unchanged: saving it replaces the latest with your draft.',
        latest: 'See the latest text version',
        discardTitle: 'Discard your changes?',
        discardBody: 'What you wrote here is not saved.',
        discard: 'Discard',
        keep: 'Keep editing',
      },
      again: {
        title: 'Transcribe version {seq} again?',
        body: 'Its text version is cleared and queued to be transcribed by AI again: the version has no text version until that is done.',
        staffTitle: 'Discard the changes?',
        staffBody:
          'This text version was written or corrected by {name}. Transcribing it again discards those changes, and they cannot be brought back.',
        someone: 'staff',
        discard: 'Discard the changes',
        done: 'Queued to be transcribed',
        already: 'It is waiting to be transcribed already.',
        pending:
          'Transcribing version {seq} again was sent for approval. The text version stays as it is until someone approves it.',
      },
    },
  },
  // Core's refusals of changes to documents, by the reason it names.
  refusal: {
    purged: 'This document was purged: it stays archived, and nothing is added to it or brought back.',
    owned_file:
      'A submitted or feedback file belongs to its submission or grade, is archived with it, and is never purged.',
    already_purged: 'This has been purged already.',
    text_changed: 'The text version has changed since you read it: it has been read again.',
    staff_edit:
      'Staff have written this text version since: transcribing it again discards their changes, which has to be confirmed.',
    text_too_long: 'The text is too long: a text version holds at most 2 MiB of Markdown.',
    no_text: 'This version has no file to transcribe, so it has no text version.',
    document_archived: 'The document is archived: bring it back first.',
    course_archived: 'The course is archived: nothing in it changes.',
  },
}
