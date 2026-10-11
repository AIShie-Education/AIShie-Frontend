// What styles/shapes.spec.ts still finds a shape in that the app no longer
// draws (a corner over 4 px, a pill, a shadow, a gradient that fills), while
// design wave 3 is under way: its tokens and Element Plus's are in, and each
// of its other three parts takes these files' own rules apart and empties its
// own list, and only its own. An entry is a file, or a file and a rule's
// selector where the rest of the file is held to the guard already. The
// guard fails on an entry that no longer offends, so that the lists only
// shrink; once all three are empty, this file and its import go
// (docs/CONVENTIONS.md, "Shapes"). Written from the guard's own report,
// sorted.

export const PENDING = {
  /** The shared components (tags and badges, the agent's avatar, notes, empty places, chips). */
  components: [] as string[],

  /** The screens (cards to rules, no card in a card). */
  screens: [] as string[],

  /** The chrome (sign-in, the header, the side bar, the phone's menu, dialogs and drawers, the chat, the file viewer). */
  chrome: [] as string[],
}
