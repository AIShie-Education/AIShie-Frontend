// The school's agent runtime, as its administrators set it (AI and
// documents): the school's AI plan (its models, their keys and the daily
// quotas), today's use of it, reading scanned documents (OCR), and writing
// documents' text versions (the transcriber). The
// runtime's refusals are worded by reason; the hosting pages' words
// (hosting.…) are shared where the two say the same.
export default {
  title: 'AI and documents',
  subtitle:
    'The school’s agent service: the AI models the school provides and pays for, and how scanned documents are read.',
  tabs: {
    plan: 'School AI plan',
    pricing: 'Pricing',
    usage: 'Usage today',
    documents: 'Documents',
    hosting: 'Agent hosting',
  },
  changedBy: 'Changed by {who}, {when}',

  // The page, and each section, where there is nothing to set.
  state: {
    absentTitle: 'This server has no agent service',
    absent:
      'The school’s AI plan and the reading of scanned documents are settings of the agent service, and nothing answers as one on this server. Its operator sets one up beside AIshie.',
    unreachableTitle: 'The agent service cannot be reached',
    unreachable: 'It may be restarting, or down. Try again in a minute.',
    notAdminTitle: 'You are not one of this agent service’s administrators',
    notAdmin:
      'Its operator chooses who administers it, from among AIshie’s administrators. Ask them to add you.',
    notOffered: 'This agent service does not offer this yet: it comes with a newer version of the agent service.',
    reloadFailed: 'Could not read it again: this may be out of date.',
  },

  // The runtime's refusals, by reason.
  errors: {
    not_admin: 'Only the agent service’s administrators may do this, and your account is not one of them.',
    ocr_unavailable:
      'OCR cannot run on this server now, so it cannot be turned on or given languages. It can still be turned off, or set back to the server’s languages.',
    offer_not_found: 'This model is no longer on the plan: someone deleted it meanwhile.',
    offer_exists: {
      config: 'The server’s settings already have a model with this ID. Choose another.',
      site: 'The plan already has a model with this ID. Choose another, or edit that one.',
    },
    offer_read_only: 'The server’s operator set this model in the server’s settings, so it cannot be changed here.',
    offer_not_priced:
      'A quota in dollars needs a price today for every model of the school’s plan, and this would leave one without. Add a price for it, then try again.',
    model_not_priced:
      'A quota in dollars would hold agents whose models have no price. Add prices for them, or keep the quota in answers only.',
    price_not_found: 'This price is no longer in the table: someone deleted it meanwhile.',
    price_exists: {
      id: 'The table already has a price with this ID. Choose another.',
      from: 'The table already has a price for this provider and model from this day ({id}). Edit that one instead.',
    },
    price_read_only:
      'The server’s price file sets this price, so it cannot be changed here. Add one of the site’s for the same model and day to stand before it.',
    key_required: 'Another provider needs its own key: enter the school’s key for {provider}.',
    key_test_failed: 'The key did not pass its trial, so nothing was saved.',
    model_denied:
      'The server’s model lists do not allow this model on the school’s key. Choose another, or ask the operator.',
    version_mismatch:
      'This changed meanwhile, in another tab or by another administrator. Here it is as it is now: check it and try again.',
    bad_if_match: 'The agent service did not take this change as sent. Reload the page and try again.',
    missing_field: 'The agent service did not take this: “{field}” is missing. Reload the page and try again.',
    invalid_field: 'The agent service did not take this: “{field}” is not accepted. Check it and try again.',
    transcription_unavailable:
      'Transcription cannot run on this server now, so it cannot be turned on. It can still be turned off, and set for when it can run.',
    offer_no_file_input:
      'This model reads neither PDFs nor images, so it cannot transcribe. Choose a model of the plan that reads files.',
    credential_rejected:
      'AIshie did not accept the credential when the agent service tried it, so the agent service did not keep it.',
    openrouter_unavailable: 'OpenRouter could not be reached. Try again in a moment.',
    openrouter_model_not_found: 'OpenRouter has no model of this ID.',
  },

  // Reading scanned files and images (OCR).
  ocr: {
    title: 'Reading scanned documents (OCR)',
    intro:
      'When a model cannot read a file itself, the agent service recognizes the text of scanned PDFs and images for it, in the languages chosen here.',
    state: {
      on: 'On',
      off: 'Off',
      unavailable: 'Not available',
    },
    unavailable: {
      operator_off:
        'The server has turned this off, so it never runs, whatever is set here. What you set is kept for when it is turned on; ask the server’s operator.',
      not_installed:
        'OCR’s programs or languages are not installed on this server, so it cannot run. What you set is kept for when they are.',
    },
    details: 'Details',
    enabled: 'Read scanned documents and images',
    enabledHint:
      'Off: no scanned file or image is read for a model that cannot read it itself, and no text read before is given.',
    turnedOn: 'OCR is on.',
    turnedOff: 'OCR is off.',
    languages: 'Languages',
    languagesHint: 'Up to 8. OCR reads them in the order they were chosen.',
    order: 'Read in this order: {list}',
    kept: 'Kept for when OCR can run: {list}',
    serverDefault: 'Server default',
    saveLanguages: 'Save languages',
    useDefault: 'Use the server’s default',
    useDefaultHint: 'The server’s languages: {list}.',
    languagesSaved: 'OCR reads in {list}.',
    defaultRestored: 'OCR reads in the server’s languages again.',
    tooMany: 'Choose at most 8.',
    none: 'Choose at least one, or use the server’s default.',
    neverChanged: 'Not changed here: as the server’s operator set it.',
    vertical: '{name} (vertical)',
    special: {
      osd: 'Orientation and script',
      equ: 'Equations',
    },
  },

  // Documents' text versions (文字版), written by a model of the school's plan (the transcriber).
  transcription: {
    title: 'Transcribing documents (text versions)',
    intro:
      'The agent service transcribes each version of the courses’ files (slides, PDFs, Word) into Markdown once, with a model of the school’s plan, on the school’s key: a text version every model reads, and that readers and staff see beside the file.',
    state: {
      off: 'Off',
      running: 'Running',
      standby: 'Standing by',
      blocked: 'Blocked: {why}',
    },
    blocked: {
      no_credential: 'no credential',
      credential_rejected: 'AIshie refused its credential',
      no_offer: 'no model chosen',
      offer_unavailable: 'its model is not available',
      quota_exhausted: 'today’s pages are used up',
      other: 'see below',
    },
    unavailable: {
      operator_off:
        'The server has turned transcription off, so it never runs, whatever is set here. What you set is kept for when it is turned on; ask the server’s operator.',
      core_too_old:
        'The server this agent service talks to has no transcription queue yet, so it cannot run. What you set is kept for when it has one.',
    },
    enabled: 'Transcribe documents into text versions',
    enabledHint:
      'Off: nothing is transcribed, and course pages do not show what waits to be. Text versions already written stay, and staff can still write them by hand.',
    turnedOn: 'Transcription is on.',
    turnedOff: 'Transcription is off.',
    offer: 'Model',
    noOffer: 'None chosen',
    offerHint:
      'A model of the school’s plan that reads PDFs or images. Its costs are the school’s, as the transcription line.',
    offerStatus: {
      ok: 'Ready',
      not_found: 'No longer on the plan',
      disabled: 'Turned off on the plan',
      no_file_input: 'Cannot read files',
      not_priced: 'No price',
    },
    maxPages: 'Pages a document at most',
    perDayPages: 'Pages a day',
    concurrency: 'Documents at once',
    numbersHint:
      'A document with more pages is skipped, and so is what is claimed once the day’s pages are used up, until they start again at {reset}; staff can send it again later. Leave “Pages a day” empty for no limit.',
    saved: 'Transcription settings saved.',
    invalid: {
      maxPages: 'A whole number from 1 to 5000.',
      perDayPages: 'A whole number from 1 to 1,000,000, or empty for no limit.',
      concurrency: 'A whole number from 1 to 8.',
    },
    neverChanged: 'Not changed here: as the server’s operator set it.',
    credential: {
      title: 'Credential with AIshie',
      status: {
        none: 'None',
        ok: 'Accepted',
        untested: 'Not tried yet',
        rejected: 'Refused',
      },
      lastSeen: 'Last accepted by AIshie',
      givenBy: 'Given to the agent service by {who}, {when}',
      given: 'Given to the agent service {when}',
      neverSeen: 'Not used yet',
      rejected: 'AIshie refused this credential: it was revoked or has expired. Issue a new one.',
      issue: 'Issue and give to the agent service',
      replace: 'Replace',
      withdraw: 'Revoke',
      hint: 'Issuing makes a credential of the transcription service in AIshie and gives it straight to the agent service, which tries it first: it is never shown here, nor kept in this browser. The service’s other credentials are then revoked.',
      replaceAllTitle: 'Replace every credential?',
      replaceAllBody:
        'The transcription service already has {n} credentials, as many as AIshie allows. The new one replaces them all: each stops working at once, the agent service’s too until it takes the new one.',
      replaceAll: 'Replace them all',
      handedOver: 'The agent service has a new credential.',
      unrevoked:
        'One of the service’s other credentials could not be revoked in AIshie, and may still work. | {n} of the service’s other credentials could not be revoked in AIshie, and may still work.',
      withdrawTitle: 'Revoke the transcription credential?',
      withdrawBody:
        'The agent service forgets it and AIshie revokes it: nothing is transcribed until a new one is issued. Work under way stops.',
      withdrawn: 'The credential is revoked.',
      notRevoked:
        'The agent service has forgotten it, but AIshie could not revoke it: it may still work. Try again from here later.',
      refused: {
        rejected:
          'AIshie did not accept the credential when the agent service tried it, so the agent service did not keep it. The credential just issued was revoked.',
        notService:
          'AIshie did not take the credential as the transcription service’s, so the agent service did not keep it. The credential just issued was revoked.',
      },
    },
    // Core's refusals of the service's credentials, by reason.
    coreRefusal: {
      too_many_credentials:
        'The transcription service holds as many credentials as AIshie allows. Revoke one, or replace them all.',
      platform_role_required: 'Only AIshie’s platform administrators issue or revoke the transcription credential.',
    },
    today: {
      title: 'Today',
      reset: 'The counts start again at {reset}.',
      pages: 'Pages',
      of: 'of {n}',
      documents: 'Documents',
      failed: 'Failed',
      skipped: 'Skipped',
      cost: 'Cost',
    },
    jobs: {
      title: 'What it transcribed',
      file: 'File {n}',
      filter: 'Status',
      all: 'All',
      status: {
        working: 'Transcribing',
        done: 'Done',
        failed: 'Failed',
        skipped: 'Skipped',
        dropped: 'Dropped',
      },
      empty: 'Nothing transcribed yet.',
      document: 'Document',
      pages: 'Pages',
      pagesN: 'One page | {n} pages',
      finished: 'Finished',
      since: 'since',
      unpriced: 'No price',
      backfill: 'Earlier upload',
    },
  },

  // The models of the school's plan.
  offers: {
    title: 'Models on the plan',
    intro:
      'The models the school provides and pays for, on its own keys. Owners choose one for their agents; the keys stay on the server, and nobody sees them.',
    add: 'Add a model',
    empty: 'The plan offers no model yet. Add one, and owners can choose it for their agents.',
    model: 'Model',
    status: 'Status',
    key: 'Key',
    agents: 'Agents',
    offered: 'Offered',
    actions: 'Actions',
    statuses: {
      offered: 'Offered',
      disabled: 'Turned off',
      id_taken: 'Shadowed',
      model_not_allowed: 'Not allowed',
    },
    why: {
      config: 'Set by the server’s operator, in the server’s settings.',
      disabled: 'Owners do not see it. Agents on it use their owner’s own model, or wait.',
      id_taken: 'The server’s settings have a model with the same ID, which owners get instead.',
      model_not_allowed: 'The server’s model lists no longer allow its model, so it is not offered.',
    },
    config: 'Read-only',
    configKey: 'On the server',
    always: 'Always',
    unpriced: 'No price',
    unpricedHint: 'The agent service’s price table has no price for this model.',
    tested: 'Tested',
    untested: 'Not tested',
    untestedHint: 'Kept without a trial, or its model changed since.',
    enabledLabel: 'Offer {label} to owners',
    edit: 'Edit',
    delete: 'Delete',
    turnOffTitle: 'Turn off {label}?',
    turnOff:
      'No agent uses it. | One agent uses it: if its owner has a model of their own behind it, that answers; if not, it stops until they choose another. | {n} agents use it: those whose owners have a model of their own behind it go on with that; the others stop until their owners choose another.',
    turnOffConfirm: 'Turn off',
    turnedOn: '{label} is offered to owners.',
    turnedOff: '{label} is turned off.',
    deleteTitle: 'Delete {label}?',
    deleteBody:
      'The model and the school’s key for it are deleted for good. No agent uses it. | The model and the school’s key for it are deleted for good. One agent uses it: if its owner has a model of their own behind it, that answers; if not, it stops until they choose another. | The model and the school’s key for it are deleted for good. {n} agents use it: those whose owners have a model of their own behind it go on with that; the others stop until their owners choose another.',
    deleteAgain: 'Made again with the same ID, it takes its agents back.',
    deleted:
      '{label} is deleted. | {label} is deleted. Its agent answers with its owner’s model, or waits. | {label} is deleted. Its {n} agents answer with their owners’ models, or wait.',
    gone: 'It was deleted meanwhile.',
    changedMeanwhile:
      'This model changed meanwhile, in another tab or by another administrator. The list shows it as it is now: try again.',
    routing: 'Upstream routing',
    routingTitle: 'Sent to OpenRouter with each call',
  },

  // Adding or editing a model of the plan.
  offer: {
    createTitle: 'Add a model to the school’s plan',
    editTitle: 'Edit {label}',
    id: 'ID',
    idHint: 'Letters, digits, _ and -, up to 64. Agents name the model by it, so it cannot be changed later.',
    label: 'Name shown to owners',
    labelHint: 'One line, up to 80 characters, such as “School AI (fast)”.',
    enabled: 'Offer it to owners',
    enabledHint: 'Off: owners do not see it, and agents on it use their owner’s own model, or wait.',
    modelSection: 'Model',
    key: 'The school’s API key',
    keyKeep: 'Keep the key {hint}',
    keyNew: 'Replace the key',
    keyPlaceholder: 'The school’s API key for {provider}',
    keyPlaceholderPrefix: 'The school’s API key for {provider} ({prefix}…)',
    keyHint:
      'It goes to the agent service, which keeps it sealed. Nobody sees it again, here or anywhere: only its end is shown. Before it is kept, the agent service tries it with one short call to {provider}.',
    keyOtherProvider: 'Another provider needs its own key.',
    skipTest: 'Keep the key without trying it',
    skipTestWarning:
      'The key is not tried with {provider}. If it does not work, agents on this model fail until it is replaced. It shows as not tested.',
    retests:
      'The key kept was tried with another model. Saved like this, it shows as not tested: replace it to try it with this one.',
    warning:
      'Owners’ questions, and the course material and work their agents read, go to {provider} under the school’s key and the school’s agreement with {provider}.',
    noProviders: 'The agent service offers no provider for a key. Its operator can offer models in the server’s settings.',
    providersFailed: 'Could not read the providers the agent service offers.',
    add: 'Add',
    created: '{label} is on the school’s plan.',
    createdUntested: '{label} is on the school’s plan. Its key was not tried.',
    saved: '{label} is saved.',
    savedUntested: '{label} is saved. Its key shows as not tested until it is replaced.',
    changedElsewhere:
      'This model changed meanwhile, in another tab or by another administrator. What you changed is kept over it as it is now: check and save again.',
    unpricedTitle: 'A quota in dollars needs a price for this model first:',
    trialFailed: 'The key did not pass its trial: {what}',
    trialNothingKept:
      'Nothing was saved. Check the key and the model. To keep a key that cannot be tried now, choose “Keep the key without trying it”.',
    trialStatus: 'The provider answered HTTP {status}',
    trialCode: 'its code: {code}',
    invalid: {
      id: 'Letters, digits, _ and -, up to 64.',
      idTaken: 'The plan already has a model with this ID.',
      label: 'One line of up to 80 characters.',
      keyRequired: 'Enter the school’s API key for {provider}.',
    },
    routingUnsupported:
      'This server does not take upstream routing yet. Save without it, or ask the server’s operator to update.',
    saveWithoutRouting: 'Save without upstream routing',
  },

  // Amounts of money, and quotas in answers and dollars side by side.
  money: {
    invalidUsd: 'An amount of dollars above 0, up to 1,000,000, with at most 6 decimal places.',
    noLimit: 'No limit',
    answersDay: 'Answers a day',
    usdDay: 'Dollars a day',
    answersOf: '{what}: answers a day',
    usdOf: '{what}: dollars a day',
    serverAnswers: 'Server: {n}',
    serverUsd: 'Server: {usd}',
    serverNone: 'Server: no limit',
  },

  // The plan's quotas a day.
  quotas: {
    title: 'Daily quotas',
    intro: 'Answers a day on the school’s plan. The counts start again at {reset}.',
    introUsd:
      'Answers and dollars a day on the school’s plan, each empty for no limit where it may be. The counts start again at {reset}.',
    perOwner: 'Per owner',
    perOwnerHint: 'Across all of one owner’s agents.',
    perAsker: 'Per person asking',
    perAskerHint: 'For each person who asks one agent, in one course.',
    perDay: 'For the whole school',
    perDayHint:
      'Everything on the school’s key, whoever’s agent answers: agents on the plan, the operator’s agents on the school’s key, and, in dollars, the transcription of documents. Nothing on anyone’s own key counts. Empty for no ceiling.',
    noCeiling: 'No ceiling',
    default: 'Server default: {n}',
    defaultNone: 'Server default: no ceiling',
    set: 'Set here, in place of the server’s defaults.',
    defaults: 'The server’s defaults, as its operator set them.',
    dollars: 'Quotas in dollars, where there are any, stay in force beside these.',
    reset: 'Use the server’s defaults',
    resetTitle: 'Use the server’s defaults?',
    resetBody:
      'The quotas go back to the server’s settings. Per owner: {owner}. Per person asking: {asker}. For the whole school: {day}.',
    resetBodyUsd: 'In dollars, per owner: {owner}. Per person asking: {asker}. For the whole school: {day}.',
    usdNeedsPrices:
      'A quota in dollars counts what the school’s key cost, by the price table: every model of the plan needs a price for it.',
    unpricedTitle: 'A quota in dollars needs a price for every model of the plan, and these have none today:',
    saved: 'The quotas are saved. Every agent keeps them from its next answer.',
    restored: 'The quotas are the server’s defaults again.',
    invalid: 'A whole number from 1 to 1,000,000.',
  },

  // Today's use of the school's plan.
  usage: {
    title: 'Today on the school’s plan',
    since: 'Since {since}. The counts start again at {reset}.',
    answers: 'Answers',
    modelCalls: 'Model calls',
    cost: 'Cost',
    ofDay: 'of {n} a day',
    noCeiling: 'no ceiling for the school',
    limits: 'Up to {owner} a day per owner, and {asker} per person asking.',
    limitsUsd: 'In dollars: {owner} per owner, {asker} per person asking, and {day} for the whole school.',
    noTranscription:
      'This cost leaves out the transcription of documents, which the whole school’s ceiling in dollars counts too.',
    owner: 'Owner',
    operator: 'The operator’s agents',
    unknownOwner: 'Someone the agent service has not seen yet',
    empty: 'Nobody has used the school’s plan today.',
    spent: 'Used up for today',
  },

  // The price table.
  prices: {
    title: 'Prices',
    intro:
      'What models cost, in dollars per million tokens: the server’s price file, and the site’s prices before it. The school’s quotas in dollars, and the costs below, count by these.',
    version: 'Table in force: {version}',
    add: 'Add a price',
    empty: 'The table has no price yet.',
    unpricedTitle: 'These models of the school’s plan have no price today, so a quota in dollars cannot hold them:',
    model: 'Model',
    pattern: 'Pattern',
    from: 'From',
    fromDay: 'from {day}',
    column: {
      input: 'Input',
      cache_read: 'Cache read',
      cache_write: 'Cache write',
      output: 'Output',
    },
    short: {
      input: 'in',
      cache_read: 'cache read',
      cache_write: 'cache write',
      output: 'out',
    },
    // A price in a narrow row, after its kind's short name: "in US$0.40".
    shortPrice: '{kind} {price}',
    source: 'Source',
    sources: {
      site: 'Site',
      file: 'Server’s price file',
    },
    overridden: 'Replaced by the site’s price',
    fromNowOn: 'A change applies to calls from now on: costs already recorded keep the price they had.',
    createTitle: 'Add a price',
    editTitle: 'Edit the price of {model}',
    provider: 'Provider',
    providerPlaceholder: 'Choose or type a provider',
    providerHint: 'As the agent service names it: lower-case letters, digits and _, such as openai or openai_compatible.',
    modelHint: 'Exactly, or a pattern where * is any text, such as gpt-4.1*.',
    fromHint: 'The price starts at {start}, when the day chosen begins in UTC. It may be in the future.',
    perMTok: 'Dollars per million tokens',
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache read',
    cacheWrite: 'Cache write',
    sameAsInput: 'Same as input',
    id: 'ID',
    idHint: 'Letters, digits, . _ and -, up to 64. It names the price in the ledger, so it cannot be changed later.',
    saved: 'The price of {model} from {from} is saved.',
    deleteTitle: 'Delete the price of {model} from {from}?',
    deleteBody: 'Calls from now on are priced by the prices left. Costs already recorded keep the price they had.',
    deleted: 'The price of {model} from {from} is deleted.',
    changedMeanwhile: 'This price changed meanwhile. The table shows it as it is now: try again.',
    changedElsewhere:
      'This price changed meanwhile, in another tab or by another administrator. What you changed is kept over it as it is now: check and save again.',
    addFor: 'Add a price',
    priced: 'Priced: try again.',
    invalid: {
      id: 'Letters, digits, . _ and -, up to 64, beginning with a letter or digit.',
      idTaken: 'The table already has a price with this ID.',
      provider: 'Lower-case letters, digits and _.',
      model: 'Up to 200 characters, with no spaces.',
      from: 'A day, YYYY-MM-DD, from 2000 to 2100.',
      price: 'Dollars per million tokens: 0 or more, with at most 6 decimal places.',
    },
  },

  // Tenants' daily quotas on the school's key.
  tenants: {
    title: 'Quotas per person',
    intro:
      'What all of one person’s agents (or one of the operator’s tenants) may use of the school’s key a day, beside the plan’s quotas. The server’s settings set some; one set here replaces it until it is reset.',
    empty: 'The agent service knows no tenant yet.',
    tenant: 'Person or tenant',
    agents: 'No agent | One agent | {n} agents',
    source: 'Set by',
    sources: {
      site: 'Set here',
      config: 'Server settings',
      none: 'None',
    },
    server: 'server: {v}',
    serverNone: 'The server’s settings set it none.',
    serverQuota: 'The server’s settings: {answers} a day, and {usd}.',
    editTitle: 'Quota for {who}',
    editIntro:
      'Answers and dollars a day on the school’s key, across all their agents. Leave one empty for no limit, but not both.',
    oneAtLeast: 'Set answers, dollars, or both: to go back to the server’s, reset instead.',
    saved: 'The quota for {who} is saved.',
    reset: 'Use the server’s',
    resetTitle: 'Use the server’s quota for {who}?',
    resetBody: 'The quota set here is removed. {server}',
    restored: 'The quota for {who} is the server’s again.',
  },

  // Hosted agents' daily budgets by default.
  budgets: {
    title: 'Agents’ daily budgets',
    intro:
      'What one agent hosted here may use a day, on whichever key it answers: in all, and for each person asking it in a course. The counts start again at {reset}.',
    perAgent: 'Per agent',
    perAgentHint: 'All of one agent’s answers.',
    perAsker: 'Per person asking',
    perAskerHint: 'One agent, in one course, for one person.',
    set: 'Set here, in place of the server’s defaults.',
    defaults: 'The server’s defaults, as its operator set them.',
    hostedOnly:
      'These hold agents hosted here. The server’s own configured agents keep the budgets its settings give them.',
    saved: 'The agents’ budgets are saved.',
    restored: 'The agents’ budgets are the server’s defaults again.',
    resetTitle: 'Use the server’s defaults?',
    resetBody: 'The budgets set here are removed, and the server’s settings hold hosted agents again.',
  },

  // What things cost.
  costs: {
    title: 'What things cost',
    intro:
      'The model calls the ledger recorded, in dollars, as each was priced when it was made. A price changed since does not change them.',
    span: 'Days',
    since: 'From',
    until: 'To',
    keys: 'Keys',
    keySources: {
      all: 'All keys',
      school: 'School’s key',
      own: 'Owners’ own keys',
    },
    groupBy: 'Group by',
    groups: {
      day: 'Day',
      tenant: 'Person',
      agent: 'Agent',
      model: 'Model',
      key_source: 'Key',
      total: 'Total',
    },
    groupColumn: {
      day: 'Day',
      tenant: 'Person or tenant',
      agent: 'Agent',
      model: 'Model',
      key_source: 'Key',
      total: 'All',
    },
    tooLong: 'Choose at most a year of days.',
    cost: 'Cost',
    tokens: 'Tokens',
    inOut: '{input} in · {output} out',
    otherLine: '{kind}: {calls} calls, {usd}',
    kinds: {
      model_calls: 'Model calls',
      transcription: 'Document transcription',
    },
    site: 'The site’s own: document transcription',
    all: 'Everything',
    offers: 'offers: {ids}',
    unpriced:
      'No call went without a price. | One call had no price when it was made, and is counted as {zero}. | {n} calls had no price when they were made, and are counted as {zero}.',
    unpricedShort: '{n} unpriced',
    toPrices: 'Go to the prices',
    empty: 'Nothing was recorded in these days.',
  },

  // The agent runtime's own credential for AIshie Core: the site service agent_runtime (AgentRuntimeCard).
  agentRuntime: {
    title: 'The agent service’s credential for AIshie',
    intro:
      'AIshie’s agent service connects to AIshie with a credential of its own: with it, and nothing else, it checks who owns an agent and is issued, and revokes, the one token of each agent it hosts. Without a live one it hosts no agent.',
    setup:
      'Setting up the server makes it and gives it to the agent service. To rotate it, run {command} on the server: it issues a new one, revokes the others, and restarts the agent service with it.',
    none: 'There is no live credential, so the agent service hosts no agent. Run {command} on the server.',
    showInactive: 'Show revoked and expired ({n})',
    state: {
      live: 'Live',
      revoked: 'Revoked',
      expired: 'Expired',
    },
    issuedBy: 'Issued by',
    bySetup: 'The server, at setup',
    created: 'Issued',
    lastUsed: 'Last used',
    neverUsed: 'Never used',
    expires: 'Expires',
    revokedAt: 'Revoked',
    revoke: 'Revoke',
    revokeTitle: 'Revoke this credential?',
    revokeBody:
      'If the agent service uses it, it hosts no agent until it is given another: run {command} on the server. The tokens of the agents it hosts are not revoked.',
    revoked: 'The credential is revoked.',
    issue: 'Issue a credential',
    issueTitle: 'Issue a credential for the agent service',
    issueBody:
      'One issued here is shown once and given to the agent service by nobody: put it in the agent service’s secret core/agent_runtime on the server, and restart the agent service. {command} on the server does all of that, and is the usual way.',
    label: 'Label',
    labelHint: 'What it is for, so it can be recognised later.',
    replace: 'Revoke its other credentials',
    replaceHint:
      'They stop working at once, the agent service’s too until it is given this one. The agents’ tokens are not revoked.',
    submit: 'Issue',
    issuedTitle: 'Copy the credential now',
    once: 'This is the only time it is shown: AIshie keeps only its hash.',
    replayed: 'This repeated an earlier request, so the credential is not shown again. If it was not copied, revoke it and issue another.',
    credential: 'Credential',
    where:
      'Put it in the agent service’s secret core/agent_runtime on the server (/etc/aishie/runtime/secrets/core/agent_runtime), readable by the agent service alone, and restart the agent service.',
    done: 'I have copied it',
    // Core's refusals of the service's credentials, by reason.
    coreRefusal: {
      too_many_credentials:
        'The agent service holds as many credentials as AIshie allows. Revoke one, or revoke the others as you issue this one.',
    },
  },
  // What only the server's operator acts on, named in a tooltip beside the words (OperatorDetail).
  flags: {
    ocrOff: 'OCR=off in the agent service’s environment.',
    transcribeOff: 'TRANSCRIBE=off in the agent service’s environment.',
    adminActorIds: 'The agent service’s ADMIN_ACTOR_IDS.',
    serverFile: 'The agent service’s runtime.yaml.',
  },

  // OpenRouter's upstream routing on an offer of OpenRouter's: which of the upstream providers serving its model may
  // answer, which are tried first, and on what terms. The words never say how the server is built.
  openrouter: {
    title: 'OpenRouter upstream routing',
    intro:
      'OpenRouter passes each call to one of the upstream providers that serve this model. Choose which of them may answer, which to try first, and on what terms. Left as it is, OpenRouter chooses by price and uptime.',
    data: 'Data',
    denyData: 'Only upstream providers that keep no data',
    denyDataHint:
      'Leaves out upstream providers that may store what is sent to them and train models on it. Recommended for a school.',
    zdr: 'Only zero-data-retention (ZDR) endpoints',
    zdrHint:
      'Stricter still: only endpoints that keep nothing of a call once it is answered. Fewer upstream providers qualify; the list marks those that do.',
    upstreams: 'Upstream providers',
    mode: 'Which may answer',
    modeAll: 'All, except those turned off',
    modeOnly: 'Only those turned on',
    modeOnlyHint:
      'Turn on each upstream provider that may answer. The fewer there are, the less is left to fall back on when one is down.',
    colProvider: 'Upstream provider',
    colPrice: 'Input / output, per million tokens',
    colTools: 'Calls tools',
    colUptime: 'Uptime, 30 min / 1 day',
    colUse: 'Use',
    colOrder: 'Try first',
    pricePair: '{input} / {output}',
    uptimePair: '{m30} / {d1}',
    yes: 'Yes',
    no: 'No',
    use: 'Use {name} ({slug})',
    // The same switch, turned on, of an upstream provider a limit leaves out.
    useLeftOut: 'Use {name} ({slug}), left out by: {controls}',
    // An upstream provider, as the buttons of its row are named for it and the order's changes are said.
    who: '{name} ({slug})',
    tryFirst: 'Try first',
    position: 'No. {n}',
    moveUp: 'Try earlier',
    moveDown: 'Try later',
    unorder: 'Do not try first',
    // Said to a screen reader as the order changes.
    ordered: '{who} is tried first, No. {n} of {total}.',
    unordered: '{who} is no longer tried first.',
    context: '{n} tokens of context',
    maxOutput: 'up to {n} out',
    based: 'Based in {country}',
    zdrTag: 'ZDR',
    degraded: 'Not running normally',
    notListed: 'Not serving this model now',
    covered: 'Included in {slug}',
    discount: '{pct} off',
    higherAbove: 'Costs more above {n} input tokens',
    privacy: 'Privacy policy',
    terms: 'Terms of service',
    statusPage: 'Service status',
    // The same, as a word each on an upstream provider's row, where the words above name them to a screen reader.
    privacyShort: 'Privacy',
    termsShort: 'Terms',
    statusPageShort: 'Status',
    excludedBy: 'Left out by: {controls}',
    addSlug: 'Add by slug',
    addSlugPlaceholder: 'such as deepinfra/turbo or google-vertex',
    addSlugHint: 'A slug without “/” names every endpoint of its provider, its regions and variants included.',
    add: 'Add',
    alsoSkipped: 'Also skipped: {slugs}',
    loading: 'Reading OpenRouter’s upstream providers for {model}…',
    needModel: 'Enter the model, such as meta-llama/llama-3.3-70b-instruct, to list its upstream providers.',
    unavailable: 'OpenRouter could not be reached to list the upstream providers. They can still be added by slug.',
    modelNotFound: 'OpenRouter has no model {model}. Check the model’s ID.',
    none: 'OpenRouter lists no upstream provider for {model} now.',
    listed: 'As OpenRouter listed them at {time}.',
    stale: 'OpenRouter could not be reached just now; this list is from {time}.',
    notOffered: 'This server cannot list OpenRouter’s upstream providers yet. They can still be added by slug.',
    choosing: 'Choosing among them',
    fallbacks: 'If those tried first cannot answer, let OpenRouter use others',
    fallbacksHint:
      'Off: a call goes only to those tried first (with none chosen, to the one OpenRouter picks first), and fails when they cannot answer.',
    requireParameters: 'Only upstream providers that take every setting of a call',
    requireParametersHint:
      'Agents call tools. On, an upstream provider that cannot call tools, or would ignore a setting such as the reasoning effort, is never used. Recommended.',
    sort: 'Choose among them by',
    sortBy: {
      default: 'OpenRouter’s balance of price and uptime',
      price: 'Lowest price',
      throughput: 'Fastest output',
      latency: 'Quickest to start answering',
      exacto: 'Best at calling tools (Exacto)',
    },
    sortHint: 'Any choice but OpenRouter’s own tries them strictly in that order, with no load balancing.',
    sortWithOrder: 'Not used while some upstream providers are tried first.',
    speed: 'Preferred speed',
    speedHint:
      'Upstream providers that miss these are tried last, not left out. Over the last 5 minutes: p90 means 9 calls in 10 do at least this well.',
    throughput: 'Output of at least, tokens a second',
    latency: 'First token within, seconds',
    pct: {
      p50: 'Median (p50)',
      p75: 'p75',
      p90: 'p90',
      p99: 'p99',
    },
    limits: 'Limits',
    quantizations: 'Precision the model runs at',
    quantizationsHint:
      'Only upstream providers that run the model at one of these. None chosen: any. Lower precision costs less and may answer worse.',
    quant: {
      unknown: 'Not stated',
    },
    maxPrice: 'Highest price accepted',
    maxPriceHint: 'Upstream providers that charge more are left out; with none left, the call fails.',
    maxPrompt: 'Input, per million tokens',
    maxCompletion: 'Output, per million tokens',
    maxRequest: 'Per call',
    maxImage: 'Per image',
    warnNone:
      'No upstream provider this routing allows serves this model now: every call would fail. Allow more, or loosen a limit.',
    warnNoTools:
      'None of the upstream providers allowed can call tools: agents on this model could not read the course or act in it.',
    noteSomeNoTools: '{names} cannot call tools, so agents’ calls skip them.',
    preview: 'What is sent to OpenRouter',
    previewEmpty: 'Nothing: OpenRouter routes each call as it does by default.',
    clear: 'Clear the upstream routing',
    clearHint: 'Every setting above goes back to OpenRouter’s own, and nothing is sent with the calls.',
    cleared: 'The upstream routing is cleared: OpenRouter routes each call as it does by default.',
    prices: 'Prices',
    pricesNote:
      'OpenRouter charges what the upstream provider that answered charges. Quotas in dollars and the costs report count every call at the price table’s price for this model, whichever upstream provider answered.',
    highest:
      'The upstream providers allowed charge up to {input} for input and {output} for output, per million tokens.',
    table: 'The school’s price table counts {input} for input and {output} for output.',
    tableNone: 'The school’s price table has no price for this model.',
    tableLow:
      'Quotas in dollars count the price table’s price, which is below what some upstream providers allowed charge: the school could spend more than its quotas say. Raise the price to at least the highest, or set a highest price accepted.',
    setPrice: 'Set the price',
    invalid: {
      slug: 'Lower-case letters, digits and -, then any /part, such as deepinfra/turbo.',
      slugTwice: 'Already listed.',
      onlyNone: 'Turn on at least one upstream provider, or choose “All, except those turned off”.',
      throughput: 'More than 0, up to 100,000.',
      latency: 'More than 0, up to 600 seconds.',
      price: 'Dollars: 0 or more, up to 1,000,000, at most 6 decimal places.',
    },
  },
}
