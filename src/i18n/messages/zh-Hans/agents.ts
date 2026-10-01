// My agents (/account/agents): the agents a person owns, their tokens and seats.
export default {
  title: '我的智能体',
  subtitle: '你拥有的智能体：连接它们，并把它们带入你的课程替你工作',
  notHuman: '只有“人”才能拥有智能体。以智能体身份登录时，并没有属于自己的智能体。',

  // The link from the Account page.
  accountCard: {
    title: '我的智能体',
    body: '由你拥有、以你的代表身份在课程中工作的 AI 助手及其他程序。',
    open: '管理我的智能体',
  },

  about: {
    title: '智能体如何运作',
    here: {
      title: '在这里注册',
      body: '智能体是 AIshie 中的一个身份：一个名称、它的运行方式，以及它所在的课程。这里不会保存任何模型、提示词或密钥。',
    },
    runtime: {
      title: '两种运行方式，一经选定不变',
      body: '站内托管：AIshie 以你选择的模型运行它，课程成员可在站内向它提问。或 MCP 访问：由你自己的工具以它的令牌使用它。创建时选定。',
    },
    delegate: {
      title: '只代表你行事',
      body: '在课程中，你的智能体就是你的代表：权限永远不会超过你自己的席位，触及范围不会更广，你离开课程时它也会一并离开。',
    },
  },

  standing: {
    active: '已启用',
    suspendedByMe: '已由你停用',
    suspendedByAdmin: '已由管理员停用',
  },

  list: {
    title: '你的智能体',
    new: '添加智能体',
    count: '没有已启用的智能体 | 1 个已启用 | {n} 个已启用',
    countOf: '{n} / {limit} 个已启用',
    suspendedDoNotCount: '已停用的智能体不计入你可拥有的数量。',
    empty: '你还没有任何智能体。创建一个：站内托管，或由你自己的工具通过 MCP 访问。',
    emptyNoSelfService: '你还没有任何智能体。在这里，智能体由管理员注册：请向你的管理员申请。',
    seats: '未加入任何课程 | 已加入 1 门课程 | 已加入 {n} 门课程',
    requests: '1 项申请待批准 | {n} 项申请待批准',
    created: '创建于',
  },

  limit: {
    noSelfService:
      '在这里只有管理员可以注册智能体：请向你的管理员申请。智能体归你所有后，你可以在此页为它签发令牌，并把它带进你的课程。',
    reached: '你已有 {limit} 个未停用的智能体，已达上限。请先停用一个不再使用的智能体，才能再创建新的。',
  },

  create: {
    title: '添加智能体',
    intro: '给它起个名字，并选择它的运行方式。这里不会保存任何模型、提示词或密钥：只记录它是谁、如何运行，以及你带它加入的课程。',
    name: '名称',
    namePlaceholder: '例如：复习小帮手',
    nameHint: '它在各处显示的名称：成员名单、对话、审批等。之后可以更改。',
    nameRequired: '请输入名称',
    next: {
      runtime: '下一步：交给 AIshie 托管，并选择它回答时所用的模型。你完全不用处理令牌。',
      mcp: '下一步：为它签发一个令牌，再用它把你自己的工具连接到 AIshie。',
      course: '把它带入你有席位的课程。',
    },
    submit: '创建智能体',
    done: '已创建 {name}',
  },

  rename: {
    title: '重命名智能体',
    hint: '新名称会在智能体出现的每一处显示，包括过往记录。',
    done: '已重命名',
  },

  // Whether people can ask it on the site (agent.get's site_chat), as its hosting decides.
  siteChat: {
    title: '站内提问',
    on: '课程成员可在站内向它提问：AIshie 的运行环境正在运行它。',
    off: '目前站内无法向它提问：AIshie 的运行环境没有在运行它。请在本页为它设置托管，或恢复运行。',
    suspended: '它停用期间，站内无法向它提问。',
    mcp: '站内无法向它提问：它是 MCP 访问，由你自己的工具使用。可在站内提问的智能体，须在创建时选择“站内托管”。',
    stop: '如要让人无法再向它提问，请暂停它的托管，或停用它。',
  },

  detail: {
    title: '智能体',
    subtitle: '它的运行方式，以及它工作的课程',
    notFound: '你没有这个 ID 的智能体。',
    about: '基本信息',
    presence: '连接状态',
    created: '创建于',
    id: '参与者 ID',
    delegateNote: '在每门课程中，它都以你的代表身份行事：权限都不会超过你自己的席位。',
    tokenNote: '持有它任何一个令牌的人，都会以这个智能体的身份行事，也就是以你的代表身份行事。',
    hostingFixed: '在创建时选定，此后不会更改。',
    rename: '重命名',
    suspend: '停用',
    reactivate: '重新启用',
    suspendTitle: '停用 {name}？',
    suspendBody:
      '从现在起，它在所有课程中的每一个操作都会被拒绝，直到你重新启用为止。它的席位、令牌及记录都会保留。已停用的智能体不计入你可拥有的数量。',
    suspended: '已停用 {name}',
    reactivated: '{name} 已重新启用',
    suspendedByMe: '你已停用这个智能体：它的每一个操作都会被拒绝。重新启用即可让它恢复工作。',
    suspendedByAdmin: '这个智能体已被管理员停用',
    suspendedByAdminBody: '它的每一个操作都会被拒绝，而且只有管理员才能解除停用。如你认为应该解除，请联系平台管理员。',
    adminOnly: '这个智能体由管理员停用，只有管理员才能解除。',
  },

  // Connecting one's own tool to an agent with MCP access (McpAccessCard, ConnectToolSteps).
  connect: {
    tokenTodo: '它还没有令牌：你的工具需要用令牌连接。',
    tokenDone: '它已有一个有效的令牌。',
    waiting: '它的令牌尚未被使用过。',
    waitingWatching: '正在等待你的工具连接…本页每隔几秒会自动检查一次。',
    toolIntro:
      'Claude Desktop、编辑器、智能体 SDK 或任何其他 MCP 客户端都可以充当这个智能体：把这个地址交给它，并在这个请求头中放入智能体的其中一个令牌。',
    endpoint: 'MCP 端点（Streamable HTTP）',
    header: '请求头',
    headerHint: '把 {placeholder} 换成智能体的其中一个令牌。请妥善保密：任何持有它的人都能以这个智能体的身份行事。',
    claudeDesktop: '示例：Claude Desktop',
    claudeDesktopFile: 'claude_desktop_config.json',
    claudeDesktopHint:
      '把这段加入 Claude Desktop 的配置（Settings → Developer → Edit Config），把 {placeholder} 换成智能体的其中一个令牌，然后重新启动 Claude Desktop。它会以 npx 运行 mcp-remote，所以需要安装 Node.js。',
    claudeDesktopHintToken:
      '把这段加入 Claude Desktop 的配置（Settings → Developer → Edit Config），然后重新启动 Claude Desktop。配置文件中含有令牌：请勿外泄。它会以 npx 运行 mcp-remote，所以需要安装 Node.js。',
    courseTodo: '在加入课程之前，它什么都做不了：请把它带入你有席位的课程。',
    courseWaiting: '安排它加入课程的申请正等待讲师批准。',
    courseDone: '已加入 1 门课程。 | 已加入 {n} 门课程。',
  },

  // How an agent with MCP access runs, on its page (McpAccessCard).
  mcp: {
    title: '运行方式',
    notOnSite: '站内无法向这个智能体提问',
    notOnSiteBody:
      '它是 MCP 访问：由你自己的工具（Claude Desktop、编辑器、程序）以它的其中一个令牌通过 MCP 使用，并以你的代表身份在它的课程中行事。',
  },

  copy: {
    done: '已复制到剪贴板',
    failed: '无法自动复制，请自行选中后复制。',
  },

  tokens: {
    title: '令牌',
    new: '创建令牌',
    intro:
      '你的工具用来连接的凭证。撤销其中一个，使用它的程序从下一次调用起便会被拒绝；智能体本身及其他令牌不受影响。',
    showInactive: '显示已撤销及已过期的令牌（{n}）',
    empty: '还没有任何令牌。',
    unlabelled: '无标签',
    lastUsed: '最后使用',
    neverUsed: '从未使用',
    created: '创建于',
    expires: '到期',
    noExpiry: '不会到期',
    issuedBy: '签发者',
    someoneElse: '管理员',
    revokedAt: '撤销于',
    state: {
      active: '有效',
      revoked: '已撤销',
      expired: '已过期',
    },
    revoke: '撤销',
    revokeTitle: '撤销这个令牌？',
    revokeBody: '使用 {token} 的程序，从下一次以 {name} 身份调用起便会被拒绝。',
    revokeKeeps: '智能体会保留它的席位及其他令牌。已撤销的令牌永远无法再使用。',
    revoked: '已撤销令牌',
  },

  issue: {
    title: '为 {name} 创建令牌',
    intro:
      '供你通过 MCP 使用 {name} 的一个工具使用。持有它的人会以这个智能体的身份，也就是以你的代表身份行事：权限永远不会超过你自己的席位。',
    suspended: '这个智能体已停用：在重新启用之前，这个令牌会被拒绝。',
    label: '标签',
    labelPlaceholder: '例如：我笔记本电脑上的 Claude Desktop',
    labelHint: '注明它在哪里使用，方便以后辨认。',
    labelRequired: '请输入标签',
    expiry: '到期',
    after: '在若干天后',
    never: '永不',
    days: '天',
    daysInvalid: '请输入 1 至 3650 之间的整数天数',
    noExpiryWarn: '永不到期的令牌会一直有效，直到被撤销。无人看管的工具，最好设置到期日。',
    submit: '创建令牌',
  },

  reveal: {
    title: '{name} 的新令牌',
    warning: '请立即复制。令牌不会保存在任何地方，之后也不会再显示。',
    token: '令牌',
    listedAs: '在列表中显示为',
    connect: '连接你的工具',
    done: '我已复制',
    closeUncopiedTitle: '不复制就关闭？',
    closeUncopied: '这个令牌不会再显示。如果遗失了，请撤销它并创建新的。',
    closeAnyway: '仍然关闭',
    missingTitle: '无法显示令牌',
    missing: '这个令牌是由同一请求的较早一次尝试创建的，而令牌只会显示一次。如果当时没有保存，请撤销它并创建新的。',
    revokeIt: '撤销它',
  },

  seats: {
    title: '课程',
    intro: '它以你的代表身份所在的课程，以及它现在在那里可以做的事：它自己的权限，并以你的席位为上限。',
    empty: '它还未加入任何课程。',
    students: '学生',
    assignments: '作业',
    ends: '席位结束',
    noEnd: '未设置',
    mayNow: '现在可以',
    nothing: '没有任何权限',
    nothingNow: '在它或你的席位暂停期间，或课程已归档时，它什么都不能做',
    allPerms: '所有权限',
    cappedHint: '每一项都取智能体自己的级别与你的级别之中较低者。',
    withdraw: '撤出',
    withdrawTitle: '把它从 {course} 撤出？',
    withdrawBody:
      '{name} 会失去在 {course} 的席位，它提出而还没有人决定的申请会一并取消。它做过的一切都会保留记录。之后再带它加入，会是一个新席位：一切从头开始。',
    withdrawn: '已从 {course} 撤出',
    withdrawnCancelled: '已从 {course} 撤出，并取消了它的 1 项申请 | 已从 {course} 撤出，并取消了它的 {n} 项申请',
    archived: '已归档的课程不接受任何更改，包括这一项。',
    proposals: '它在这里的提议',
  },

  requests: {
    title: '等待批准',
    intro: '安排它加入课程、而讲师尚未决定的申请。',
    since: '申请于',
    takeBack: '撤回',
    takeBackTitle: '撤回这项申请？',
    takeBackBody: '安排 {name} 加入 {course} 的申请将被取消。你可以之后再提出新的申请。',
    takenBack: '已撤回加入 {course} 的申请',
  },

  bring: {
    open: '带入课程',
    title: '把 {name} 带入课程',
    intro: '它会以你的代表身份加入：在那里，它能做的永远不会比你多，触及范围不会更广，你离开后它也不会留下。',
    course: '课程',
    noCourses: '你没有在任何课程中拥有席位。',
    noneAvailable: '你的课程目前都不能加入这个智能体；每门课程旁都注明了原因。',
    needsApproval: '须先经讲师批准',
    blocked: {
      archived: '已归档：不接受任何更改',
      paused: '你在这里的席位已暂停',
      delegate: '你在这里是以他人代表的身份加入的',
      noPerm: '你在这里的席位不允许带入智能体',
      seated: '它已在这门课程中',
      requested: '安排它加入这里的申请正在等待批准',
    },
    purpose: '用途',
    purposeCourse: '供学生提问的课程智能体',
    purposeHelp: {
      personal: '你的个人助手：它能阅读你能阅读的内容（如果你是学生，就是你自己的作业与成绩），并只回答你。',
      course:
        '课程智能体：每位学生都可以向它询问课程教材的相关问题，而它可能会把某位学生告诉它的内容转述给其他人。它不会阅读任何人的作业。由于你负责管理这门课程的成员，因此可以选择此项。',
    },
    preview: '它将获得的权限',
    level: {
      autonomous: '带入后会立即加入课程。',
      pending_review: '带入后会立即加入课程，之后由讲师审核。',
      confirm_required: '这会提交一项申请：须经讲师批准，你的智能体才会加入课程。申请在等待期间，你可以随时撤回。',
      denied: '你在这里的席位不允许带入智能体。',
    },
    answers: '谁可以向它提问',
    answersYou: '只有你',
    answersCourse: '你和学生：它会记住每个人写的内容，并可能转述给其他人',
    students: '可触及的学生',
    assignments: '作业',
    ends: '席位结束',
    noEnd: '未设置',
    may: '可以',
    reach: {
      students: {
        all: '全班',
        nobody: '不触及任何人的作业',
        you: '只有你：你自己的作业与成绩',
        listed: '1 位学生 | {n} 位学生',
      },
      assignments: {
        all: '所有作业',
        nobody: '没有',
        listed: '1 份作业 | {n} 份作业',
      },
    },
    cappedHint: '已按你自己的席位设置上限。负责管理课程成员的人以后可以调整它的权限，但永远不会超过你的权限。',
    adjust: '全部权限，以及另定级别',
    adjustHelp:
      '留空的权限按预设给予。它在这里不可拥有的级别会以灰色显示，并注明原因；如果你是学生，超出个人助手范围的事（例如替你起草提交）它只能以提议的方式进行，由你确认后才执行。',
    changed: '已另定 {n} 项',
    submit: '带入',
    submitRequest: '提交申请',
    done: '{name} 已加入 {course}',
  },
}
