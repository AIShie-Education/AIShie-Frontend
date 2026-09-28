// Hosting an agent on the school's runtime (M2): the choice of where an agent
// runs, connecting it, its model and key, its hosted card, and the runtime's
// errors by reason. The words for statuses, problems and errors are the
// contract's (m2.api.spec.md §6.1 and §9.5).
export default {
  // Where the agent runs: one brain at a time.
  choice: {
    title: 'How this agent runs',
    intro:
      'An agent has one brain at a time: AIShie hosts it, or an AI tool or runtime of yours runs it. Not two at once, or both would answer every question.',
    hosted: 'Host it on AIShie',
    hostedHint: 'AIShie runs it for you, on a model you choose with your own API key. Nothing to install, no token to handle.',
    recommended: 'Recommended',
    tool: 'Connect another AI tool (Claude, ChatGPT, an agent SDK…)',
    toolHint: 'Your own AI tool answers as this agent, over MCP, with one of its tokens.',
    runtime: 'Run the AIShie runtime yourself (advanced)',
    runtimeHint: 'For someone who operates an AIShie Agent Runtime of their own.',
    hostedIntro:
      'AIShie makes a token for the agent and hands it to the school’s runtime without showing it; then you choose a model and give your API key.',
    host: 'Set up hosting',
    hostSuspended: 'The agent is suspended: reactivate it first.',
    paste: 'I have a token for this agent',
    selfWhileHosted: 'Connect another AI tool, or run the runtime yourself, instead',
    selfWhileHostedNote:
      'These apply only after you stop hosting: delete the agent from AIShie’s hosting first (More ▸ Delete), which revokes the runtime’s token. While both run it, both answer every question.',
  },

  // The wizard's first step, and giving a hosted agent a new token.
  connect: {
    title: 'Host {name} on the school’s runtime',
    steps: {
      confirm: 'Confirm',
      model: 'Model and key',
    },
    body: 'The school’s runtime will run this agent as it is seated in AIShie. It keeps the agent’s token encrypted; you will not see it. Next you choose a model and give your API key.',
    seats: 'Where it is seated',
    noSeats: 'It is not in any course yet. Once hosted, it has nothing to answer until you bring it into one.',
    purpose: {
      personal: 'Answers only you',
      course: 'Answers every student',
    },
    submit: 'Connect',
    done: '{name} is on the school’s runtime',
    replaceTitle: 'New token for {name} on the school’s runtime',
    replaceBody:
      'A new token labelled “AIShie runtime” is made and handed to the runtime, which then revokes the one it had. You will not see either.',
    replaceSubmit: 'Replace token',
    reconnectTitle: 'Connect {name} again',
    reconnectBody:
      'AIShie refused the token the runtime had. A new token labelled “AIShie runtime” is made and handed to the runtime; you will not see it.',
    reconnectSubmit: 'Connect again',
    replaced: 'The runtime has a new token for {name}',
    previousNotRevoked:
      'The runtime has the new token, but its old one could not be revoked. Revoke the older “AIShie runtime” token in the Tokens list below.',
  },

  // The one-brain rule.
  oneBrain: {
    title: 'Something else is running this agent',
    body: 'Another of its tokens was used in the last few minutes: a runtime of your own, or another MCP client, is running it. If the school’s runtime runs it too, both answer every question. Revoke those tokens to stop it, or go on if you will stop it yourself.',
    used: 'last used',
    revoke: 'Revoke them and connect',
    anyway: 'Connect anyway',
    revokeReplace: 'Revoke them and go on',
    anywayReplace: 'Go on anyway',
    revokeResume: 'Revoke them and resume',
    anywayResume: 'Resume anyway',
    revokeFailed: 'Not every one of those tokens could be revoked, so nothing more was done. Try again, or revoke them in the Tokens list below.',
    sameTokenTitle: 'This token is in use',
    sameToken:
      'If a runtime of your own uses this token, stop it first: both would answer every question. It was last used',
  },

  // "I have a token for this agent".
  paste: {
    title: 'Host {name} with a token you have',
    intro:
      'Paste one of this agent’s tokens. The runtime keeps it encrypted and it is not shown again. This page never revokes a token you paste: you decide what else uses it.',
    token: 'Agent token',
    placeholder: 'ais_…',
    check: 'Check',
    agent: 'Agent',
    seats: 'Where it is seated',
    alreadyConnected: 'Already connected.',
    takesOver: 'Connecting replaces the copy an earlier owner left.',
    submit: 'Connect',
  },

  // The model and the owner's own key (F3).
  model: {
    title: 'Model and key for {name}',
    provider: 'Provider',
    providerPlaceholder: 'Choose a provider',
    adapter: 'API style',
    adapters: {
      openai_chat: 'Chat Completions',
      openai_responses: 'Responses',
      anthropic: 'Messages',
      gemini: 'Gemini API',
      bedrock_converse: 'Converse',
    },
    endpoint: 'Endpoint',
    resource: 'Azure resource name',
    resourceHint: 'The name of your Azure OpenAI resource, such as {example}.',
    region: 'AWS region',
    model: 'Model',
    modelPlaceholder: 'Choose or type a model',
    priceUnknown: 'price unknown',
    key: 'API key',
    keyKeep: 'Keep saved key {hint}',
    keyNew: 'Enter a new key',
    keyPlaceholder: 'Your API key for {provider}',
    keyPlaceholderPrefix: 'Your API key for {provider} ({prefix}…)',
    keyNotStored:
      'The key goes to the school’s runtime, which keeps it encrypted for this agent. This page never keeps it or shows it again.',
    advanced: 'Advanced',
    maxOutputTokens: 'Most output tokens per answer',
    maxOutputTokensHint: 'From 256 to 32000. Leave it empty for the runtime’s default.',
    reasoningEffort: 'Reasoning effort',
    reasoningDefault: 'The model’s default',
    effort: {
      minimal: 'Minimal',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    },
    warning:
      'Your questions, and the course material and work your agent reads, go to {provider} under your key and that provider’s terms. Only your own agent ever uses this key.',
    noProviders: 'The school’s runtime offers no provider for your own key.',
    test: 'Test key',
    later: 'Later',
    saved: 'Saved. The runtime is starting your agent with these settings.',
    confirmUntestedTitle: 'Save a key that did not pass?',
    confirmUntested: 'The key did not pass the test ({result}). Save anyway?',
    saveAnyway: 'Save anyway',
    changedElsewhere: 'This agent changed in another tab or window; check and save again.',
    invalid: {
      required: 'Required',
      model: 'A model name is letters, digits and . _ : / @ + -, up to 128 characters.',
      resource: 'Lower-case letters, digits and hyphens, as Azure names a resource.',
      region: 'An AWS region, such as us-east-1.',
      maxOutputTokens: 'A whole number from 256 to 32000.',
    },
  },

  // One token's test of a key (POST /keys/test).
  keyTest: {
    ok: 'The key works with {model}.',
    key_refused: '{provider} refused this key.',
    model_not_found: 'The key works, but {provider} has no model {model}.',
    key_accepted: 'The key was accepted, but the test call failed (HTTP {status}). You can still save.',
    unreachable: 'Could not reach {provider}. Try again.',
    short: {
      ok: 'it works',
      key_refused: 'the key was refused',
      model_not_found: 'no such model',
      key_accepted: 'the test call failed',
      unreachable: 'the provider could not be reached',
      none: 'not tested',
    },
  },

  // A hosted agent's status (§6.1).
  status: {
    needs_model: {
      title: 'Choose a model',
      body: 'Your agent is connected, but it has no model yet. Choose a provider and model and give your API key to start it.',
    },
    starting: {
      title: 'Starting',
      body: 'The runtime is starting your agent with its latest settings. This takes a few seconds.',
    },
    running: {
      title: 'Running',
      body: 'Your agent runs on the school’s runtime and answers in its courses.',
    },
    paused: {
      title: 'Paused',
      body: 'Your agent answers nobody and makes no calls, so it shows as offline. Resume it to start again. (This is not Suspend: the agent stays active in AIShie.)',
    },
    needs_token: {
      title: 'Needs a new token',
      body: 'AIShie refused your agent’s token: it was revoked or expired. Connect it again to give the runtime a new one.',
    },
    error: {
      title: 'Not running',
      body: 'The runtime is not running your agent.',
    },
    stopped: {
      title: 'Restarting',
      body: 'The runtime stopped your agent while it restarts or hands it to another worker. It starts again by itself.',
    },
  },

  // Why it needs a token or does not run (problem.reason).
  problem: {
    token_refused: 'AIShie refused the agent’s token.',
    settings_rejected: 'Its settings do not work here: {detail}. Change the model or key.',
    runtime_misconfigured: 'The school’s runtime is not set up to run hosted agents. Tell your administrator.',
    operator_agent: 'The school’s operator already runs this agent, so this copy does not run.',
    actor_in_use: 'Another agent here already uses this agent’s identity.',
    token_other_agent: 'Its token belongs to another agent. Connect it again.',
    token_not_agent: 'Its token is a person’s, not the agent’s. Connect it again.',
    owner_changed: 'This agent now belongs to someone else in AIShie, so the runtime stopped it. Delete it here.',
    core_too_old: 'This AIShie server cannot say who owns an agent. Tell your administrator.',
    agent_suspended: 'The agent is suspended in AIShie. Reactivate it and it starts again by itself.',
    failing: 'It could not start and will try again shortly: {detail}.',
  },

  // A seat, in sentences from the runtime's facts.
  seat: {
    delegate: 'Your delegate in {course}: reads {reads}; answers only you.',
    tutor: 'Tutor of {course}: answers every student; reads {reads}.',
    member: 'Member of {course}: reads {reads}.',
    reads: {
      both: 'the course material and students’ work',
      material: 'the course material',
      work: 'students’ work',
      nothing: 'nothing',
    },
    silent: 'Does not answer now ({why}).',
    why: {
      seatPaused: 'seat paused',
      courseArchived: 'course archived',
      answeringOff: 'answering is off',
    },
    waitsApproval: 'Its answers wait for approval.',
    none: 'It is not in any course: it has nothing to answer.',
  },

  // The hosted card.
  card: {
    title: 'Hosted on AIShie',
    details: 'Details',
    since: 'Since',
    model: 'Model',
    noModel: 'None yet',
    key: 'Key',
    token: 'Token',
    today: 'Today',
    answers: 'No answers | One answer | {n} answers',
    costUnknown: 'cost unknown',
    proposals: 'One answer waits for approval. | {n} answers wait for approval.',
    seats: 'Courses',
    primary: {
      chooseModel: 'Choose a model',
      reconnect: 'Connect again',
      changeModel: 'Change model or key',
    },
    pause: 'Pause',
    resume: 'Resume',
    pauseHint: 'Stops the agent here; it stays active in AIShie.',
    paused: 'Paused on the school’s runtime',
    resumed: 'Resumed on the school’s runtime',
    more: 'More',
    replaceToken: 'Replace token',
    delete: 'Delete from the school’s runtime',
    usedByRuntime: 'Used by the school’s runtime',
    issueWhileHosted:
      'The school’s runtime runs this agent. Anything you start with a new token would answer too: to run it yourself, delete it from the school’s runtime first.',
  },

  // Deleting it from the runtime.
  delete: {
    title: 'Delete {name} from the school’s runtime?',
    body: 'The runtime stops this agent, forgets its settings and your key, and revokes its token “AIShie runtime”. The agent stays in AIShie; you can host it again later.',
    proposals:
      'One answer still waiting for approval stays in AIShie. | {n} answers still waiting for approval stay in AIShie.',
    alsoRevoke: 'Also revoke its token',
    alsoRevokeHint: 'This page did not make its token (“{label}”). Keep it only if something else uses it.',
    alsoRevokeHintUnlabelled: 'This page did not make its token. Keep it only if something else uses it.',
    submit: 'Delete',
    done: '{name} is no longer on the school’s runtime',
    fallbackFailed: 'Revoke the token “AIShie runtime” in the Tokens list below.',
    notAttempted: 'Its token still works; revoke it below if nothing else uses it.',
  },

  // The runtime's errors, by reason (§9.5).
  errors: {
    details: 'Details',
    assertion: 'Could not sign you in to the school’s runtime. Reload the page and try again.',
    unavailable: 'The school’s runtime is not available right now. Try again in a minute.',
    network: 'The school’s runtime could not be reached. Check your connection and try again.',
    core_unavailable: 'The runtime could not reach AIShie. Try again in a minute.',
    rate_limited: 'Too many tries. Wait {seconds} seconds.',
    token_malformed: 'That is not an AIShie agent token (it should begin with ais_).',
    token_refused: 'AIShie refused this token: it was revoked or has expired.',
    token_not_agent: 'This token is a person’s, not an agent’s. The runtime only takes an agent’s own token.',
    agent_suspended: 'This agent is suspended in AIShie. Reactivate it first.',
    token_other_agent: 'This token belongs to another agent.',
    agent_unowned: 'Nobody owns this agent in AIShie, so it cannot be connected here. Ask an administrator.',
    not_owner: 'This agent belongs to someone else. Only its owner can connect it.',
    core_too_old: 'This AIShie server is too old for hosting. Tell your administrator.',
    already_hosted: 'This agent is already on the school’s runtime.',
    operator_agent: 'The school’s operator already runs this agent.',
    agent_not_found: 'This agent is no longer on the school’s runtime.',
    version_mismatch: 'This agent changed in another tab or window. Check the latest settings and save again.',
    school_key_not_offered: 'The school’s key is not offered yet.',
    own_key_required: 'Enter your API key for {provider}.',
    own_key_provider_mismatch: 'Your saved key is for another provider. Enter a key for {provider}.',
    model_denied: 'The school does not allow this model. Choose another.',
    settings_rejected: 'The runtime cannot run these settings.',
    key_malformed: 'That does not look like an API key.',
    unknown_provider: 'Choose one of the providers offered.',
    adapter_not_offered: 'Choose one of the API styles offered.',
    unknown_endpoint: 'Choose one of the endpoints offered.',
    invalid_field: 'This value is not accepted here.',
  },

  // Hosting that is not for this person, or not here after all.
  unavailable: {
    account: 'Hosting on the school’s runtime is not available for this account.',
    absent: 'The school’s runtime is not available on this server. Reload the page.',
  },
}
