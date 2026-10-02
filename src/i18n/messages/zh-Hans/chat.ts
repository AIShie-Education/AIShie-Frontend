// 与课程智能体的对话：每个页面旁的对话面板，以及其中的一段对话。
export default {
  panel: {
    title: '对话',
    toggle: '与智能体对话',
    toggleUnread: '与智能体对话：{n} 条未读',
    toggleTip: '与智能体对话（{key}）',
    course: '课程',
    new: '新对话',
    newTip: '开始新对话',
    history: '过往对话',
    close: '关闭对话面板',
    // The window's title bar: minimized, it opens again on what it showed; closed, on a new conversation.
    minimize: '最小化对话窗口',
    // Its left edge and its top, which resize it.
    width: '对话窗口宽度',
    height: '对话窗口高度',
    backToHistory: '返回过往对话',
    backToAgents: '返回智能体列表',
    pickTitle: '向智能体提问',
    pickHint: '你在 {course} 可以提问的智能体：课程自己的智能体，以及你的个人助理。',
    noCourses: '你的课程都不允许你向智能体提问。',
  },
  history: {
    title: '你的对话',
    scope: '课程范围',
    thisCourse: '这门课程',
    allCourses: '所有课程',
    empty: '你还没有在这门课程向智能体提问。',
    emptyAll: '你还没有向任何智能体提问。',
    untitled: '未命名',
    unread: '新回复',
    moreFailed: '无法加载更多对话，请再试一次。',
    // Searching the history (title and agent), and its groups by last activity.
    search: '搜索标题或智能体',
    noMatch: '没有符合「{q}」的对话。',
    searchLoaded: '只搜索已加载的对话：加载更多即可一并搜索。',
    groups: {
      today: '今天',
      yesterday: '昨天',
      week: '本周',
      earlier: '更早',
    },
  },
  respondents: {
    empty: '这里暂时没有可以回答你问题的智能体。',
    offlineHint: '这个智能体目前似乎没有在运行，回复可能需要一段时间。',
    sharedHint: '它也会回答其他成员，会记住每个人写给它的内容，并可能转述给他们。',
  },
  between: '{opener} → {respondent}',
  messagesLabel: '消息',
  older: '较早的消息',
  olderFailed: '无法加载，请再试一次。',
  empty: {
    opener: '还没有任何消息。在下方向 {name} 提出你的问题吧。',
    other: '还没有任何消息。',
  },
  // The line in the messages while an answer is awaited: the agent at work, and for how long.
  status: {
    thinking: '思考中…',
    seconds: '{s}s',
    minutes: '{m}m {s}s',
  },
  typing: '正在等待 {name}…',
  held: '等待批准中：获批准后才会在这里显示。',
  myActions: '我的操作',
  trouble: '连接到服务器时遇到问题，正在重试…',
  new: {
    intro: '开始与 {name} 对话。发送第一条消息即会发起对话。',
    yourAgent: '这是你自己的智能体：它代表你行事，权限永不超过你的席位。',
  },
  proposed: {
    title: '等待批准',
    body: '你与 {name} 的对话需经批准后才会开始。你可以在“我的操作”中查看进度。',
  },
  // What the line above the composer says.
  state: {
    waitingApproval: '每条回复都须经批准，你才会看到。',
    answerPending: '有一条回复正在等待批准。',
    withdrawn: '你撤回了问题，{name} 不会回答它。',
    start: '有任何关于课程的问题，都可以问 {name}。',
    overseeing: '你正以课程教职员的身份阅读这段对话。',
    readOnly: '现在由智能体在对话中回答问题，你可以阅读这段对话。',
  },
  // Why an answer may not come.
  availability: {
    gone: '{name} 已不在这门课程中。请改为与其他人开始新的对话。',
    paused: '{name} 在这门课程中已被暂停，目前无法回复。',
    notAnswering: '{name} 目前不回答问题。',
  },
  blocked: {
    archived: '这门课程已归档，无法再发言。',
  },
  closed: {
    title: '这段对话已结束。',
    said: '对方表示：“{reason}”',
    startNew: '开始新的对话',
  },
  composer: {
    label: '你的消息',
    askPlaceholder: '向 {name} 提问…',
    send: '发送',
    sendTip: '发送（Enter）· Shift+Enter 换行',
    stop: '停止',
    stopTip: '停止：撤回问题，放回输入框',
    // The list a slash opens (commands), and what the empty box hints at.
    commands: '指令',
    hintCommands: '/ 指令',
    hintMentions: "{'@'} 引用作业或教材",
    count: '{n} / {max} 字',
  },
  // Files a message carries: attached in the composer (the paperclip, dropped on the chat panel, or pasted),
  // each uploaded at once, as a chip; and in the messages, each with its icon, name, size and a download.
  attach: {
    button: '添加附件',
    buttonTip: '添加附件：最多 {n} 个，每个最大 {size}',
    full: '每条消息最多附 {n} 个文件',
    chips: '要发送的文件',
    dropHere: '松开即添加到你的消息',
    // The empty box, once files are attached: it invites the question; and sending them with no words asks for one.
    placeholder: '想让 {name} 就这个文件做些什么？',
    needText: '请写一句话和文件一起发送，让 {name} 知道你想要什么：一个问题，或要看哪里。',
    waiting: '正在等待文件上传完成…',
    failed: '有文件未能上传：重试或移除后才能发送。',
    tooLarge: '有文件太大，无法发送：移除后才能发送其余的。',
    tooMany: '每条消息最多附 {max} 个文件：有 {skipped} 个没有加入。',
    folders: '文件夹无法添加：请改为添加里面的文件。',
    again: '正在重新上传：完成后再发送一次即可。',
    reattach: '它的文件已随之撤回：如要发送，请重新添加。',
    readded: '它的文件也已放回输入框，正在重新上传。',
    // In a message.
    list: '附件',
    download: '下载“{name}”',
    downloadTip: '下载',
    held: '附 {n} 个文件：{names}',
    // Core's refusals because of a message's files, or of a file (details.reason).
    refusal: {
      too_many_attachments: '每条消息最多附 {max_files} 个文件：请移除一些再发送。',
      bad_filename: '有文件的名称无法照原样发送：名称太长，或含有不允许的字符。请把文件改名后再添加。',
      duplicate_attachment: '同一个文件添加了两次：请移除其中一个再发送。',
      attachments_need_body: '文件要和消息一起发送：请写一句话。',
      bad_upload_token: '有一个上传无法识别。',
      not_your_upload: '有一个上传不属于你，不能添加。',
      already_attached: '这些文件已经随另一条消息发送过。',
      not_uploaded: '有文件尚未上传完成。',
      upload_too_old: '这些文件上传得太久，不能等待批准。',
      file_too_large: '有文件超过消息可附的大小（{max}）：请移除它，或改附较小的文件。',
      conversation_attachments_full: '这个对话的文件已达上限（共 {max_total}）：如要发送更多，请开始新对话。',
      no_file_storage: '本站没有设置存放文件的地方，所以无法发送文件：请联系网站管理员。',
      retracted: '这个文件已随消息撤回。',
      not_a_member: '你已不在这门课程，所以无法在此发送文件。',
      membership_not_active: '你在这门课程的席位已暂停或结束，所以无法在此发送文件。',
      permission_denied: '你在这门课程的席位不能在对话中发送文件。',
      course_archived: '这门课程已归档：不能再发送任何内容。',
    },
  },
  // What a slash at the start of the box offers.
  commands: {
    new: '新对话',
    history: '对话记录',
  },
  // What an @ offers: the course's assignments and materials, whose title it writes in, quoted.
  mention: {
    label: '作业与教材',
    insert: '「{title}」',
    loading: '正在加载作业与教材…',
    none: '没有标题含「{q}」的作业或教材。',
    empty: '这门课程还没有你看得到的作业或教材。',
    kind: {
      assignment: '作业',
      material: '教材',
    },
  },
  // A new conversation's first words, offered to start with; a click puts them in the box.
  suggestions: {
    title: '可以这样开始',
    explainAssignment: '解释这份作业的要求',
    checkReasoning: '帮我检查我的思路',
    summarizeWeek: '总结这周的教材',
    practice: '出几道练习题给我',
  },
  // An answer in the making (the draft: ChatDraft, ChatDraftSteps): the agent's steps, running and done, with
  // what each works on (target) or without, and the answer's text, or that it shows once confirmed.
  draft: {
    consulted: '已查阅 {n} 项',
    stepsLabel: '智能体正在做的事',
    done: '已完成',
    running: '进行中',
    hidden: '答案需经确认后才会显示。',
    steps: {
      thinking: {
        running: '思考中…',
        done: '已思考',
        runningTarget: '思考中：{target}…',
        doneTarget: '已思考：{target}',
      },
      reading_document: {
        running: '正在阅读文件…',
        done: '已阅读文件',
        runningTarget: '正在阅读《{target}》…',
        doneTarget: '已阅读《{target}》',
      },
      listing_documents: {
        running: '正在查看教材列表…',
        done: '已查看教材列表',
        runningTarget: '正在查看{target}…',
        doneTarget: '已查看{target}',
      },
      reading_assignment: {
        running: '正在阅读作业…',
        done: '已阅读作业',
        runningTarget: '正在阅读作业《{target}》…',
        doneTarget: '已阅读作业《{target}》',
      },
      reading_submission: {
        running: '正在查看提交…',
        done: '已查看提交',
        runningTarget: '正在查看提交《{target}》…',
        doneTarget: '已查看提交《{target}》',
      },
      searching_memory: {
        running: '正在搜索记忆…',
        done: '已搜索记忆',
        runningTarget: '正在搜索记忆：{target}…',
        doneTarget: '已搜索记忆：{target}',
      },
      writing: {
        running: '正在撰写回答…',
        done: '已撰写回答',
        runningTarget: '正在撰写：{target}…',
        doneTarget: '已撰写：{target}',
      },
      tool: {
        running: '正在使用工具…',
        done: '已使用工具',
        runningTarget: '正在使用 {target}…',
        doneTarget: '已使用 {target}',
      },
    },
  },
  conflict: {
    closed: '这段对话已经关闭，不能再写入任何内容。',
  },
  // Who can read a conversation (Core's visible_to).
  visibleTo: {
    button: '谁可以阅读',
    title: '谁可以阅读这段对话',
    participants: '对话双方',
    overseers: '负责审批发起者操作的课程教职员',
    actionRecord: '课程中任何负责审批操作的人，可通过每条消息的操作记录阅读',
    respondentAnswersOthers: '回答的一方也会回答其他成员：它会记住每个人写的内容，并可能把这里写的内容转述给他们',
    auditExport: '网站及课程所属部门的管理员可导出用于审计，包括已撤回的消息',
    sharedNote: '对方也会回答其他成员：你在这里写的内容，它可能会转述给他们。',
  },
  // Who reads a conversation and where an agent sends it (AIShie-Frontend#79; components/chat/privacy.ts):
  // a short line under the composer, its points on a new conversation the first time, the whole notice behind More.
  privacy: {
    more: '详情',
    moreLabel: '详情：谁会阅读这段对话、内容会发送到哪里',
    title: '谁会阅读，内容会发送到哪里',
    routeTitle: '内容会发送到哪里生成回答',
    keptTitle: '会保留什么',
    firstTitle: '提问之前',
    gotIt: '知道了',
    agentReaders:
      '课程中负责审批操作的智能体也可以阅读这段对话。它把读到的内容发送到哪里，取决于它的托管方式：经 AIshie 的运行环境发送给它的 AI 模型，或发送给其拥有者自己的工具。',
    line: {
      model:
        '课程教职员、课程中负责审批操作的智能体，以及网站和部门管理员，都可以阅读这段对话。{name} 会把内容发送给 {provider} 来生成回答。',
      modelFallback:
        '课程教职员、课程中负责审批操作的智能体，以及网站和部门管理员，都可以阅读这段对话。{name} 会把内容发送给 {provider} 来生成回答；学校的模型无法回答时，则发送给 {fallbackProvider}。',
      runtime:
        '课程教职员、课程中负责审批操作的智能体，以及网站和部门管理员，都可以阅读这段对话。{name} 会把内容发送给其 AI 模型的供应商来生成回答。',
      mcp: '课程教职员、课程中负责审批操作的智能体，以及网站和部门管理员，都可以阅读这段对话。{name} 通过其拥有者自己的工具回答。',
      unknown:
        '课程教职员、课程中负责审批操作的智能体，以及网站和部门管理员，都可以阅读这段对话；内容会发送给 {name} 的 AI 模型来生成回答。',
    },
    points: {
      readers: '课程教职员和课程中负责审批操作的智能体可以阅读这段对话，网站和部门管理员还可以导出用于审计。',
      model: '{name} 会把你在这里写的内容发送给其 AI 模型的供应商 {provider} 来生成回答。',
      modelFallback:
        '{name} 会把你在这里写的内容发送给其 AI 模型的供应商 {provider} 来生成回答；学校的模型无法回答时，则发送给 {fallbackProvider}。',
      runtime: '{name} 会把你在这里写的内容发送给其 AI 模型的供应商来生成回答。',
      mcp: '{name} 由其拥有者自己的工具使用，这些工具可能把你写的内容发送给它们使用的任何 AI 服务。',
      unknown: '你在这里写的内容会发送给 {name} 的 AI 模型来生成回答。',
      kept: '这里的内容不会被删除：你撤回的消息会被隐藏，但仍会保留。',
    },
    route: {
      hosted:
        '{name} 由 AIshie 托管。为了生成回答，AIshie 的运行环境会把这段对话的消息、消息附带的文件，以及 {name} 在课程中读取的内容发送给它的 AI 模型。',
      school: '该模型是学校方案中 {provider} 的 {model}。',
      own: '该模型是 {provider} 的 {model}，使用你自己的 API 密钥。',
      fallback: '学校的模型无法回答时（今天的额度已用完，或模型出错），会改由你自己的模型回答：{provider} 的 {model}。',
      unknownModel:
        '该模型是为 {name} 选定的模型，来自学校方案或其拥有者自己的密钥，因此内容会发送给该模型的供应商。此页面无法显示是哪一家供应商。',
      mcp: '{name} 使用 MCP 访问：它由其拥有者自己的工具使用，这些工具会从 AIshie 读取这段对话并回答。它们把读到的内容发送到哪里，由拥有者决定，AIshie 无从得知。',
      unknown:
        '{name} 通过 AI 模型回答：AIshie 的运行环境或其拥有者自己的工具，会把这里写的内容发送给该模型，也就是发送给其供应商。此页面无法显示是哪一家。',
    },
    kept: {
      notDeleted: '对话永远不会被删除。已关闭的对话仍可阅读。',
      withdrawn:
        '撤回的消息会在这里隐藏，但仍会保留：其文字保留在写入它的操作记录和用于审计的导出文件中；其文件保留在网站上，导出文件只列出文件，不包含其内容。',
      withdrawnModel: '消息撤回后，AIshie 的运行环境不会再把它发送给 {name} 的模型；之前已发送的内容无法收回。',
      ocr: 'AIshie 的运行环境从附带的图片或扫描版 PDF 中识别出的文字，最多会保留 180 天，即使消息已撤回。',
    },
  },
  message: {
    retract: '撤回',
    // Under a message, on hover: copy it (as Markdown), and take the question awaiting its answer back to edit it.
    copy: '复制消息',
    edit: '编辑',
    editTip: '撤回这条问题，放回输入框修改后再发送',
    retractedByYou: '你已撤回这条消息。',
    retractedBy: '{name} 已撤回这条消息。',
    retractedByStaff: '课程教职员已撤回这条消息。',
    reason: '原因：{reason}',
  },
  reasonPlaceholder: '原因（选填）',
  reasonTooLong: '最多 {max} 字',
  // The ⋯ menu in a conversation's header: who can read it, how its answers arrive, closing it.
  menu: {
    label: '对话选项',
  },
  // A question awaiting its answer, taken back to the composer: to edit it, or to stop waiting.
  edit: {
    done: '问题已撤回并放回输入框，修改后再发送即可。{name} 不会回答已撤回的问题，已开始写的回答也会停下。',
  },
  stop: {
    done: '已停止：问题已撤回并放回输入框。{name} 不会回答已撤回的问题，已开始写的回答也会停下。',
  },
  retract: {
    title: '要撤回这条消息吗？',
    bodyMine: '这条消息的内容将不再在此显示，但写入它的操作记录仍会保留原文。',
    bodyStaff: '{name} 的这条消息将不再在此显示，但写入它的操作记录仍会保留原文。',
    confirm: '撤回',
    done: '消息已撤回',
  },
}
