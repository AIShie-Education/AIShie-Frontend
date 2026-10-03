// What an AppTag says (docs/CONVENTIONS.md, "Tags"): its tone, for a state,
// and its variant, for what kind of thing it is.

/** A state's colour: done green, danger red, wait amber, neutral, or indigo for what is new or the reader's to decide. */
export type TagTone = 'neutral' | 'done' | 'wait' | 'danger' | 'indigo'
/** A state (pill), an identity or an attribute (outline), a count (count), or the usual state of a row (quiet). */
export type TagVariant = 'pill' | 'outline' | 'count' | 'quiet'

/** Element Plus's names for the same colours, which older maps of states still use. */
export type ElementTagType = 'success' | 'warning' | 'danger' | 'info' | 'primary'

const TONES: Record<ElementTagType, TagTone> = {
  success: 'done',
  warning: 'wait',
  danger: 'danger',
  info: 'neutral',
  primary: 'indigo',
}

/** The tone of a state an older map gives in Element Plus's names (neutral for none). */
export function toneOf(type: ElementTagType | null | undefined): TagTone {
  return (type && TONES[type]) || 'neutral'
}
