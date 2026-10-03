// Hosting an agent on the school's runtime (M2): offering it to a runtime
// agent not hosted yet, hosting it by its id, its model and key, its hosted
// card, what became of its token when its hosting ended, and the runtime's
// errors by reason. The words for statuses, problems and errors are the
// contract's (m2.api.spec.md §6.1 and §9.5, and runtime-hosting-api.md).
export default {
  // A runtime agent not hosted yet, on its page: hosting it.
  offer: {
    title: 'Hosted on AIshie',
    notHosted: 'Not hosted yet',
    body: 'AIshie’s agent service runs this agent once you choose the model it answers with; then people in its courses can ask it on the site. You never handle a token.',
    bodySchool:
      'AIshie’s agent service runs this agent once you choose the school’s plan, or a model with your own API key; then people in its courses can ask it on the site. You never handle a token.',
    host: 'Set up hosting',
    hostSuspended: 'The agent is suspended: reactivate it first.',
    absent:
      'AIshie’s agent service is not available on this server, so this agent cannot run here yet. Tell your administrator.',
    notById: 'The school’s agent service cannot host agents at the moment: it is not set up to. Tell your administrator.',
    noModel: 'The school’s agent service offers no model to choose at the moment, so it cannot host agents now.',
  },

  // Hosting one of one's agents by its id: the wizard's first step, before "Model and key".
  host: {
    open: 'Host an agent on AIshie',
    title: 'Host an agent on AIshie',
    titleNamed: 'Host {name} on AIshie',
    steps: {
      agent: 'Agent',
      model: 'Model and key',
    },
    body: 'The school’s agent service runs the agent as it is seated in AIshie, and people in its courses can ask it on the site. The agent service is issued the agent’s token itself: you never see one. Next you choose a model and give your API key.',
    bodySchool:
      'The school’s agent service runs the agent as it is seated in AIshie, and people in its courses can ask it on the site. The agent service is issued the agent’s token itself: you never see one. Next you choose the school’s plan, or a model with your own API key.',
    agent: 'Agent',
    agentPlaceholder: 'Choose one of your agents',
    none: 'None of your agents is waiting to be hosted. Only an agent created as “Hosted on AIshie” can be: one with MCP access is used from your own tools.',
    checking: 'Asking AIshie about it…',
    seats: 'It is not in any course yet: once hosted, it has nothing to answer until you bring it into one. | It is in one course. | It is in {n} courses.',
    already: 'It is hosted on AIshie already.',
    openIt: 'Open its page',
    takesOver: 'An earlier hosting of it, left by someone else, is replaced.',
    submit: 'Host it',
    done: '{name} is hosted on AIshie',
  },

  // What became of its token in AIshie when its hosting ended (pausing, deleting).
  revocation: {
    failedPause:
      'Its token could not be revoked in AIshie ({why}), so people may still be offered to ask it on the site. Pause it again to try once more.',
    failedDelete:
      'Its token could not be revoked in AIshie ({why}), so people may still be offered to ask it on the site. Suspend the agent to stop that.',
    not_attempted: 'Its token was not revoked ({why}).',
    why: {
      core_unavailable: 'AIshie could not be reached',
      runtime_misconfigured: 'the school’s agent service is not set up to',
      core_too_old: 'this AIshie server is too old',
      operator_agent: 'the school’s operator runs this agent',
      unknown: 'for a reason it did not say',
    },
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
      'The key goes to the school’s agent service, which keeps it encrypted for this agent. This page never keeps it or shows it again.',
    advanced: 'Advanced',
    maxOutputTokens: 'Most output tokens per answer',
    maxOutputTokensHint: 'From 256 to 32000. Leave it empty for the agent service’s default.',
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
    noProviders: 'The school’s agent service offers no provider for your own key.',
    test: 'Test key',
    later: 'Later',
    saved: 'Saved. The agent service is starting your agent with these settings.',
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

  // The school's AI plan (D8): the school provides the model and pays for it.
  school: {
    choice: 'School plan',
    choiceHint: 'The school provides the model and pays for it. No API key needed.',
    own: 'Your own key',
    ownHint: 'A provider and model you choose, on your own API key.',
    offer: 'Model',
    limits:
      'Up to {owner} answers a day across all your agents, and {asker} a day for each person who asks. The counts start again at {reset}.',
    noKey: 'The school’s key stays on the school’s server. Nobody sees it, you included.',
    warning:
      'Your questions, and the course material and work your agent reads, go to the model’s provider under the school’s agreement with it.',
    fallbackTitle: 'Fallback: your own key',
    fallbackOn: 'Answer with my own key once the school allowance is used up',
    fallbackHint:
      'Optional. Without it, once today’s allowance is used up your agent tells people “Today’s school AI allowance is used up. Please try again tomorrow.”',
    saved: 'Saved. The agent service is starting your agent on the school’s plan.',
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
      body: 'Your agent is hosted, but it has no model yet. Choose a provider and model and give your API key to start it.',
      bodySchool:
        'Your agent is hosted, but it has no model yet. Choose the school’s plan, or a provider and model with your API key, to start it.',
    },
    starting: {
      title: 'Starting',
      body: 'The agent service is starting your agent with its latest settings. This takes a few seconds.',
    },
    running: {
      title: 'Running',
      body: 'Your agent runs on the school’s agent service and answers in its courses.',
    },
    paused: {
      title: 'Paused',
      body: 'Your agent answers nobody, makes no calls and cannot be asked on the site: its token was revoked in AIshie. Resume it to start again with a new one. (This is not Suspend: the agent stays active in AIshie.)',
    },
    needs_token: {
      title: 'Needs a new token',
      body: 'The token the agent service held for your agent was revoked in AIshie, by you or an administrator. Connect it again to have the agent service issued a new one; you never see it.',
    },
    error: {
      title: 'Not running',
      body: 'The agent service is not running your agent.',
    },
    stopped: {
      title: 'Restarting',
      body: 'The agent service stopped your agent while it restarts or hands it to another worker. It starts again by itself.',
    },
  },

  // Why it needs a token or does not run (problem.reason).
  problem: {
    token_refused: 'AIshie revoked the token the agent service held for it.',
    settings_rejected: 'Its settings do not work here: {detail}. Change the model or key.',
    runtime_misconfigured: 'The school’s agent service is not set up to run hosted agents. Tell your administrator.',
    operator_agent: 'The school’s operator already runs this agent, so this copy does not run.',
    actor_in_use: 'Another agent here already uses this agent’s identity.',
    token_other_agent: 'The token the agent service held belongs to another agent. Connect it again.',
    owner_changed: 'AIshie does not count this agent as yours, so the agent service stopped it. Delete it here.',
    core_too_old: 'This AIshie server cannot say who owns an agent. Tell your administrator.',
    agent_suspended: 'The agent is suspended in AIshie. Reactivate it and it starts again by itself.',
    owner_suspended: 'Its owner is suspended in AIshie. It starts again by itself once they are reactivated.',
    mcp_agent:
      'AIshie says this agent has MCP access: it is used from its owner’s own tools, so the agent service cannot host it. Delete it here.',
    agent_not_found: 'AIshie has no such agent any more. Delete it here.',
    failing: 'It could not start and will try again shortly: {detail}.',
    offer_withdrawn:
      'The school no longer offers the model it was on, and no model of yours stands behind it, so it does not run. Choose another of the school’s models, or a model of your own.',
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
    title: 'Hosted on AIshie',
    details: 'Details',
    since: 'Since',
    model: 'Model',
    noModel: 'None yet',
    key: 'Key',
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
    pauseHint: 'Stops the agent here; it stays active in AIshie.',
    paused: 'Paused on the school’s agent service',
    resumed: 'Resumed on the school’s agent service',
    more: 'More',
    delete: 'Delete from the school’s agent service',
    renewed: 'The agent service is being issued a new token for {name}.',
    ownKeyOff:
      'The school’s agent service does not take a model and key of your own at the moment, so they cannot be changed here.',
    renewOff: 'The school’s agent service cannot host agents by their id at the moment, so it cannot be connected again here.',
    plan: 'Plan',
    schoolPlan: 'School plan (paid by the school)',
    fallback: 'Fallback',
    fallbackNone: 'None: answers pause until tomorrow once the allowance is used up',
    schoolAllowance: 'School allowance',
    todaySchool: '{used} / {limit} today',
    todaySchoolHint: 'The school plan, across all your agents. Starts again at {reset}.',
    perAsker: 'Each person who asks: up to {n} a day',
    thisAgent: 'This agent today',
    spentFallback: 'Today’s school allowance is used up: your own key answers until {reset}.',
    spentNone: 'Today’s school allowance is used up: until {reset} your agent asks people to try again tomorrow.',
    offerWithdrawn: 'The school no longer offers this plan. Choose another, or your own key.',
    offerWithdrawnFallback:
      'The school no longer offers this plan: your agent answers with your own model and key until you choose another.',
  },

  // Deleting it from the runtime.
  delete: {
    title: 'Delete {name} from the school’s agent service?',
    body: 'The agent service stops this agent and forgets its settings and your key, and its token is revoked in AIshie: nobody can ask it on the site until you host it again. The agent stays in AIshie.',
    proposals:
      'One answer still waiting for approval stays in AIshie. | {n} answers still waiting for approval stay in AIshie.',
    submit: 'Delete',
    done: '{name} is no longer on the school’s agent service',
  },

  // The runtime's errors, by reason (§9.5).
  errors: {
    details: 'Details',
    assertion: 'Could not sign you in to the school’s agent service. Reload the page and try again.',
    unavailable: 'The school’s agent service is not available right now. Try again in a minute.',
    network: 'The school’s agent service could not be reached. Check your connection and try again.',
    core_unavailable: 'The agent service could not reach AIshie. Try again in a minute.',
    rate_limited: 'Too many tries. Wait {seconds} seconds.',
    runtime_misconfigured: 'The school’s agent service is not set up to host agents. Tell your administrator.',
    mcp_agent: 'This agent has MCP access: it is used from your own tools, and is never hosted here.',
    agent_suspended: 'This agent is suspended in AIshie. Reactivate it first.',
    owner_suspended: 'Its owner is suspended in AIshie, so it cannot be hosted. Ask an administrator.',
    owner_changed: 'AIshie no longer counts this agent as yours: delete it here.',
    core_too_old: 'This AIshie server is too old for hosting. Tell your administrator.',
    operator_agent: 'The school’s operator already runs this agent.',
    agent_not_found: 'This agent is no longer on the school’s agent service.',
    agent_not_yours: 'AIshie does not count this as one of your agents.',
    version_mismatch: 'This agent changed in another tab or window. Check the latest settings and save again.',
    changedMeanwhile:
      'This agent changed meanwhile, in another tab or window. Here it is as it is now: check it and try again.',
    school_key_not_offered: 'The school’s plan is not offered here.',
    unknown_offer: 'The school no longer offers this model. Choose another.',
    own_key_required: 'Enter your API key for {provider}.',
    own_key_provider_mismatch: 'Your saved key is for another provider. Enter a key for {provider}.',
    model_denied: 'The school does not allow this model. Choose another.',
    settings_rejected: 'The agent service cannot run these settings.',
    key_malformed:
      'That does not look like an API key from {provider}. Paste the key exactly as {provider} gave it, with no spaces.',
    key_is_aishie_token:
      'That is an AIshie token (yours or an agent’s), not an API key from {provider}. An AIshie token is never sent to a provider: paste the key {provider} gave you.',
    unknown_provider: 'Choose one of the providers offered.',
    adapter_not_offered: 'Choose one of the API styles offered.',
    unknown_endpoint: 'Choose one of the endpoints offered.',
    invalid_field: 'This value is not accepted here.',
    unknown_field:
      'The school’s agent service did not take this request: it has no field “{field}”. Reload the page and try again.',
    unknown_parameter:
      'The school’s agent service did not take this request: it takes no “{field}” in the address. Reload the page and try again.',
  },

  // Hosting that is not for this person, or not here after all.
  unavailable: {
    account: 'Hosting on the school’s agent service is not available for this account.',
    absent: 'The school’s agent service is not available on this server. Reload the page.',
  },
}
