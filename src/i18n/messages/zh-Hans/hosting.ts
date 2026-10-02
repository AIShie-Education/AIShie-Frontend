// Hosting an agent on the school's runtime (M2): offering it to a runtime
// agent not hosted yet, hosting it by its id, its model and key, its hosted
// card, what became of its token when its hosting ended, and the runtime's
// errors by reason. The words for statuses, problems and errors are the
// contract's (m2.api.spec.md §6.1 and §9.5, and runtime-hosting-api.md).
export default {
  // A runtime agent not hosted yet, on its page: hosting it.
  offer: {
    title: '站内托管',
    notHosted: '尚未托管',
    body: '你为它选好回答时所用的模型后，AIshie 的运行环境就会运行这个智能体；之后课程成员就可在站内向它提问。你完全不用处理令牌。',
    bodySchool:
      '你为它选好学校方案，或选择模型并提供自己的 API 密钥后，AIshie 的运行环境就会运行这个智能体；之后课程成员就可在站内向它提问。你完全不用处理令牌。',
    host: '设置托管',
    hostSuspended: '这个智能体已停用：请先重新启用它。',
    absent: '这个服务器上没有可用的 AIshie 智能体运行环境，所以这个智能体暂时无法在这里运行。请通知你的管理员。',
    notById: '学校的运行环境目前无法托管智能体：它尚未设置好。请通知你的管理员。',
    noModel: '学校的运行环境目前没有可选的模型，所以暂时无法托管智能体。',
  },

  // Hosting one of one's agents by its id: the wizard's first step, before "Model and key".
  host: {
    open: '把智能体交给 AIshie 托管',
    title: '把智能体交给 AIshie 托管',
    titleNamed: '把 {name} 交给 AIshie 托管',
    steps: {
      agent: '智能体',
      model: '模型与密钥',
    },
    body: '学校的运行环境会按照这个智能体在 AIshie 中的席位运行它，课程成员可在站内向它提问。运行环境会自行获取智能体的令牌：你不会看到任何令牌。下一步请选择模型并提供你的 API 密钥。',
    bodySchool:
      '学校的运行环境会按照这个智能体在 AIshie 中的席位运行它，课程成员可在站内向它提问。运行环境会自行获取智能体的令牌：你不会看到任何令牌。下一步请选择学校方案，或选择模型并提供你自己的 API 密钥。',
    agent: '智能体',
    agentPlaceholder: '选择你的其中一个智能体',
    none: '你没有等待托管的智能体。只有创建时选择“站内托管”的智能体才能托管：MCP 访问的智能体由你自己的工具使用。',
    checking: '正在向 AIshie 查询…',
    seats: '它还未加入任何课程：托管后，在你把它带入课程之前，它没有任何问题要回答。 | 它在 1 门课程中。 | 它在 {n} 门课程中。',
    already: '它已经由 AIshie 托管。',
    openIt: '前往它的页面',
    takesOver: '其他人先前留下的托管会被取代。',
    submit: '托管',
    done: '{name} 已由 AIshie 托管',
  },

  // What became of its token in AIshie when its hosting ended (pausing, deleting).
  revocation: {
    failedPause: '未能在 AIshie 中撤销它的令牌（{why}），所以站内可能仍会让人向它提问。请再暂停一次重试。',
    failedDelete: '未能在 AIshie 中撤销它的令牌（{why}），所以站内可能仍会让人向它提问。如要阻止，请停用这个智能体。',
    not_attempted: '没有撤销它的令牌（{why}）。',
    why: {
      core_unavailable: '无法连接 AIshie',
      runtime_misconfigured: '学校的运行环境尚未设置好',
      core_too_old: '这个 AIshie 服务器版本太旧',
      operator_agent: '学校的运维方正在运行这个智能体',
      unknown: '原因不明',
    },
  },

  // The model and the owner's own key (F3).
  model: {
    title: '{name} 的模型与密钥',
    provider: '供应商',
    providerPlaceholder: '选择供应商',
    adapter: 'API 形式',
    adapters: {
      openai_chat: 'Chat Completions',
      openai_responses: 'Responses',
      anthropic: 'Messages',
      gemini: 'Gemini API',
      bedrock_converse: 'Converse',
    },
    endpoint: '端点',
    resource: 'Azure 资源名称',
    resourceHint: '你的 Azure OpenAI 资源名称，例如 {example}。',
    region: 'AWS 区域',
    model: '模型',
    modelPlaceholder: '选择或输入模型',
    priceUnknown: '价格未知',
    key: 'API 密钥',
    keyKeep: '保留已保存的密钥 {hint}',
    keyNew: '输入新的密钥',
    keyPlaceholder: '你在 {provider} 的 API 密钥',
    keyPlaceholderPrefix: '你在 {provider} 的 API 密钥（{prefix}…）',
    keyNotStored: '密钥会交给学校的运行环境，为这个智能体加密保存。本页不会保留它，也不会再显示它。',
    advanced: '高级',
    maxOutputTokens: '每个回答的输出 token 上限',
    maxOutputTokensHint: '256 至 32000。留空则使用运行环境的默认值。',
    reasoningEffort: '推理强度',
    reasoningDefault: '模型默认',
    effort: {
      minimal: '最少',
      low: '低',
      medium: '中',
      high: '高',
    },
    warning:
      '你的提问，以及你的智能体读取的课程教材和作业，都会以你的密钥、按照 {provider} 的条款发送给 {provider}。只有你自己的智能体会使用这个密钥。',
    noProviders: '学校的运行环境没有提供可使用你自己密钥的供应商。',
    test: '测试密钥',
    later: '稍后',
    saved: '已保存。运行环境正以这些设置启动你的智能体。',
    confirmUntestedTitle: '保存未通过测试的密钥？',
    confirmUntested: '这个密钥未通过测试（{result}）。仍然保存？',
    saveAnyway: '仍然保存',
    changedElsewhere: '这个智能体已在另一个标签页或窗口中被更改；请检查后再保存一次。',
    invalid: {
      required: '必填',
      model: '模型名称只能包含字母、数字及 . _ : / @ + -，最多 128 个字符。',
      resource: '只能包含小写字母、数字和连字符，与 Azure 的资源命名方式相同。',
      region: 'AWS 区域，例如 us-east-1。',
      maxOutputTokens: '256 至 32000 之间的整数。',
    },
  },

  // The school's AI plan (D8): the school provides the model and pays for it.
  school: {
    choice: '学校方案',
    choiceHint: '由学校提供模型并支付费用，不必自备 API 密钥。',
    own: '你自己的密钥',
    ownHint: '自选供应商与模型，使用你自己的 API 密钥。',
    offer: '模型',
    limits: '你所有的智能体合计每天最多回答 {owner} 次，每位提问者每天最多 {asker} 次。每天{reset} 重新计算。',
    noKey: '学校的密钥只保存在学校的服务器上，任何人（包括你）都看不到。',
    warning: '你的提问，以及智能体读到的课程资料与作业，会按学校与模型供应商的协议发送给该供应商。',
    fallbackTitle: '备用：你自己的密钥',
    fallbackOn: '学校额度用完后，改用我自己的密钥回答',
    fallbackHint: '可选。不设置时，当天额度用完后，智能体会告诉提问者“今天的学校 AI 额度已用完，请明天再试。”',
    saved: '已保存。运行环境正以学校方案启动你的智能体。',
  },

  // One token's test of a key (POST /keys/test).
  keyTest: {
    ok: '这个密钥可以使用 {model}。',
    key_refused: '{provider} 拒绝了这个密钥。',
    model_not_found: '密钥有效，但 {provider} 没有 {model} 这个模型。',
    key_accepted: '密钥已被接受，但测试调用失败（HTTP {status}）。你仍可保存。',
    unreachable: '无法连接 {provider}。请再试一次。',
    short: {
      ok: '可以使用',
      key_refused: '密钥被拒绝',
      model_not_found: '没有这个模型',
      key_accepted: '测试调用失败',
      unreachable: '无法连接供应商',
      none: '未测试',
    },
  },

  // A hosted agent's status (§6.1).
  status: {
    needs_model: {
      title: '请选择模型',
      body: '你的智能体已交给 AIshie 托管，但还没有模型。请选择供应商和模型，并提供你的 API 密钥来启动它。',
      bodySchool: '你的智能体已交给 AIshie 托管，但还没有模型。请选择学校方案，或选择供应商和模型并提供你的 API 密钥来启动它。',
    },
    starting: {
      title: '启动中',
      body: '运行环境正以最新的设置启动你的智能体，需要几秒钟。',
    },
    running: {
      title: '运行中',
      body: '你的智能体正在学校的运行环境上运行，并在它的课程中回答问题。',
    },
    paused: {
      title: '已暂停',
      body: '你的智能体不会回答任何人，也不会发出任何调用，站内也无法向它提问：它的令牌已在 AIshie 中撤销。恢复后它会以新的令牌再次启动。（这不是“停用”：智能体在 AIshie 中仍处于启用状态。）',
    },
    needs_token: {
      title: '需要新令牌',
      body: '运行环境为你的智能体持有的令牌已在 AIshie 中被撤销（由你或管理员撤销）。请重新连接，让运行环境获得新的令牌；你不会看到它。',
    },
    error: {
      title: '没有运行',
      body: '运行环境没有在运行你的智能体。',
    },
    stopped: {
      title: '重新启动中',
      body: '运行环境在重新启动或把你的智能体交给另一个工作进程时暂时停止了它。它会自行再次启动。',
    },
  },

  // Why it needs a token or does not run (problem.reason).
  problem: {
    token_refused: 'AIshie 已撤销运行环境为它持有的令牌。',
    settings_rejected: '它的设置在这里无法使用：{detail}。请更改模型或密钥。',
    runtime_misconfigured: '学校的运行环境尚未设置为可运行托管智能体。请通知你的管理员。',
    operator_agent: '学校的运维方已经在运行这个智能体，所以这个副本不会运行。',
    actor_in_use: '这里已有另一个智能体使用了这个智能体的身份。',
    token_other_agent: '运行环境持有的令牌属于另一个智能体。请重新连接。',
    owner_changed: 'AIshie 并不视这个智能体为你所有，所以运行环境停止了它。请在这里删除它。',
    core_too_old: '这个 AIshie 服务器无法说明智能体属于谁。请通知你的管理员。',
    agent_suspended: '这个智能体在 AIshie 中已停用。重新启用后，它会自行再次启动。',
    owner_suspended: '它的所有者在 AIshie 中已被停用。所有者重新启用后，它会自行再次启动。',
    mcp_agent: 'AIshie 表示这个智能体是 MCP 访问：它由所有者自己的工具使用，所以运行环境无法托管它。请在这里删除它。',
    agent_not_found: 'AIshie 已没有这个智能体。请在这里删除它。',
    failing: '它未能启动，稍后会再试：{detail}。',
    offer_withdrawn:
      '学校已不再提供它所用的模型，而你也没有设置自己的模型作为备用，所以它没有运行。请改选学校的其他模型，或使用你自己的模型。',
  },

  // A seat, in sentences from the runtime's facts.
  seat: {
    delegate: '在 {course} 作为你的代表：读取{reads}；只回答你。',
    tutor: '{course} 的辅导智能体：回答所有学生；读取{reads}。',
    member: '{course} 的成员：读取{reads}。',
    reads: {
      both: '课程教材和学生作业',
      material: '课程教材',
      work: '学生作业',
      nothing: '不到任何内容',
    },
    silent: '当前不会回答（{why}）。',
    why: {
      seatPaused: '席位已暂停',
      courseArchived: '课程已归档',
      answeringOff: '回答功能已关闭',
    },
    waitsApproval: '它的回答需要等待批准。',
    none: '它不在任何课程中：没有问题要回答。',
  },

  // The hosted card.
  card: {
    title: '站内托管',
    details: '详细信息',
    since: '开始于',
    model: '模型',
    noModel: '尚未选择',
    key: '密钥',
    today: '今天',
    answers: '没有回答 | 1 个回答 | {n} 个回答',
    costUnknown: '费用未知',
    proposals: '1 个回答正等待批准。 | {n} 个回答正等待批准。',
    seats: '课程',
    primary: {
      chooseModel: '选择模型',
      reconnect: '重新连接',
      changeModel: '更改模型或密钥',
    },
    pause: '暂停',
    resume: '恢复',
    pauseHint: '只在这里停止智能体；它在 AIshie 中仍处于启用状态。',
    paused: '已在学校的运行环境上暂停',
    resumed: '已在学校的运行环境上恢复',
    more: '更多',
    delete: '从学校的运行环境删除',
    renewed: '运行环境正为 {name} 获取新的令牌。',
    ownKeyOff: '学校的运行环境暂时不接受你自己的模型与密钥，所以无法在这里更改。',
    renewOff: '学校的运行环境目前无法按 ID 托管智能体，所以无法在这里重新连接它。',
    plan: '方案',
    schoolPlan: '学校方案（由学校付费）',
    fallback: '备用',
    fallbackNone: '无：额度用完后暂停回答，明天再开始',
    schoolAllowance: '学校额度',
    todaySchool: '今日 {used} / {limit} 次',
    todaySchoolHint: '学校方案，你所有的智能体合计；每天{reset} 重新计算。',
    perAsker: '每位提问者每天最多 {n} 次',
    thisAgent: '这个智能体今日',
    spentFallback: '今天的学校额度已用完：在{reset} 之前改用你自己的密钥回答。',
    spentNone: '今天的学校额度已用完：在{reset} 之前，智能体会请提问者明天再试。',
    offerWithdrawn: '学校已不再提供这个方案。请选择其他方案，或改用你自己的密钥。',
    offerWithdrawnFallback: '学校已不再提供这个方案：在你改选之前，智能体会以你自己的模型和密钥回答。',
  },

  // Deleting it from the runtime.
  delete: {
    title: '从学校的运行环境删除 {name}？',
    body: '运行环境会停止这个智能体，删除它的设置和你的密钥，并在 AIshie 中撤销它的令牌：在你再次托管它之前，站内无法向它提问。智能体会保留在 AIshie 中。',
    proposals: '1 个仍在等待批准的回答会保留在 AIshie 中。 | {n} 个仍在等待批准的回答会保留在 AIshie 中。',
    submit: '删除',
    done: '{name} 已不在学校的运行环境上',
  },

  // The runtime's errors, by reason (§9.5).
  errors: {
    details: '详细信息',
    assertion: '无法让你登录学校的运行环境。请重新加载页面后再试。',
    unavailable: '学校的运行环境当前无法使用。请一分钟后再试。',
    network: '无法连接学校的运行环境。请检查网络连接后再试。',
    core_unavailable: '运行环境无法连接 AIshie。请一分钟后再试。',
    rate_limited: '尝试次数太多。请等待 {seconds} 秒。',
    runtime_misconfigured: '学校的运行环境尚未设置为可托管智能体。请通知你的管理员。',
    mcp_agent: '这个智能体是 MCP 访问：它由你自己的工具使用，永远不会在这里托管。',
    agent_suspended: '这个智能体在 AIshie 中已停用。请先重新启用它。',
    owner_suspended: '它的所有者在 AIshie 中已被停用，所以无法托管它。请联系管理员。',
    owner_changed: 'AIshie 已不再视这个智能体为你所有：请在这里删除它。',
    core_too_old: '这个 AIshie 服务器版本太旧，无法托管。请通知你的管理员。',
    operator_agent: '学校的运维方已经在运行这个智能体。',
    agent_not_found: '这个智能体已不在学校的运行环境上。',
    agent_not_yours: 'AIshie 并不视这个智能体为你所有。',
    version_mismatch: '这个智能体已在另一个标签页或窗口中被更改。请检查最新的设置后再保存一次。',
    changedMeanwhile: '这个智能体刚在另一个标签页或窗口中被更改。这里显示的是它现在的状态：请检查后再试一次。',
    school_key_not_offered: '这里没有提供学校方案。',
    unknown_offer: '学校已不再提供这个模型。请选择其他模型。',
    own_key_required: '请输入你在 {provider} 的 API 密钥。',
    own_key_provider_mismatch: '你已保存的密钥属于另一个供应商。请输入 {provider} 的密钥。',
    model_denied: '学校不允许使用这个模型。请选择另一个。',
    settings_rejected: '运行环境无法使用这些设置运行。',
    key_malformed: '这看起来不像 {provider} 的 API 密钥。请按 {provider} 给你的原样粘贴密钥，不要加入空格。',
    key_is_aishie_token:
      '这是 AIshie 的令牌（你的或智能体的），不是 {provider} 的 API 密钥。AIshie 令牌绝不会发送给供应商：请粘贴 {provider} 给你的密钥。',
    unknown_provider: '请从提供的供应商中选择。',
    adapter_not_offered: '请从提供的 API 形式中选择。',
    unknown_endpoint: '请从提供的端点中选择。',
    invalid_field: '这里不接受这个值。',
    unknown_field: '学校的运行环境不接受这个请求：它没有“{field}”这个字段。请重新加载页面后再试。',
    unknown_parameter: '学校的运行环境不接受这个请求：网址中不能有“{field}”。请重新加载页面后再试。',
  },

  // Hosting that is not for this person, or not here after all.
  unavailable: {
    account: '这个账号无法使用学校运行环境的托管服务。',
    absent: '这个服务器上没有可用的学校运行环境。请重新加载页面。',
  },
}
