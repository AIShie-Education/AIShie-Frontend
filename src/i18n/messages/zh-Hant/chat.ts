// 與課程代理的對話：每個頁面旁的對話面板，以及其中的一段對話。
export default {
  panel: {
    title: '對話',
    toggle: '與代理對話',
    toggleUnread: '與代理對話：{n}則未讀',
    toggleTip: '與代理對話（{key}）',
    course: '課程',
    new: '新對話',
    newTip: '開始新對話',
    history: '過往對話',
    close: '關閉對話面板',
    // The window's title bar: minimized, it opens again on what it showed; closed, on a new conversation.
    minimize: '最小化對話視窗',
    // Its left edge and its top, which resize it.
    width: '對話視窗寬度',
    height: '對話視窗高度',
    backToHistory: '返回過往對話',
    backToAgents: '返回代理列表',
    pickTitle: '向代理提問',
    pickHint: '你在{course}可以提問的代理：課程自己的代理，以及你的個人代理。',
    noCourses: '你的課程都不允許你向代理提問。',
  },
  history: {
    title: '你的對話',
    scope: '課程範圍',
    thisCourse: '這個課程',
    allCourses: '所有課程',
    empty: '你還沒有在這個課程向代理提問。',
    emptyAll: '你還沒有向任何代理提問。',
    untitled: '未命名',
    unread: '新回覆',
    moreFailed: '無法載入更多對話，請再試一次。',
    // Searching the history (title and agent), and its groups by last activity.
    search: '搜尋標題或代理',
    noMatch: '沒有符合「{q}」的對話。',
    searchLoaded: '只搜尋已載入的對話：載入更多即可一併搜尋。',
    groups: {
      today: '今天',
      yesterday: '昨天',
      week: '本週',
      earlier: '更早',
    },
  },
  respondents: {
    empty: '這裡暫時沒有可以回答你問題的代理。',
    offlineHint: '這個代理目前似乎沒有在運行，回覆可能需要一段時間。',
    sharedHint: '它也會回答其他成員，會記住每個人寫給它的內容，並可能轉述給他們。',
  },
  between: '{opener} → {respondent}',
  messagesLabel: '訊息',
  older: '較早的訊息',
  olderFailed: '無法載入，請再試一次。',
  empty: {
    opener: '還沒有任何訊息。在下方向{name}提出你的問題吧。',
    other: '還沒有任何訊息。',
  },
  // The line in the messages while an answer is awaited: the agent at work, and for how long.
  status: {
    thinking: '思考中…',
    seconds: '{s}s',
    minutes: '{m}m {s}s',
  },
  typing: '正在等待{name}…',
  held: '等待批准中：獲批准後才會在這裡顯示。',
  myActions: '我的操作',
  trouble: '連線到伺服器時遇到問題，正在重試…',
  new: {
    intro: '開始與{name}對話。傳送第一則訊息即會開啟對話。',
    yourAgent: '這是你自己的代理：它代表你行事，權限永不超過你的席位。',
  },
  proposed: {
    title: '等待批准',
    body: '你與{name}的對話需經批准後才會開始。你可以在「我的操作」中查看進度。',
  },
  // What the line above the composer says.
  state: {
    waitingApproval: '每則回覆都須經批准，你才會看到。',
    answerPending: '有一則回覆正在等待批准。',
    withdrawn: '你撤回了問題，{name}不會回答它。',
    start: '有任何關於課程的問題，都可以問{name}。',
    overseeing: '你正以課程教職員的身分閱讀這段對話。',
    readOnly: '現在由代理在對話中回答問題，你可以閱讀這段對話。',
  },
  // Why an answer may not come.
  availability: {
    gone: '{name}已不在這個課程中。請改為與其他人開始新的對話。',
    paused: '{name}在這個課程中已被暫停，目前無法回覆。',
    notAnswering: '{name}目前不回答問題。',
  },
  blocked: {
    archived: '這個課程已封存，無法再發言。',
  },
  closed: {
    title: '這段對話已結束。',
    said: '對方表示：「{reason}」',
    startNew: '開始新的對話',
  },
  composer: {
    label: '你的訊息',
    askPlaceholder: '向{name}提問…',
    send: '傳送',
    sendTip: '傳送（Enter）· Shift+Enter 換行',
    stop: '停止',
    stopTip: '停止：撤回問題，放回輸入框',
    // The list a slash opens (commands), and what the empty box hints at.
    commands: '指令',
    hintCommands: '/ 指令',
    hintMentions: "{'@'}引用作業或教材",
    count: '{n} / {max}字',
  },
  // Files a message carries: attached in the composer (the paperclip, dropped on the chat panel, or pasted),
  // each uploaded at once, as a chip; and in the messages, each with its icon, name, size and a download.
  attach: {
    button: '附加檔案',
    buttonTip: '附加檔案：最多{n}個，每個最大{size}',
    full: '每則訊息最多附{n}個檔案',
    chips: '要傳送的檔案',
    dropHere: '放開即附加到你的訊息',
    // The empty box, once files are attached: it invites the question; and sending them with no words asks for one.
    placeholder: '想請{name}就這個檔案做些甚麼？',
    needText: '請寫一句話跟檔案一起傳送，讓{name}知道你想要甚麼：一個問題，或要看哪裡。',
    waiting: '正在等候檔案上傳完成…',
    failed: '有檔案未能上傳：重試或移除後才能傳送。',
    tooLarge: '有檔案太大，無法傳送：移除後才能傳送其餘的。',
    tooMany: '每則訊息最多附{max}個檔案：有{skipped}個未有加入。',
    folders: '資料夾無法附加：請改為附加裡面的檔案。',
    again: '正在重新上傳：完成後再傳送一次即可。',
    reattach: '它的檔案已隨之撤回：如要傳送，請重新附加。',
    readded: '它的檔案也已放回輸入框，正在重新上傳。',
    // In a message.
    list: '附件',
    download: '下載「{name}」',
    downloadTip: '下載',
    held: '附{n}個檔案：{names}',
    // Core's refusals because of a message's files, or of a file (details.reason).
    refusal: {
      too_many_attachments: '每則訊息最多附{max_files}個檔案：請移除一些再傳送。',
      bad_filename: '有檔案的名稱無法照樣傳送：名稱太長，或含有不可用的字元。請把檔案改名後再附加。',
      duplicate_attachment: '同一個檔案附加了兩次：請移除其中一個再傳送。',
      attachments_need_body: '檔案要跟訊息一起傳送：請寫一句話。',
      bad_upload_token: '有一個上傳無法識別。',
      not_your_upload: '有一個上傳不屬於你，不能附加。',
      already_attached: '這些檔案已經隨另一則訊息傳送過。',
      not_uploaded: '有檔案尚未上傳完成。',
      upload_too_old: '這些檔案上傳得太久，不能等候批准。',
      file_too_large: '有檔案超過訊息可附的大小（{max}）：請移除它，或改附較小的檔案。',
      conversation_attachments_full: '這個對話的檔案已達上限（共{max_total}）：如要傳送更多，請開始新對話。',
      no_file_storage: '本網站沒有設定存放檔案的地方，所以無法傳送檔案：請聯絡網站管理員。',
      retracted: '這個檔案已隨訊息撤回。',
      not_a_member: '你已不在這個課程，所以無法在此傳送檔案。',
      membership_not_active: '你在這個課程的席位已暫停或結束，所以無法在此傳送檔案。',
      permission_denied: '你在這個課程的席位不能在對話中傳送檔案。',
      course_archived: '這個課程已封存：不能再傳送任何內容。',
    },
  },
  // What a slash at the start of the box offers.
  commands: {
    new: '新對話',
    history: '對話紀錄',
  },
  // What an @ offers: the course's assignments and materials, whose title it writes in, quoted.
  mention: {
    label: '作業與教材',
    insert: '「{title}」',
    loading: '載入作業與教材…',
    none: '沒有標題含「{q}」的作業或教材。',
    empty: '這個課程還沒有你看得到的作業或教材。',
    kind: {
      assignment: '作業',
      material: '教材',
    },
  },
  // A new conversation's first words, offered to start with; a click puts them in the box.
  suggestions: {
    title: '可以這樣開始',
    explainAssignment: '解釋這份作業的要求',
    checkReasoning: '幫我檢查我的思路',
    summarizeWeek: '總結這週的教材',
    practice: '出幾道練習題給我',
  },
  // An answer in the making (the draft: ChatDraft, ChatDraftSteps): the agent's steps, running and done, with
  // what each works on (target) or without, and the answer's text, or that it shows once confirmed.
  draft: {
    consulted: '已查閱{n}項',
    stepsLabel: '代理正在做的事',
    done: '已完成',
    running: '進行中',
    hidden: '答案需經確認後才會顯示。',
    steps: {
      thinking: {
        running: '思考中…',
        done: '已思考',
        runningTarget: '思考中：{target}…',
        doneTarget: '已思考：{target}',
      },
      reading_document: {
        running: '正在閱讀文件…',
        done: '已閱讀文件',
        runningTarget: '正在閱讀《{target}》…',
        doneTarget: '已閱讀《{target}》',
      },
      listing_documents: {
        running: '正在查看教材列表…',
        done: '已查看教材列表',
        runningTarget: '正在查看{target}…',
        doneTarget: '已查看{target}',
      },
      reading_assignment: {
        running: '正在閱讀作業…',
        done: '已閱讀作業',
        runningTarget: '正在閱讀作業《{target}》…',
        doneTarget: '已閱讀作業《{target}》',
      },
      reading_submission: {
        running: '正在查看提交…',
        done: '已查看提交',
        runningTarget: '正在查看提交《{target}》…',
        doneTarget: '已查看提交《{target}》',
      },
      searching_memory: {
        running: '正在搜尋記憶…',
        done: '已搜尋記憶',
        runningTarget: '正在搜尋記憶：{target}…',
        doneTarget: '已搜尋記憶：{target}',
      },
      writing: {
        running: '正在撰寫回答…',
        done: '已撰寫回答',
        runningTarget: '正在撰寫：{target}…',
        doneTarget: '已撰寫：{target}',
      },
      tool: {
        running: '正在使用工具…',
        done: '已使用工具',
        runningTarget: '正在使用{target}…',
        doneTarget: '已使用{target}',
      },
    },
  },
  conflict: {
    closed: '這段對話已經關閉，不能再寫入任何內容。',
  },
  // Who can read a conversation (Core's visible_to).
  visibleTo: {
    button: '誰可以閱讀',
    title: '誰可以閱讀這段對話',
    participants: '對話雙方',
    overseers: '負責審批開啟者操作的課程教職員',
    actionRecord: '課程中任何負責審批操作的人，可透過每則訊息的操作紀錄閱讀',
    respondentAnswersOthers: '回答的一方也會回答其他成員：它會記住每個人寫的內容，並可能把這裡寫的內容轉述給他們',
    auditExport: '網站及課程所屬部門的管理員可匯出作稽核，包括已撤回的訊息',
    sharedNote: '對方也會回答其他成員：你在這裡寫的內容，它可能會轉述給他們。',
  },
  // Who reads a conversation and where an agent sends it (AIShie-Frontend#79; components/chat/privacy.ts):
  // a short line under the composer, its points on a new conversation the first time, the whole notice behind More.
  privacy: {
    more: '詳情',
    moreLabel: '詳情：誰會閱讀這段對話、內容會傳送到哪裡',
    title: '誰會閱讀，內容會傳送到哪裡',
    routeTitle: '內容會傳送到哪裡作答',
    keptTitle: '會保留甚麼',
    firstTitle: '提問之前',
    gotIt: '知道了',
    agentReaders:
      '課程中負責審批操作的代理亦可閱讀這段對話。它把讀到的內容傳送到哪裡，視乎它的託管方式：經 AIshie 的代理執行環境傳送至它的 AI 模型，或傳送至其擁有者自己的工具。',
    line: {
      model:
        '課程教職員、課程中負責審批操作的代理，以及網站和部門管理員，都可閱讀這段對話。{name}會把內容傳送至{provider}以作答。',
      modelFallback:
        '課程教職員、課程中負責審批操作的代理，以及網站和部門管理員，都可閱讀這段對話。{name}會把內容傳送至{provider}以作答；學校的模型無法作答時，則傳送至{fallbackProvider}。',
      runtime:
        '課程教職員、課程中負責審批操作的代理，以及網站和部門管理員，都可閱讀這段對話。{name}會把內容傳送至其 AI 模型的供應商以作答。',
      mcp: '課程教職員、課程中負責審批操作的代理，以及網站和部門管理員，都可閱讀這段對話。{name}經由其擁有者自己的工具作答。',
      unknown:
        '課程教職員、課程中負責審批操作的代理，以及網站和部門管理員，都可閱讀這段對話；內容會傳送至{name}的 AI 模型以作答。',
    },
    points: {
      readers: '課程教職員及課程中負責審批操作的代理可閱讀這段對話，網站及部門管理員亦可匯出作稽核。',
      model: '{name}會把你在這裡寫的內容傳送至其 AI 模型的供應商{provider}以作答。',
      modelFallback:
        '{name}會把你在這裡寫的內容傳送至其 AI 模型的供應商{provider}以作答；學校的模型無法作答時，則傳送至{fallbackProvider}。',
      runtime: '{name}會把你在這裡寫的內容傳送至其 AI 模型的供應商以作答。',
      mcp: '{name}由其擁有者自己的工具使用，這些工具可能把你寫的內容傳送至它們使用的任何 AI 服務。',
      unknown: '你在這裡寫的內容會傳送至{name}的 AI 模型以作答。',
      kept: '這裡的內容不會被刪除：你撤回的訊息會被隱藏，但仍會保留。',
    },
    route: {
      hosted:
        '{name}由 AIshie 託管。為了作答，AIshie 的代理執行環境會把這段對話的訊息、訊息附帶的檔案，以及{name}在課程中讀取的內容傳送至它的 AI 模型。',
      school: '該模型是學校方案中{provider}的{model}。',
      own: '該模型是{provider}的{model}，使用你自己的 API 金鑰。',
      fallback: '學校的模型無法作答時（今日額度已用完，或模型出錯），會改由你自己的模型作答：{provider}的{model}。',
      unknownModel:
        '該模型是為{name}選定的模型，來自學校方案或其擁有者自己的金鑰，所以內容會傳送至該模型的供應商。這個頁面無法顯示是哪一家供應商。',
      mcp: '{name}使用 MCP 存取：它由其擁有者自己的工具使用，這些工具會從 AIshie 讀取這段對話並作答。它們把讀到的內容傳送到哪裡，由擁有者決定，AIshie 無從得知。',
      unknown:
        '{name}經由 AI 模型作答：AIshie 的代理執行環境或其擁有者自己的工具，會把這裡寫的內容傳送至該模型，亦即傳送至其供應商。這個頁面無法顯示是哪一家。',
    },
    kept: {
      notDeleted: '對話永遠不會被刪除。已關閉的對話仍可閱讀。',
      withdrawn:
        '撤回的訊息會在這裡隱藏，但仍會保留：其文字保留在寫入它的操作紀錄及稽核用的匯出檔中；其檔案保留在網站上，匯出檔只列出檔案，不含其內容。',
      withdrawnModel: '訊息撤回後，AIshie 的代理執行環境不會再把它傳送至{name}的模型；之前已傳送的內容無法收回。',
      ocr: 'AIshie 的代理執行環境從附加的圖片或掃描 PDF 讀出的文字，會保留最多180天，即使訊息已撤回。',
    },
  },
  message: {
    retract: '撤回',
    // Under a message, on hover: copy it (as Markdown), and take the question awaiting its answer back to edit it.
    copy: '複製訊息',
    edit: '編輯',
    editTip: '撤回這則問題，放回輸入框修改後再送出',
    retractedByYou: '你已撤回這則訊息。',
    retractedBy: '{name}已撤回這則訊息。',
    retractedByStaff: '課程教職員已撤回這則訊息。',
    reason: '原因：{reason}',
  },
  // Under an answer: the course materials it relied on (AIShie-Core#69), each as the reader may open it now.
  sources: {
    basedOn: '依據：{source}',
    summary: '依據：{title}· {n}項',
    summaryNone: '依據：{n}項你無法開啟的課程教材',
    label: '這則回答依據的課程教材',
    quoted: '《{title}》',
    // A source, and where in it the answer read (its file, page or slide, version), or that it was an earlier version.
    entry: '{title}· {where}',
    page: '第{n}頁',
    slide: '第{n}張投影片',
    version: '第{seq}版',
    openFile: '開啟檔案中回答所依據之處',
    openVersion: '開啟這份教材的這個版本',
    earlier: '較早的版本',
    earlierTip: '這則回答依據的是這份教材較早的版本，你現在無法開啟；這裡開啟的是教材目前的版本。',
    restricted: '一份你無法開啟的課程教材',
    none: '未引用課程教材',
    noneTip: '代理表示這則回答沒有依據任何課程教材。',
  },
  reasonPlaceholder: '原因（選填）',
  reasonTooLong: '最多{max}字',
  // The ⋯ menu in a conversation's header: who can read it, how its answers arrive, closing it.
  menu: {
    label: '對話選項',
  },
  // A question awaiting its answer, taken back to the composer: to edit it, or to stop waiting.
  edit: {
    done: '問題已撤回並放回輸入框，修改後再送出即可。{name}不會回答已撤回的問題，已開始寫的回答也會停下。',
  },
  stop: {
    done: '已停止：問題已撤回並放回輸入框。{name}不會回答已撤回的問題，已開始寫的回答也會停下。',
  },
  retract: {
    title: '要撤回這則訊息嗎？',
    bodyMine: '這則訊息的內容將不再在此顯示，但寫入它的操作紀錄仍會保留原文。',
    bodyStaff: '{name}的這則訊息將不再在此顯示，但寫入它的操作紀錄仍會保留原文。',
    confirm: '撤回',
    done: '訊息已撤回',
  },
}
