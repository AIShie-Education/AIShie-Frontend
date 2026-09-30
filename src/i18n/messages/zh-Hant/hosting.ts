// Hosting an agent on the school's runtime (M2): the choice of where an agent
// runs, connecting it, its model and key, its hosted card, and the runtime's
// errors by reason. The words for statuses, problems and errors are the
// contract's (m2.api.spec.md §6.1 and §9.5).
export default {
  // Where the agent runs: one brain at a time.
  choice: {
    title: '這個代理如何運行',
    intro:
      '代理同一時間只能有一個「大腦」：由 AIshie 代管，或由你的 AI 工具或執行環境運行。不能同時兩者，否則每個問題都會有兩個回答。',
    hosted: '交給 AIshie 代管',
    hostedHint: 'AIshie 會替你運行它，使用你選擇的模型和你自己的 API 金鑰。無須安裝任何程式，也無須處理權杖。',
    recommended: '推薦',
    tool: '用其他 AI 工具連接（Claude、ChatGPT、代理 SDK…）',
    toolHint: '由你自己的 AI 工具透過 MCP、以代理的其中一個權杖擔任這個代理。',
    runtime: '自己架 runtime（進階）',
    runtimeHint: '適用於自行營運 AIshie Agent Runtime 的人。',
    hostedIntro: 'AIshie 會為代理建立一個權杖，並在不顯示的情況下交給學校的執行環境；然後由你選擇模型並提供 API 金鑰。',
    host: '設定代管',
    hostedHintSchool:
      'AIshie 會替你運行它，使用學校的 AI 方案，或你選擇的模型和你自己的 API 金鑰。無須安裝任何程式，也無須處理權杖。',
    hostedIntroSchool:
      'AIshie 會為代理建立一個權杖，並在不顯示的情況下交給學校的執行環境；然後由你選擇學校方案，或選擇模型並提供自己的 API 金鑰。',
    hostSuspended: '這個代理已停用：請先重新啟用它。',
    paste: '我已有這個代理的權杖',
    selfWhileHosted: '改用其他 AI 工具連接，或自己架 runtime',
    selfWhileHostedNote:
      '這些只適用於停止代管之後：請先從 AIshie 代管中刪除這個代理（更多 ▸ 刪除），這樣會撤銷執行環境所用的權杖。兩者同時運行時，每個問題都會有兩個回答。',
  },

  // The wizard's first step, and giving a hosted agent a new token.
  connect: {
    title: '在學校的執行環境託管 {name}',
    steps: {
      confirm: '確認',
      model: '模型與金鑰',
    },
    body: '學校的執行環境會按照這個代理在 AIshie 中的席位運行它。執行環境會加密保存代理的權杖，你不會看到它。下一步請選擇模型並提供你的 API 金鑰。',
    bodySchool:
      '學校的執行環境會按照這個代理在 AIshie 中的席位運行它。執行環境會加密保存代理的權杖，你不會看到它。下一步請選擇學校方案，或選擇模型並提供你的 API 金鑰。',
    seats: '它所在的課程',
    noSeats: '它還未加入任何課程。託管後，在你把它帶入課程之前，它沒有任何問題要回答。',
    purpose: {
      personal: '只回答你',
      course: '回答所有學生',
    },
    submit: '連接',
    done: '{name} 已在學校的執行環境上',
    replaceTitle: '為學校執行環境上的 {name} 換新權杖',
    replaceBody:
      '系統會建立一個標籤為「AIshie runtime」的新權杖並交給執行環境，執行環境隨後會撤銷原有的權杖。兩個權杖你都不會看到。',
    replaceSubmit: '更換權杖',
    reconnectTitle: '重新連接 {name}',
    reconnectBody:
      'AIshie 拒絕了執行環境原有的權杖。系統會建立一個標籤為「AIshie runtime」的新權杖並交給執行環境；你不會看到它。',
    reconnectSubmit: '重新連接',
    replaced: '執行環境已取得 {name} 的新權杖',
  },

  // A token the runtime could not revoke, after replacing or deleting (§9.4).
  unrevoked: {
    title: '這個代理的一個權杖可能仍然有效',
    body: '學校的執行環境未能在 AIshie 中撤銷權杖 {token}（{why}），所以持有它的程式仍可能以你的代理身分行事。請以代理擁有者的身分在這裡撤銷它。',
    why: {
      agent_suspended: '這個代理在 AIshie 中已停用',
      core_unavailable: '它無法連接 AIshie',
      core_refused: 'AIshie 拒絕了它的請求',
      unknown: '它無法確定是否已撤銷',
    },
    revoke: '在 AIshie 中撤銷',
    later: '暫時不要',
    revoked: '已撤銷 {token}。',
    gone: '{token} 已經失效：沒有需要撤銷的。',
    held: '執行環境現正使用 {token}，所以沒有撤銷它。',
    failed: '在這裡也未能撤銷它。請在下方「權杖」清單中撤銷它。',
  },

  // The agent's other tokens, as the runtime lists them on inspect and connect
  // (A.1), or as the page works them out from Core's list before it issues one.
  otherTokens: {
    inUseTitle: '這個代理似乎正在其他地方運行',
    inUse:
      '它的權杖 {token} 最近一次使用是 {ago}。代理同一時間只能有一個「大腦」。請停止另一個執行環境，或在 AIshie 中撤銷那個權杖，讓只有這個執行環境以你的代理身分回答。',
    unusedTitle: '這個代理還有其他權杖',
    unused: '它們仍然有效，但最近沒有使用。如果你沒有程式需要它們，可以撤銷。',
    unknown: '無法檢查這個代理是否有其他副本。',
    unlabelled: '沒有標籤',
    recent: '使用中',
    lastUsed: '上次使用',
    neverUsed: '從未使用',
    revoke: '撤銷',
    revoked: '已撤銷 {token}：現在沒有程式能再用它以你的代理身分行事。',
    gone: '{token} 已經失效：沒有需要撤銷的。',
    revokeFailed: '未能撤銷它。請再試一次，或在下方「權杖」清單中撤銷它。',
    anyway: '仍然連接',
    anywayReplace: '仍然繼續',
  },

  // The one-brain rule, when resuming a hosted agent, and for a pasted token used lately.
  oneBrain: {
    title: '有其他程式正在運行這個代理',
    body: '它的另一個權杖在過去數分鐘內曾被使用：你自己的執行環境或其他 MCP 用戶端正在運行它。如果學校的執行環境也運行它，每個問題都會有兩個回答。請撤銷那些權杖以停止它，或者你會自行停止它的話，可以繼續。',
    revokeResume: '撤銷它們並恢復',
    anywayResume: '仍然恢復',
    revokeFailed: '部分權杖未能撤銷，所以沒有進行下一步。請再試一次，或在下方「權杖」清單中撤銷它們。',
    sameTokenTitle: '這個權杖正在使用中',
    sameToken: '如果你自己的執行環境正在使用這個權杖，請先停止它，否則每個問題都會有兩個回答。它上次使用於',
  },

  // "I have a token for this agent".
  paste: {
    title: '用你已有的權杖託管 {name}',
    intro:
      '貼上這個代理的其中一個權杖。執行環境會加密保存它，之後不會再顯示。本頁永遠不會撤銷你貼上的權杖：由你決定還有甚麼在使用它。',
    token: '代理權杖',
    placeholder: 'ais_…',
    check: '檢查',
    agent: '代理',
    seats: '它所在的課程',
    alreadyConnected: '已經連接。',
    takesOver: '連接後會取代前任擁有者留下的副本。',
    submit: '連接',
  },

  // The model and the owner's own key (F3).
  model: {
    title: '{name} 的模型與金鑰',
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
    resourceHint: '你的 Azure OpenAI 資源名稱，例如 {example}。',
    region: 'AWS 區域',
    model: '模型',
    modelPlaceholder: '選擇或輸入模型',
    priceUnknown: '價格不明',
    key: 'API 金鑰',
    keyKeep: '保留已儲存的金鑰 {hint}',
    keyNew: '輸入新的金鑰',
    keyPlaceholder: '你在 {provider} 的 API 金鑰',
    keyPlaceholderPrefix: '你在 {provider} 的 API 金鑰（{prefix}…）',
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
      '你的提問，以及你的代理讀取的課程資料和作業，都會以你的金鑰、按照 {provider} 的條款傳送給 {provider}。只有你自己的代理會使用這個金鑰。',
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
    limits: '你所有的代理合計每天最多回答 {owner} 次，每位提問者每天最多 {asker} 次。每天 00:00 UTC 重新計算。',
    noKey: '學校的金鑰只保存在學校的伺服器上，任何人（包括你）都看不到。',
    warning: '你的提問，以及代理讀到的課程資料與作業，會依學校與模型供應商的協議送到該供應商。',
    fallbackTitle: '備用：你自己的金鑰',
    fallbackOn: '學校額度用完後，改用我自己的金鑰回答',
    fallbackHint: '可選。不設定時，當天額度用完後，代理會告訴提問者「今天的學校 AI 額度已用完，請明天再試。」',
    saved: '已儲存。執行環境正以學校方案啟動你的代理。',
  },

  // One token's test of a key (POST /keys/test).
  keyTest: {
    ok: '這個金鑰可以使用 {model}。',
    key_refused: '{provider} 拒絕了這個金鑰。',
    model_not_found: '金鑰有效，但 {provider} 沒有 {model} 這個模型。',
    key_accepted: '金鑰已被接受，但測試呼叫失敗（HTTP {status}）。你仍可儲存。',
    unreachable: '無法連接 {provider}。請再試一次。',
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
      body: '你的代理已連接，但還沒有模型。請選擇供應商和模型，並提供你的 API 金鑰來啟動它。',
      bodySchool: '你的代理已連接，但還沒有模型。請選擇學校方案，或選擇供應商和模型並提供你的 API 金鑰來啟動它。',
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
      body: '你的代理不會回答任何人，也不會發出任何呼叫，因此會顯示為離線。恢復後它會再次啟動。（這不是「停用」：代理在 AIshie 中仍然是啟用的。）',
    },
    needs_token: {
      title: '需要新權杖',
      body: 'AIshie 拒絕了你代理的權杖：它已被撤銷或已過期。請重新連接，讓執行環境取得新的權杖。',
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
    token_refused: 'AIshie 拒絕了代理的權杖。',
    settings_rejected: '它的設定在這裡無法使用：{detail}。請更改模型或金鑰。',
    runtime_misconfigured: '學校的執行環境尚未設定為可運行託管代理。請通知你的管理員。',
    operator_agent: '學校的營運者已經在運行這個代理，所以這個副本不會運行。',
    actor_in_use: '這裡已有另一個代理使用了這個代理的身分。',
    token_other_agent: '它的權杖屬於另一個代理。請重新連接。',
    token_not_agent: '它的權杖屬於一個人，而不是這個代理。請重新連接。',
    owner_changed: 'AIshie 並不視這個代理為你所有，所以執行環境停止了它。請在這裡刪除它。',
    core_too_old: '這個 AIshie 伺服器無法說明代理屬於誰。請通知你的管理員。',
    agent_suspended: '這個代理在 AIshie 中已停用。重新啟用後，它會自行再次啟動。',
    failing: '它未能啟動，稍後會再試：{detail}。',
  },

  // A seat, in sentences from the runtime's facts.
  seat: {
    delegate: '在 {course} 作為你的代表：讀取{reads}；只回答你。',
    tutor: '{course} 的導修代理：回答所有學生；讀取{reads}。',
    member: '{course} 的成員：讀取{reads}。',
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
    title: '由 AIshie 代管',
    details: '詳細資料',
    since: '開始於',
    model: '模型',
    noModel: '尚未選擇',
    key: '金鑰',
    token: '權杖',
    today: '今日',
    answers: '沒有回答 | 1 個回答 | {n} 個回答',
    costUnknown: '費用不明',
    proposals: '1 個回答正等待批准。 | {n} 個回答正等待批准。',
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
    replaceToken: '更換權杖',
    delete: '從學校的執行環境刪除',
    usedByRuntime: '由學校的執行環境使用',
    ownKeyOff: '學校的執行環境暫時不接受你自己的模型與金鑰，所以無法在這裡更改。',
    connectOff: '學校的執行環境暫時不接受新的權杖，所以無法在這裡為它換新權杖。',
    plan: '方案',
    schoolPlan: '學校方案（由學校付費）',
    fallback: '備用',
    fallbackNone: '無：額度用完後暫停回答，明天再開始',
    schoolAllowance: '學校額度',
    todaySchool: '今日 {used} / {limit} 次',
    todaySchoolHint: '學校方案，你所有的代理合計；每天 00:00 UTC 重新計算。',
    perAsker: '每位提問者每天最多 {n} 次',
    thisAgent: '這個代理今日',
    spentFallback: '今天的學校額度已用完：在 00:00 UTC 之前改用你自己的金鑰回答。',
    spentNone: '今天的學校額度已用完：在 00:00 UTC 之前，代理會請提問者明天再試。',
    offerWithdrawn: '學校已不再提供這個方案。請選擇其他方案，或改用你自己的金鑰。',
    issueWhileHosted:
      '學校的執行環境正在運行這個代理。你用新權杖啟動的任何程式也會回答：如要自己運行，請先從學校的執行環境刪除它。',
  },

  // Deleting it from the runtime.
  delete: {
    title: '從學校的執行環境刪除 {name}？',
    body: '執行環境會停止這個代理，刪除它的設定和你的金鑰，並撤銷它的權杖「AIshie runtime」。代理會保留在 AIshie 中；你之後可以再次託管它。',
    proposals: '1 個仍在等待批准的回答會保留在 AIshie 中。 | {n} 個仍在等待批准的回答會保留在 AIshie 中。',
    alsoRevoke: '同時撤銷它的權杖',
    alsoRevokeHint: '它的權杖（「{label}」）並非由本頁建立。只有在其他程式仍在使用它時才保留。',
    alsoRevokeHintUnlabelled: '它的權杖並非由本頁建立。只有在其他程式仍在使用它時才保留。',
    submit: '刪除',
    done: '{name} 已不在學校的執行環境上',
    notAttempted: '它的權杖仍然有效；如沒有其他程式使用，請在下方撤銷它。',
  },

  // The runtime's errors, by reason (§9.5).
  errors: {
    details: '詳細資料',
    assertion: '無法讓你登入學校的執行環境。請重新載入頁面後再試。',
    unavailable: '學校的執行環境現時無法使用。請一分鐘後再試。',
    network: '無法連接學校的執行環境。請檢查網絡連線後再試。',
    core_unavailable: '執行環境無法連接 AIshie。請一分鐘後再試。',
    rate_limited: '嘗試次數太多。請等候 {seconds} 秒。',
    token_malformed: '這不是 AIshie 的代理權杖（它應以 ais_ 開頭）。',
    token_refused: 'AIshie 拒絕了這個權杖：它已被撤銷或已過期。',
    token_not_agent: '這個權杖屬於一個人，而不是代理。執行環境只接受代理自己的權杖。',
    agent_suspended: '這個代理在 AIshie 中已停用。請先重新啟用它。',
    token_other_agent: '這個權杖屬於另一個代理。',
    agent_unowned: '這個代理在 AIshie 中沒有擁有者，所以無法在這裡連接。請聯絡管理員。',
    not_owner: '這個代理屬於其他人。只有它的擁有者才能連接它。',
    core_too_old: '這個 AIshie 伺服器版本太舊，無法託管。請通知你的管理員。',
    already_hosted: '這個代理已經在學校的執行環境上。',
    operator_agent: '學校的營運者已經在運行這個代理。',
    agent_not_found: '這個代理已不在學校的執行環境上。',
    version_mismatch: '這個代理已在另一個分頁或視窗中被更改。請檢查最新的設定後再儲存一次。',
    changedMeanwhile: '這個代理剛在另一個分頁或視窗中被更改。這裡顯示的是它現在的狀態：請檢查後再試一次。',
    school_key_not_offered: '這裡沒有提供學校方案。',
    unknown_offer: '學校已不再提供這個模型。請選擇其他模型。',
    own_key_required: '請輸入你在 {provider} 的 API 金鑰。',
    own_key_provider_mismatch: '你已儲存的金鑰屬於另一個供應商。請輸入 {provider} 的金鑰。',
    model_denied: '學校不允許使用這個模型。請選擇另一個。',
    settings_rejected: '執行環境無法使用這些設定運行。',
    key_malformed: '這看起來不像 {provider} 的 API 金鑰。請按 {provider} 給你的原樣貼上金鑰，不要加入空格。',
    key_is_aishie_token:
      '這是 AIshie 的權杖（你的或代理的），不是 {provider} 的 API 金鑰。AIshie 權杖絕不會傳送給供應商：請貼上 {provider} 給你的金鑰。',
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
