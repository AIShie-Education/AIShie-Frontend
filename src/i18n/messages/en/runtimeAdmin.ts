// The school's agent runtime, as its administrators set it (AI and
// documents): the school's AI plan (its models, their keys and the daily
// quotas), today's use of it, and reading scanned documents (OCR). The
// runtime's refusals are worded by reason; the hosting pages' words
// (hosting.…) are shared where the two say the same.
export default {
  title: 'AI and documents',
  subtitle:
    'The school’s agent runtime: the AI models the school provides and pays for, and how scanned documents are read.',
  tabs: {
    plan: 'School AI plan',
    usage: 'Usage today',
    documents: 'Documents',
  },
  changedBy: 'Changed by {who}, {when}',

  // The page, and each section, where there is nothing to set.
  state: {
    absentTitle: 'This server has no agent runtime',
    absent:
      'The school’s AI plan and the reading of scanned documents are settings of the agent runtime, and nothing answers as one on this server. Its operator sets one up beside AIshie.',
    unreachableTitle: 'The agent runtime cannot be reached',
    unreachable: 'It may be restarting, or down. Try again in a minute.',
    notAdminTitle: 'You are not one of this runtime’s administrators',
    notAdmin:
      'Its operator chooses who administers it, from among AIshie’s administrators (the runtime’s ADMIN_ACTOR_IDS). Ask them to add you.',
    notOffered: 'This runtime does not offer this yet: it comes with a newer version of the agent runtime.',
    reloadFailed: 'Could not read it again: this may be out of date.',
  },

  // The runtime's refusals, by reason.
  errors: {
    not_admin: 'Only the runtime’s administrators may do this, and your account is not one of them.',
    ocr_unavailable:
      'OCR cannot run on this server now, so it cannot be turned on or given languages. It can still be turned off, or set back to the server’s languages.',
    offer_not_found: 'This model is no longer on the plan: someone deleted it meanwhile.',
    offer_exists: {
      config: 'The server’s runtime.yaml already has a model with this ID. Choose another.',
      site: 'The plan already has a model with this ID. Choose another, or edit that one.',
    },
    offer_read_only: 'The server’s operator set this model in runtime.yaml, so it cannot be changed here.',
    offer_not_priced:
      'The plan has a quota in dollars, and the runtime’s price table has no price for this model, so it cannot be offered. Choose a priced model, or ask the operator.',
    key_required: 'Another provider needs its own key: enter the school’s key for {provider}.',
    key_test_failed: 'The key did not pass its trial, so nothing was saved.',
    model_denied:
      'The server’s model lists (allowed_models and denied_models in runtime.yaml) do not allow this model on the school’s key. Choose another, or ask the operator.',
    version_mismatch:
      'This changed meanwhile, in another tab or by another administrator. Here it is as it is now: check it and try again.',
    bad_if_match: 'The runtime did not take this change as sent. Reload the page and try again.',
    missing_field: 'The runtime did not take this: “{field}” is missing. Reload the page and try again.',
    invalid_field: 'The runtime did not take this: “{field}” is not accepted. Check it and try again.',
  },

  // Reading scanned files and images (OCR).
  ocr: {
    title: 'Reading scanned documents (OCR)',
    intro:
      'When a model cannot read a file itself, the runtime recognizes the text of scanned PDFs and images for it, in the languages chosen here.',
    state: {
      on: 'On',
      off: 'Off',
      unavailable: 'Not available',
    },
    unavailable: {
      operator_off:
        'The server’s operator has turned OCR off (OCR=off), so it never runs, whatever is set here. What you set is kept for when it is turned on.',
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
      config: 'Set by the server’s operator, in runtime.yaml.',
      disabled: 'Owners do not see it. Agents on it use their owner’s own model, or wait.',
      id_taken: 'runtime.yaml has a model with the same ID, which owners get instead.',
      model_not_allowed: 'runtime.yaml’s model lists no longer allow its model, so it is not offered.',
    },
    config: 'Read-only',
    configKey: 'On the server',
    always: 'Always',
    unpriced: 'No price',
    unpricedHint: 'The runtime’s price table has no price for this model.',
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
      'It goes to the runtime, which keeps it sealed. Nobody sees it again, here or anywhere: only its end is shown. Before it is kept, the runtime tries it with one short call to {provider}.',
    keyOtherProvider: 'Another provider needs its own key.',
    skipTest: 'Keep the key without trying it',
    skipTestWarning:
      'The key is not tried with {provider}. If it does not work, agents on this model fail until it is replaced. It shows as not tested.',
    retests:
      'The key kept was tried with another model. Saved like this, it shows as not tested: replace it to try it with this one.',
    warning:
      'Owners’ questions, and the course material and work their agents read, go to {provider} under the school’s key and the school’s agreement with {provider}.',
    noProviders: 'The runtime offers no provider for a key. Its operator can offer models in runtime.yaml.',
    providersFailed: 'Could not read the providers the runtime offers.',
    add: 'Add',
    created: '{label} is on the school’s plan.',
    createdUntested: '{label} is on the school’s plan. Its key was not tried.',
    saved: '{label} is saved.',
    savedUntested: '{label} is saved. Its key shows as not tested until it is replaced.',
    changedElsewhere:
      'This model changed meanwhile, in another tab or by another administrator. What you changed is kept over it as it is now: check and save again.',
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
  },

  // The plan's quotas in answers a day.
  quotas: {
    title: 'Daily quotas',
    intro: 'Answers a day on the school’s plan. The counts start again at 00:00 UTC.',
    perOwner: 'Per owner',
    perOwnerHint: 'Across all of one owner’s agents.',
    perAsker: 'Per person asking',
    perAskerHint: 'For each person who asks one agent, in one course.',
    perDay: 'For the whole school',
    perDayHint: 'Across everyone, on the school’s keys. Empty for no ceiling.',
    noCeiling: 'No ceiling',
    default: 'Server default: {n}',
    defaultNone: 'Server default: no ceiling',
    set: 'Set here, in place of the server’s defaults.',
    defaults: 'The server’s defaults (runtime.yaml), as its operator set them.',
    dollars: 'Quotas in dollars, where there are any, stay in force beside these.',
    reset: 'Use the server’s defaults',
    resetTitle: 'Use the server’s defaults?',
    resetBody:
      'The quotas go back to runtime.yaml’s. Per owner: {owner}. Per person asking: {asker}. For the whole school: {day}.',
    saved: 'The quotas are saved. Every agent keeps them from its next answer.',
    restored: 'The quotas are the server’s defaults again.',
    invalid: 'A whole number from 1 to 1,000,000.',
  },

  // Today's use of the school's plan.
  usage: {
    title: 'Today on the school’s plan',
    since: 'Since {since} (00:00 UTC)',
    answers: 'Answers',
    modelCalls: 'Model calls',
    cost: 'Cost',
    ofDay: 'of {n} a day',
    noCeiling: 'no ceiling for the school',
    limits: 'Up to {owner} a day per owner, and {asker} per person asking.',
    owner: 'Owner',
    operator: 'The operator’s agents',
    unknownOwner: 'Someone the runtime has not seen yet',
    empty: 'Nobody has used the school’s plan today.',
    spent: 'Used up for today',
  },
}
