/**
 * How many waiting actions one read of a queue (action.list_proposed,
 * action.list_pending_review) counts before it says "n+": the same on the
 * course's overview (AttentionCard) and on its card on the home page, so both
 * say the same number.
 */
export const QUEUE_PAGE = 200
