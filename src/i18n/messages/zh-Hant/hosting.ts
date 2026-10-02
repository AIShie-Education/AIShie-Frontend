// Hosting an agent on the school's runtime (M2): offering it to a runtime
// agent not hosted yet, hosting it by its id, its model and key, its hosted
// card, what became of its token when its hosting ended, and the runtime's
// errors by reason. The words for statuses, problems and errors are the
// contract's (m2.api.spec.md §6.1 and §9.5, and runtime-hosting-api.md).
export default {
  // A runtime agent not hosted yet, on its page: hosting it.
  offer: {
    title: '站內託管',
    notHosted: '尚未託管',
    body: '你為它選好回答時所用的模型後，AIshie 的執行環境就會運行這個代理；之後課程成員就可在站內向它提問。你完全不用處理權杖。',
    bodySchool:
      '你為它選好學校方案，或選擇模型並提供自己的 API 金鑰後，AIshie 的執行環境就會運行這個代理；之後課程成員就可在站內向它提問。你完全不用處理權杖。',
    host: '設定託管',
    hostSuspended: '這個代理已停用：請先重新啟用它。',
    absent: '這個伺服器上沒有可用的 AIshie 代理執行環境，所以這個代理暫時無法在這裡運行。請通知你的管理員。',
    notById: '學校的執行環境目前無法託管代理：它尚未設定好。請通知你的管理員。',
    noModel: '學校的執行環境目前沒有可選的模型，所以暫時無法託管代理。',
  },

  // Hosting one of one's agents by its id: the wizard's first step, before "Model and key".
  host: {
    open: '把代理交給 AIshie 託管',
    title: '把代理交給 AIshie 託管',
    titleNamed: '把{name}交給 AIshie 託管',
    steps: {
      agent: '代理',
      model: '模型與金鑰',
    },
    body: '學校的執行環境會按照這個代理在 AIshie 中的席位運行它，課程成員可在站內向它提問。執行環境會自行取得代理的權杖：你不會看到任何權杖。下一步請選擇模型並提供你的 API 金鑰。',
    bodySchool:
      '學校的執行環境會按照這個代理在 AIshie 中的席位運行它，課程成員可在站內向它提問。執行環境會自行取得代理的權杖：你不會看到任何權杖。下一步請選擇學校方案，或選擇模型並提供你自己的 API 金鑰。',
    agent: '代理',
    agentPlaceholder: '選擇你的其中一個代理',
    none: '你沒有等待託管的代理。只有建立時選擇「站內託管」的代理才能託管：MCP 存取的代理由你自己的工具使用。',
    checking: '正向 AIshie 查詢…',
    seats: '它還未加入任何課程：託管後，在你把它帶入課程之前，它沒有任何問題要回答。 | 它在 1 個課程中。 | 它在{n}個課程中。',
    already: '它已經由 AIshie 託管。',
    openIt: '前往它的頁面',
    takesOver: '其他人先前留下的託管會被取代。',
    submit: '託管',
    done: '{name}已由 AIshie 託管',
  },

  // What became of its token in AIshie when its hosting ended (pausing, deleting).
  revocation: {
    failedPause: '未能在 AIshie 中撤銷它的權杖（{why}），所以站內可能仍會讓人向它提問。請再暫停一次重試。',
    failedDelete: '未能在 AIshie 中撤銷它的權杖（{why}），所以站內可能仍會讓人向它提問。如要阻止，請停用這個代理。',
    not_attempted: '沒有撤銷它的權杖（{why}）。',
    why: {
      core_unavailable: '無法連接 AIshie',
      runtime_misconfigured: '學校的執行環境尚未設定好',
      core_too_old: '這個 AIshie 伺服器版本太舊',
      operator_agent: '學校的營運者正在運行這個代理',
      unknown: '原因未明',
    },
  },

  // The model and the owner's own key (F3).
  model: {
    title: '{name}的模型與金鑰',
    provider: '供應商',
    providerPlaceholder: '選擇供應商',
    adapter: 'API 形式',
    adapters: {
      openai_chat: 'Chat Completions',
      openai_responses: 'Responses',
      anthropic: 'Messages',
      gemini: 'Gemini API',
      bedrock_converse: 'Converse',
    },
    endpoint: '端點',
    resource: 'Azure 資源名稱',
    resourceHint: '你的 Azure OpenAI 資源名稱，例如{example}。',
    region: 'AWS 區域',
    model: '模型',
    modelPlaceholder: '選擇或輸入模型',
    priceUnknown: '價格不明',
    key: 'API 金鑰',
    keyKeep: '保留已儲存的金鑰{hint}',
    keyNew: '輸入新的金鑰',
    keyPlaceholder: '你在{provider}的 API 金鑰',
    keyPlaceholderPrefix: '你在{provider}的 API 金鑰（{prefix}…）',
    keyNotStored: '金鑰會交給學校的執行環境，為這個代理加密保存。本頁不會保留它，也不會再顯示它。',
    advanced: '進階',
    maxOutputTokens: '每個回答的輸出 token 上限',
    maxOutputTokensHint: '256 至 32000。留空則使用執行環境的預設值。',
    reasoningEffort: '推理強度',
    reasoningDefault: '模型預設',
    effort: {
      minimal: '最少',
      low: '低',
      medium: '中',
      high: '高',
    },
    warning:
      '你的提問，以及你的代理讀取的課程資料和作業，都會以你的金鑰、按照{provider}的條款傳送給{provider}。只有你自己的代理會使用這個金鑰。',
    noProviders: '學校的執行環境沒有提供可使用你自己金鑰的供應商。',
    test: '測試金鑰',
    later: '稍後',
    saved: '已儲存。執行環境正以這些設定啟動你的代理。',
    confirmUntestedTitle: '儲存未通過測試的金鑰？',
    confirmUntested: '這個金鑰未通過測試（{result}）。仍然儲存？',
    saveAnyway: '仍然儲存',
    changedElsewhere: '這個代理已在另一個分頁或視窗中被更改；請檢查後再儲存一次。',
    invalid: {
      required: '必填',
      model: '模型名稱只可包含字母、數字及 . _ : / @ + -，最多 128 個字元。',
      resource: '只可包含小寫字母、數字和連字號，與 Azure 的資源命名方式相同。',
      region: 'AWS 區域，例如 us-east-1。',
      maxOutputTokens: '256 至 32000 之間的整數。',
    },
  },

  // The school's AI plan (D8): the school provides the model and pays for it.
  school: {
    choice: '學校方案',
    choiceHint: '由學校提供模型並支付費用，不必自備 API 金鑰。',
    own: '你自己的金鑰',
    ownHint: '自選供應商與模型，使用你自己的 API 金鑰。',
    offer: '模型',
    limits: '你所有的代理合計每天最多回答{owner}次，每位提問者每天最多{asker}次。每天{reset}重新計算。',
    noKey: '學校的金鑰只保存在學校的伺服器上，任何人（包括你）都看不到。',
    warning: '你的提問，以及代理讀到的課程資料與作業，會依學校與模型供應商的協議送到該供應商。',
    fallbackTitle: '備用：你自己的金鑰',
    fallbackOn: '學校額度用完後，改用我自己的金鑰回答',
    fallbackHint: '可選。不設定時，當天額度用完後，代理會告訴提問者「今天的學校 AI 額度已用完，請明天再試。」',
    saved: '已儲存。執行環境正以學校方案啟動你的代理。',
  },

  // One token's test of a key (POST /keys/test).
  keyTest: {
    ok: '這個金鑰可以使用{model}。',
    key_refused: '{provider}拒絕了這個金鑰。',
    model_not_found: '金鑰有效，但{provider}沒有{model}這個模型。',
    key_accepted: '金鑰已被接受，但測試呼叫失敗（HTTP {status}）。你仍可儲存。',
    unreachable: '無法連接{provider}。請再試一次。',
    short: {
      ok: '可以使用',
      key_refused: '金鑰被拒絕',
      model_not_found: '沒有這個模型',
      key_accepted: '測試呼叫失敗',
      unreachable: '無法連接供應商',
      none: '未測試',
    },
  },

  // A hosted agent's status (§6.1).
  status: {
    needs_model: {
      title: '請選擇模型',
      body: '你的代理已交給 AIshie 託管，但還沒有模型。請選擇供應商和模型，並提供你的 API 金鑰來啟動它。',
      bodySchool: '你的代理已交給 AIshie 託管，但還沒有模型。請選擇學校方案，或選擇供應商和模型並提供你的 API 金鑰來啟動它。',
    },
    starting: {
      title: '啟動中',
      body: '執行環境正以最新的設定啟動你的代理，需時數秒。',
    },
    running: {
      title: '運行中',
      body: '你的代理正在學校的執行環境上運行，並在它的課程中回答問題。',
    },
    paused: {
      title: '已暫停',
      body: '你的代理不會回答任何人，也不會發出任何呼叫，站內也無法向它提問：它的權杖已在 AIshie 中撤銷。恢復後它會以新的權杖再次啟動。（這不是「停用」：代理在 AIshie 中仍然是啟用的。）',
    },
    needs_token: {
      title: '需要新權杖',
      body: '執行環境為你的代理持有的權杖已在 AIshie 中被撤銷（由你或管理員撤銷）。請重新連接，讓執行環境取得新的權杖；你不會看到它。',
    },
    error: {
      title: '沒有運行',
      body: '執行環境沒有在運行你的代理。',
    },
    stopped: {
      title: '重新啟動中',
      body: '執行環境在重新啟動或把你的代理交給另一個工作程序時暫時停止了它。它會自行再次啟動。',
    },
  },

  // Why it needs a token or does not run (problem.reason).
  problem: {
    token_refused: 'AIshie 已撤銷執行環境為它持有的權杖。',
    settings_rejected: '它的設定在這裡無法使用：{detail}。請更改模型或金鑰。',
    runtime_misconfigured: '學校的執行環境尚未設定為可運行託管代理。請通知你的管理員。',
    operator_agent: '學校的營運者已經在運行這個代理，所以這個副本不會運行。',
    actor_in_use: '這裡已有另一個代理使用了這個代理的身分。',
    token_other_agent: '執行環境持有的權杖屬於另一個代理。請重新連接。',
    owner_changed: 'AIshie 並不視這個代理為你所有，所以執行環境停止了它。請在這裡刪除它。',
    core_too_old: '這個 AIshie 伺服器無法說明代理屬於誰。請通知你的管理員。',
    agent_suspended: '這個代理在 AIshie 中已停用。重新啟用後，它會自行再次啟動。',
    owner_suspended: '它的擁有者在 AIshie 中已被停用。擁有者重新啟用後，它會自行再次啟動。',
    mcp_agent: 'AIshie 表示這個代理是 MCP 存取：它由擁有者自己的工具使用，所以執行環境無法託管它。請在這裡刪除它。',
    agent_not_found: 'AIshie 已沒有這個代理。請在這裡刪除它。',
    failing: '它未能啟動，稍後會再試：{detail}。',
    offer_withdrawn:
      '學校已不再提供它所用的模型，而你也沒有設定自己的模型作為備用，所以它沒有運行。請改選學校的其他模型，或使用你自己的模型。',
  },

  // A seat, in sentences from the runtime's facts.
  seat: {
    delegate: '在{course}作為你的代表：讀取{reads}；只回答你。',
    tutor: '{course}的導修代理：回答所有學生；讀取{reads}。',
    member: '{course}的成員：讀取{reads}。',
    reads: {
      both: '課程資料和學生作業',
      material: '課程資料',
      work: '學生作業',
      nothing: '不到任何內容',
    },
    silent: '現時不會回答（{why}）。',
    why: {
      seatPaused: '席位已暫停',
      courseArchived: '課程已封存',
      answeringOff: '回答功能已關閉',
    },
    waitsApproval: '它的回答需要等待批准。',
    none: '它不在任何課程中：沒有問題要回答。',
  },

  // The hosted card.
  card: {
    title: '站內託管',
    details: '詳細資料',
    since: '開始於',
    model: '模型',
    noModel: '尚未選擇',
    key: '金鑰',
    today: '今日',
    answers: '沒有回答 | 1 個回答 | {n}個回答',
    costUnknown: '費用不明',
    proposals: '1 個回答正等待批准。 | {n}個回答正等待批准。',
    seats: '課程',
    primary: {
      chooseModel: '選擇模型',
      reconnect: '重新連接',
      changeModel: '更改模型或金鑰',
    },
    pause: '暫停',
    resume: '恢復',
    pauseHint: '只在這裡停止代理；它在 AIshie 中仍然是啟用的。',
    paused: '已在學校的執行環境上暫停',
    resumed: '已在學校的執行環境上恢復',
    more: '更多',
    delete: '從學校的執行環境刪除',
    renewed: '執行環境正為{name}取得新的權杖。',
    ownKeyOff: '學校的執行環境暫時不接受你自己的模型與金鑰，所以無法在這裡更改。',
    renewOff: '學校的執行環境目前無法按 ID 託管代理，所以無法在這裡重新連接它。',
    plan: '方案',
    schoolPlan: '學校方案（由學校付費）',
    fallback: '備用',
    fallbackNone: '無：額度用完後暫停回答，明天再開始',
    schoolAllowance: '學校額度',
    todaySchool: '今日{used} / {limit}次',
    todaySchoolHint: '學校方案，你所有的代理合計；每天{reset}重新計算。',
    perAsker: '每位提問者每天最多{n}次',
    thisAgent: '這個代理今日',
    spentFallback: '今天的學校額度已用完：在{reset}之前改用你自己的金鑰回答。',
    spentNone: '今天的學校額度已用完：在{reset}之前，代理會請提問者明天再試。',
    offerWithdrawn: '學校已不再提供這個方案。請選擇其他方案，或改用你自己的金鑰。',
    offerWithdrawnFallback: '學校已不再提供這個方案：在你改選之前，代理會以你自己的模型和金鑰回答。',
  },

  // Deleting it from the runtime.
  delete: {
    title: '從學校的執行環境刪除{name}？',
    body: '執行環境會停止這個代理，刪除它的設定和你的金鑰，並在 AIshie 中撤銷它的權杖：在你再次託管它之前，站內無法向它提問。代理會保留在 AIshie 中。',
    proposals: '1 個仍在等待批准的回答會保留在 AIshie 中。 | {n}個仍在等待批准的回答會保留在 AIshie 中。',
    submit: '刪除',
    done: '{name}已不在學校的執行環境上',
  },

  // The runtime's errors, by reason (§9.5).
  errors: {
    details: '詳細資料',
    assertion: '無法讓你登入學校的執行環境。請重新載入頁面後再試。',
    unavailable: '學校的執行環境現時無法使用。請一分鐘後再試。',
    network: '無法連接學校的執行環境。請檢查網絡連線後再試。',
    core_unavailable: '執行環境無法連接 AIshie。請一分鐘後再試。',
    rate_limited: '嘗試次數太多。請等候{seconds}秒。',
    runtime_misconfigured: '學校的執行環境尚未設定為可託管代理。請通知你的管理員。',
    mcp_agent: '這個代理是 MCP 存取：它由你自己的工具使用，永遠不會在這裡託管。',
    agent_suspended: '這個代理在 AIshie 中已停用。請先重新啟用它。',
    owner_suspended: '它的擁有者在 AIshie 中已被停用，所以無法託管它。請聯絡管理員。',
    owner_changed: 'AIshie 已不再視這個代理為你所有：請在這裡刪除它。',
    core_too_old: '這個 AIshie 伺服器版本太舊，無法託管。請通知你的管理員。',
    operator_agent: '學校的營運者已經在運行這個代理。',
    agent_not_found: '這個代理已不在學校的執行環境上。',
    agent_not_yours: 'AIshie 並不視這個代理為你所有。',
    version_mismatch: '這個代理已在另一個分頁或視窗中被更改。請檢查最新的設定後再儲存一次。',
    changedMeanwhile: '這個代理剛在另一個分頁或視窗中被更改。這裡顯示的是它現在的狀態：請檢查後再試一次。',
    school_key_not_offered: '這裡沒有提供學校方案。',
    unknown_offer: '學校已不再提供這個模型。請選擇其他模型。',
    own_key_required: '請輸入你在{provider}的 API 金鑰。',
    own_key_provider_mismatch: '你已儲存的金鑰屬於另一個供應商。請輸入{provider}的金鑰。',
    model_denied: '學校不允許使用這個模型。請選擇另一個。',
    settings_rejected: '執行環境無法使用這些設定運行。',
    key_malformed: '這看起來不像{provider}的 API 金鑰。請按{provider}給你的原樣貼上金鑰，不要加入空格。',
    key_is_aishie_token:
      '這是 AIshie 的權杖（你的或代理的），不是{provider}的 API 金鑰。AIshie 權杖絕不會傳送給供應商：請貼上{provider}給你的金鑰。',
    unknown_provider: '請從提供的供應商中選擇。',
    adapter_not_offered: '請從提供的 API 形式中選擇。',
    unknown_endpoint: '請從提供的端點中選擇。',
    invalid_field: '這裡不接受這個值。',
    unknown_field: '學校的執行環境不接受這個請求：它沒有「{field}」這個欄位。請重新載入頁面後再試。',
    unknown_parameter: '學校的執行環境不接受這個請求：網址中不能有「{field}」。請重新載入頁面後再試。',
  },

  // Hosting that is not for this person, or not here after all.
  unavailable: {
    account: '這個帳戶無法使用學校執行環境的託管服務。',
    absent: '這個伺服器上沒有可用的學校執行環境。請重新載入頁面。',
  },
}
