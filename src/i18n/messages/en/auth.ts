export default {
  title: 'Sign in',
  email: 'Email',
  loginOrEmail: 'Student/staff number or email',
  password: 'Password',
  signIn: 'Sign in',
  sso: 'Sign in with {provider}',
  ssoDefault: 'single sign-on',
  // Where single sign-on is offered, the password form is behind a link (and back).
  usePassword: 'Use your student number and password instead',
  useEmailPassword: 'Use your email and password instead',
  useSso: 'Sign in another way',
  failed: 'Email or password is not correct.',
  failedLogin: 'The student/staff number or email, or the password, is not correct.',
  expired: 'Your session has ended. Please sign in again.',
  serverDown: 'The server cannot be reached right now.',
  invite: {
    title: 'Choose your password',
    intro:
      'Choose a password for your AIshie account. If you already have one, this replaces it. You are signed in as soon as it is set.',
    incompleteTitle: 'This link is incomplete',
    incomplete:
      'The invitation code is missing from the address. Open the whole link from the message you were sent, or ask your administrator for a new one.',
    signIn: 'Go to sign in',
    signedInAs:
      'This browser is signed in as {name}. Setting a password here signs it in as the invited person instead.',
    password: 'Password',
    repeat: 'Repeat the password',
    rule: 'At least 10 characters. Longer is stronger: a short sentence works well.',
    tooShort: 'At least 10 characters (letters outside English count as two or three each)',
    tooLong: 'At most 1024 characters',
    mismatch: 'The two passwords are not the same',
    submit: 'Set password and sign in',
    invalidTitle: 'This invitation is no longer valid',
    invalid:
      'It may have expired, been used already, been replaced by a newer one, or been withdrawn (for example because your email address was changed). Ask your administrator for a new link.',
    wait: 'Too many attempts from this network. Wait {n} second and try again. | Too many attempts from this network. Wait {n} seconds and try again.',
    doneTitle: 'Your password is set',
    done: 'You are signed in. From now on, sign in with {email} and the password you just chose.',
    doneLoginId:
      'You are signed in. From now on, sign in with your student or staff number, {loginId}, and the password you just chose.',
    doneEither:
      'You are signed in. From now on, sign in with your student or staff number, {loginId}, or with {email}, and the password you just chose.',
    continue: 'Continue',
  },
  // The page someone whose password someone else set comes to first.
  change: {
    title: 'Choose your own password',
    lead: 'The password you signed in with was set for you by your instructor. Choose one of your own before anything else: until you do, nothing else can be opened.',
    password: 'New password',
    rule: 'At least 10 characters, and not the one you were given. Longer is stronger: a short sentence works well.',
    submit: 'Set my password and continue',
    notNow: 'Not you, or not now?',
    unchanged: 'That is the temporary password you were given. Choose one of your own.',
    weak: 'A password must be 10 to 1024 characters.',
  },
}
