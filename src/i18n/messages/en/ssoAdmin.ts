// Sign-in: single sign-on's identity providers, for root and the platform's administrators.
export default {
  title: 'Sign-in',
  subtitle: 'Single sign-on: the identity providers people may sign in through, besides their password',
  add: 'Add provider',
  noSecretsKey:
    'The server’s operator sets SECRETS_KEY in its environment (base64 of 32 random bytes) and restarts it; its client secrets are sealed with it. The provider the operator set in the environment works without it.',

  redirect: {
    label: 'Redirect URI',
    hint: 'Register this at the identity provider as the redirect (reply, callback) URI. It is the same for every provider here.',
    copy: 'Copy the redirect URI',
    copied: 'The redirect URI is copied.',
    copyFailed: 'It could not be copied: select it and copy it yourself.',
  },

  help: {
    intro: 'Where it goes, and which issuer URL to give, at the providers schools use most:',
    issuer: 'Issuer:',
    adfs: {
      where:
        'In AD FS Management, Application Groups → Add Application Group → Server application. Paste the redirect URI as its Redirect URI; its Client Identifier is the client ID here. Generate a shared secret for it: that is the client secret.',
      note: 'Your AD FS server’s address, then /adfs. Set the subject claim to upn, under Advanced. AD FS sends no email_verified, so link accounts by hand, not by email.',
    },
    entra: {
      where:
        'In the Microsoft Entra admin center, App registrations → New registration; under Redirect URI choose Web and paste it. The Application (client) ID is the client ID; under Certificates & secrets, add a new client secret and copy its Value (not its Secret ID).',
      note: 'With the Directory (tenant) ID, not a domain name. Entra ID sends no email_verified, so link accounts by hand, not by email.',
    },
    google: {
      where:
        'In the Google Cloud console, APIs & Services → Credentials → Create credentials → OAuth client ID, application type Web application. Paste it under Authorized redirect URIs; the client ID and secret are shown once it is created.',
      note: 'Make the OAuth consent screen’s user type Internal to keep it to your organization’s accounts. Google says whether an email is verified, so link by email can work, kept to your domains.',
    },
    keycloak: {
      where:
        'In the admin console, choose the realm, then Clients → Create client, type OpenID Connect, with Client authentication on. Paste it under Valid redirect URIs. The client ID is the one you give it; the secret is on its Credentials tab.',
      note: 'Before Keycloak 17 the path began with /auth: …/auth/realms/<realm>.',
    },
  },

  list: {
    title: 'Single sign-on providers',
    intro:
      'Each provider offered here is a button on the sign-in page, in this order. Someone signs in through one once their account is linked at it (People & agents → a person → Single sign-on), or by the email it vouches for where it links by email. Nobody is created by signing in.',
    empty: 'No single sign-on provider yet. People sign in with their password.',
    provider: 'Provider',
    status: 'Status',
    linked: 'Linked',
    enabled: 'On',
    actions: 'Actions',
    test: 'Test',
    operator: 'Set by the server’s operator',
    operatorWhy: 'Set in the server’s environment (OIDC_*): read-only here.',
    linksByEmail: 'Links by email',
    olderKey: 'Older key',
    olderKeyWhy:
      'Its secret was sealed under an earlier SECRETS_KEY, which the server still holds. The operator runs aishie-core secrets rewrap to seal it again under the new one.',
    unnamed: 'No name: the button says “single sign-on”',
    always: 'Always on',
    enabledLabel: 'Offer {name} on the sign-in page',
    linkedCount: 'No account linked | One account linked | {n} accounts linked',
    changedMeanwhile: 'Someone changed it meanwhile: the list now shows it as it is. Try again if it is still needed.',
    turnOffTitle: 'Switch off {name}?',
    turnOff:
      'Nobody is linked at it. | One account signs in through it: switched off, it cannot until it is on again. Nobody is unlinked. | {n} accounts sign in through it: switched off, they cannot until it is on again. Nobody is unlinked.',
    turnOffConfirm: 'Switch off',
    turnedOn: '{name} is on: its button is on the sign-in page within a minute.',
    turnedOnNobody:
      '{name} is on: its button is on the sign-in page within a minute. No account is linked at it yet, so nobody can sign in through it until one is.',
    turnedOff: '{name} is off: its button leaves the sign-in page within a minute. Nobody is unlinked.',
    deleteTitle: 'Delete {name}?',
    deleteNone:
      'It is removed, and its button leaves the sign-in page. No account is linked at it. Creating one with the same ID later links nobody back.',
    deleteLinked:
      'No account will lose single sign-on. | 1 account is linked at it and will no longer be able to sign in through it: it is unlinked, and signs in with a password or not at all. Switch it off instead to keep it linked. | {n} accounts are linked at it and will no longer be able to sign in through it: they are unlinked, and sign in with a password or not at all. Switch it off instead to keep them linked.',
    deleteForce: 'Delete | Delete and unlink 1 account | Delete and unlink {n} accounts',
    deleted: '{name} is deleted. | {name} is deleted; 1 account was unlinked. | {name} is deleted; {n} accounts were unlinked.',
  },

  status: {
    offered: 'Offered',
    disabled: 'Off',
    id_taken: 'ID taken',
    secret_unavailable: 'Secret can’t be opened',
  },
  statusWhy: {
    disabled: 'Switched off: not on the sign-in page. Nobody linked at it is unlinked.',
    id_taken:
      'The server’s operator has set a provider with the same ID, which is offered in its place. This one is not offered, and cannot be changed or deleted here while the operator’s has its ID.',
    secret_unavailable:
      'Its client secret does not open with the server’s keys (SECRETS_KEY was removed, or replaced without keeping the old one): it is not offered. Edit it and give the secret again.',
  },

  test: {
    title: 'Test {name}',
    testing: 'Testing…',
    again: 'Test again',
    ok: 'Ready: a sign-in can go through this issuer.',
    notOk: 'Not ready: a sign-in would not go through, as it stands.',
    // How much of the issuer was read (reportRead).
    read: {
      all: 'Its discovery document and keys were read at {issuer}. Nobody was signed in and no secret was sent.',
      issuer: 'Nothing was read from {issuer}: the issuer itself is refused. Nobody was signed in and no secret was sent.',
      document:
        'Nothing could be read from {issuer}: its discovery document was not read. Nobody was signed in and no secret was sent.',
      keys: 'Its discovery document was read at {issuer}, but not its keys. Nobody was signed in and no secret was sent.',
    },
    problems: 'Problem | Problem | Problems ({n})',
    warnings: 'Warning | Warning | Warnings ({n})',
    endpoints: 'Endpoints',
    endpoint: {
      discovery: 'Discovery document',
      authorization: 'Authorization',
      token: 'Token',
      userinfo: 'User info',
      endSession: 'End session',
      jwks: 'Key set',
    },
    none: 'None',
    keys: 'No signing key | Signing key | Signing keys ({n})',
    kid: 'key ID {kid}',
    use: 'use {use}',
    supported: 'What it says it supports',
    support: {
      signingAlgorithms: 'Signing algorithms',
      scopes: 'Scopes',
      claims: 'Claims',
      responseTypes: 'Response types',
      grantTypes: 'Grant types',
      tokenAuth: 'Client authentication',
      subjectTypes: 'Subject types',
      pkce: 'PKCE methods',
    },
    notSaid: 'Not said',
    // Problems whose reason Core names: said in these words, with Core's, which name the URL, after them.
    reason: {
      issuer_address_not_allowed:
        'An address here is on this machine, or private, link-local or reserved: this server reaches no provider of the site’s there unless its operator sets SSO_ALLOW_PRIVATE_ISSUERS.',
    },
  },

  form: {
    createTitle: 'Add a single sign-on provider',
    editTitle: 'Edit {name}',
    id: 'ID',
    idPlaceholder: 'e.g. school-adfs',
    idHint:
      'Lower-case letters, digits and hyphens. Accounts are linked at it by this ID, and it never changes once the provider is added.',
    idFixed: 'It never changes: accounts are linked at it by this ID.',
    displayName: 'Display name',
    displayNamePlaceholder: 'e.g. School NetID',
    displayNameHint: 'The name on its button on the sign-in page.',
    preview: 'On the sign-in page:',
    previewEmpty: 'The button shows the display name.',
    issuer: 'Issuer URL',
    issuerPlaceholder: 'https://login.example.edu/…',
    issuerHint:
      'Exactly as the provider’s discovery document (…/.well-known/openid-configuration) writes it: a trailing / counts. Test reads it; it signs nobody in and sends no secret. The server may refuse an issuer on this machine or a private network unless its operator allows them.',
    test: 'Test',
    issuerLinked:
      'No account is linked at it. | One account is linked at it and stays linked: whoever the new issuer vouches for under the same subject signs in as them. | {n} accounts are linked at it and stay linked: whoever the new issuer vouches for under the same subject signs in as them.',
    clientId: 'Client ID',
    clientSecret: 'Client secret',
    secretKeep: 'Keep the current secret ({hint})',
    secretNew: 'Replace it with a new one',
    secretPlaceholder: 'The client secret the provider gave',
    secretHint: 'Sealed on the server before it is kept, and never shown again: only its last four characters.',
    advanced: 'Advanced',
    scopes: 'Scopes',
    scopesHint: 'What a sign-in asks for. openid is always among them.',
    subjectClaim: 'Subject claim',
    subjectClaimHint: 'The claim an account is known by, as linked at it: sub unless the provider says otherwise (AD FS: upn).',
    emailClaim: 'Email claim',
    emailClaimNone: 'None',
    emailClaimHint: 'The claim holding the person’s email, read only to link by email.',
    position: 'Place on the sign-in page',
    positionLast: 'After the others',
    positionHint: 'Lowest first, 0 to 10000. The operator’s provider is always first.',
    linkByEmail: 'Link existing accounts by verified email',
    byEmail: {
      intro:
        'Off, only accounts already linked at it sign in. On, someone signing in through it for the first time, whose identity is linked to nobody, is linked to an existing account when all of these hold:',
      verified: 'the provider vouches for the email: its ID token carries it in the email claim, with email_verified true;',
      domain: 'the email is in one of the allowed domains, exactly (a subdomain is another domain);',
      account:
        'the account with that email is an active person’s, whose email is verified here (given by an administrator, not typed in through a join link);',
      noRole: 'the account holds no platform role (root and administrators are linked by hand);',
      notLinked: 'the account is not linked at this provider already.',
      otherwise:
        'Anyone else is refused as not registered, and nobody is created. An identity once unlinked is never linked by email again.',
      noVerified: 'AD FS and Entra ID send no email_verified: with them it links nobody, so link accounts by hand.',
    },
    domains: 'Allowed email domains',
    domainsPlaceholder: 'e.g. example.edu',
    domainsHint: 'Type a domain and press Enter. An email matches only its own domain exactly.',
    add: 'Add provider',
    created:
      '{name} is added, switched off: test it, link accounts at it or turn on linking by email, then switch it on in the list.',
    saved: '{name} is saved. It takes effect at the next sign-in.',
    changedMeanwhile:
      'Someone changed this provider meanwhile. The form now shows their change, with yours kept over it: check it and save again.',
    refusedField: 'Refused: {message}',
    invalid: {
      required: 'Required',
      id: 'Lower-case letters, digits and hyphens, beginning and ending with a letter or a digit, at most 64',
      idTaken: 'A provider has this ID already',
      displayNameLong: 'At most 64 characters',
      printable: 'Printable characters only',
      issuer_url: 'A URL, with no user, query or fragment',
      issuer_https: 'An https URL (http only for this machine, where the server allows it)',
      issuer_long: 'At most 500 bytes',
      ascii: 'Printable ASCII characters only',
      long: 'At most 500 bytes',
      openid: 'openid must be among the scopes',
      scopesMany: 'At most 20 scopes',
      scope: 'A scope has no spaces, quotes or backslashes',
      claim: 'A claim’s name, with no spaces',
      domainsRequired: 'Linking by email needs the domains an email may be linked from',
      domainsMany: 'At most 50 domains',
      domain: 'A domain such as example.edu',
      position: 'A whole number from 0 to 10000',
    },
  },

  refusal: {
    secrets_key_missing:
      'SECRETS_KEY is not set on the server: no provider can be added, and no client secret given, until its operator sets it.',
    set_by_operator: 'This provider is set by the server’s operator (OIDC_*): it cannot be changed here.',
    id_taken: 'That ID is taken: the operator’s provider or another provider has it. Choose another.',
    version_mismatch: 'Someone changed this provider meanwhile.',
    provider_in_use: '{linked_accounts} accounts are linked at it.',
    secret_unavailable:
      'Its client secret does not open with the server’s keys, so it cannot be switched on: edit it and give the secret again.',
    sso_provider_not_found: 'That provider no longer exists: someone deleted it meanwhile.',
    sso_provider_unavailable: 'That provider cannot be used now: its secret does not open, or its discovery document cannot be read.',
    platform_role_required: 'Only root and the platform’s administrators set up single sign-on.',
    issuer_address_not_allowed:
      'The issuer is on this machine, or at a private, link-local or reserved address: this server reaches no provider of the site’s there unless its operator sets SSO_ALLOW_PRIVATE_ISSUERS.',
  },
}
