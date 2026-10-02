// 导出对话用于审计：导出对话的管理页面（conversation.export），以及再次获取其文件（conversation.export_file）。
export default {
  title: '导出对话',
  subtitle: '导出对话用于审计，文件为 JSON Lines 和 CSV：可导出一门课程、一个部门或整个网站的对话。',
  subtitleDept: '导出对话用于审计，文件为 JSON Lines 和 CSV：限于你管理的课程或部门。',

  form: {
    title: '导出什么',
    intro:
      '导出内容包括所选对话的每条消息（已撤回的消息连同原文，并标示为已撤回）；每条消息所附文件的说明（不含文件本身）；以及曾经提出但从未发布的回答与提问。每次导出都会留下记录：导出者、时间及所选范围。',
    scope: '对话范围',
    course: '课程',
    department: '部门',
    departmentPlaceholder: '选择部门',
    departmentHint: '包括该部门及其下所有部门的课程。',
    siteHint: '网站上所有课程的所有对话。',
    participant: '参与者（选填）',
    participantHint: '只导出此人提问、或此智能体回答的对话。可按姓名、邮箱或学号／工号搜索，或粘贴其 ID。',
    participantHintDept: '只导出此人提问、或此智能体回答的对话。人员请输入完整的邮箱或学号／工号；智能体请粘贴其 ID。',
    from: '开始日期（选填）',
    to: '截至并包括（选填）',
    anyStart: '不限开始',
    anyEnd: '直至现在',
    zone: '日期按你的日历计算，时区为{zone}（UTC{offset}）：从首日零时起，至最后一日结束为止。',
    zoneOffset: '日期按你的日历计算（UTC{offset}）：从首日零时起，至最后一日结束为止。',
    sent: '实际发送',
    submit: '导出',
    exporting: '导出中…',
  },

  scope: {
    course: '一门课程',
    department: '一个部门',
    site: '整个网站',
  },

  span: {
    all: '不限时间，所有写入的内容。',
    from: '{from}起写入的内容。',
    to: '截至并包括{to}写入的内容。',
    both: '{from}起，截至并包括{to}写入的内容。',
  },

  problem: {
    course: '请选择课程。',
    department: '请选择部门。',
    dates: '最后一日早于首日。',
  },

  pending: {
    title: '于{time}发起的导出未有回应',
    body: '表单已恢复当时的选择。再次导出即可获取：服务器会交回已完成的导出，不会重复导出。',
    discard: '重新开始',
  },

  running: {
    title: '正在导出',
    elapsed: '已进行{time}。',
    note: '大型导出可能需要几分钟。期间你可以前往其他页面再回来：导出会继续进行，结果会在此显示。如连接中断，请以相同选择再次导出：服务器会交回已完成的导出，不会重复导出。',
  },

  outcome: {
    title: '已导出',
    replayed: '再次获取',
    recorded: '已记录为操作{id}：导出者、时间及所选范围。',
  },

  privacy: {
    title: '这些文件包含个人信息',
    body: '文件包含各人所写的内容（包括已撤回的消息）及其姓名。请只在所属机构规定允许的地方保存，切勿交给不应阅读的人。每个下载链接约15分钟内有效，需要时本页会获取新链接。文件会于{time}从服务器删除，之后无法再下载。',
  },

  refused: {
    title: '未能导出',
    noAnswer: '服务器没有回应',
    noAnswerBody: '导出可能仍在进行，或已经完成。请以相同选择再次导出：服务器会交回已完成的导出，不会重复导出。',
  },

  tooLarge: {
    course: '改为导出一门课程，而非一个部门或整个网站。',
    participant: '只导出一位参与者的对话。',
    days: '缩短日期范围。',
  },

  refusal: {
    export_too_large:
      '此导出将包含{conversations}段对话中的{messages}条消息及{text}文字，超出上限（{maxMessages}条消息、{maxText}）。请缩小范围：',
    department_out_of_scope: '该课程或部门不在（或已不在）你管理的部门之内。请选择你受委任的部门或其下的课程或部门。',
    platform_role_required:
      '只有网站管理员可以导出对话；部门管理员只能导出其部门的课程，并须指定所管理的课程或部门。整个网站须由平台管理员导出。',
    people_only: '对话须由人员导出，并由其负责：智能体不能导出任何对话。',
    export_expired: '此导出的文件已被删除（每次导出的文件都会在一段时间后删除）。请重新导出。',
    no_file_storage: '此服务器没有文件存储，因此无法导出。服务器运营者可设置文件存储。',
    notFound: '所选的课程、部门或参与者不存在，或已不存在。',
    fileNotFound: '此导出不属于你，或已不存在。',
    proposed: '服务器没有立即进行导出，因此并未导出任何内容。',
  },

  recent: {
    title: '最近的导出',
    note: '你在此浏览器所做、文件仍然保留的导出，可再次下载。文件包含个人信息；每个链接约15分钟内有效。',
    forget: '从列表移除',
    gone: '该导出的文件已被删除，已从列表移除。',
  },

  files: {
    format: {
      jsonl: 'JSON Lines',
      csv: 'CSV',
    },
    about: {
      jsonl: '每行一段对话，连同其消息及提议：供程序读取。',
      csv: '每行一条消息，已撤回的会标示：可用电子表格打开，中文也能正确显示。',
    },
    checksum: '校验码',
    download: '下载{format}',
    linksLive: '下载链接还有{time}有效。',
    linksExpired: '下载链接已过期。',
    linksNone: '每次下载都会向服务器获取新链接。',
    refresh: '获取新链接',
    deleted: '文件已从服务器删除。',
  },

  summary: {
    site: '整个网站',
    scoped: '{kind}：{label}',
    participant: '参与者：{who}',
    conversations: '对话',
    messages: '消息',
    withdrawn: '其中{n}条已撤回',
    proposals: '从未发布的提议',
    attachments: '附件（仅说明）',
    text: '文字',
    asOf: '导出时间',
    expiresAt: '文件删除时间',
  },

  course: {
    placeholder: '按代码或名称搜索课程，或粘贴课程 ID',
    notFound: '你管理的课程中没有此 ID。',
    none: '没有可选择的课程。',
    noMatch: '没有符合的课程。',
    typeMore: '只显示前{n}项符合的结果：请输入更多字以缩小范围。',
    pasteId: '只搜索前{n}门课程：其后的课程请粘贴其 ID。',
  },

  participant: {
    placeholder: '任何人：按姓名、邮箱或学号搜索人员或智能体',
    placeholderId: '任何人：粘贴人员或智能体的 ID',
    pasteId: '请粘贴其 ID。',
    noMatch: '没有符合的人员或智能体。',
    lookupPlaceholder: '完整的邮箱、学号／工号，或 ID',
    find: '查找',
    invalid: '请输入完整的邮箱地址、完整的学号／工号，或 ID。',
    notFound: '没有人用{who}注册。',
    byId: 'ID {id}',
    byIdShort: '按 ID',
    clear: '改为任何人',
  },
}
