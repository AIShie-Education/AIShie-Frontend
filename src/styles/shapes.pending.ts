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
  components: ['/src/components/AgentAvatar.vue', '/src/components/VersionFileList.vue'] as string[],

  /** The screens (cards to rules, no card in a card). */
  screens: [
    '/src/views/course/activity/ActivityView.vue',
    '/src/views/course/activity/components/EventItem.vue',
    '/src/views/course/groups/components/SplitDialog.vue',
    '/src/views/course/groups/components/StudentItem.vue',
    '/src/views/course/materials/components/TextFilePicker.vue',
    '/src/views/course/members/components/JoinLinkForm.vue',
    '/src/views/course/members/components/JoinLinkFullscreen.vue',
    '/src/views/course/members/components/JoinLinkReveal.vue',
    '/src/views/course/overview/components/AboutCard.vue',
    '/src/views/course/overview/components/AttentionCard.vue',
    '/src/views/course/peer/PeerTaskPanel.vue',
    '/src/views/course/scheme/SchemeView.vue',
    '/src/views/home/HomeView.vue',
  ] as string[],

  /** The chrome (sign-in, the header, the side bar, the phone's menu, dialogs and drawers, the chat, the file viewer). */
  chrome: [
    '/src/components/NewVersionNotice.vue',
    '/src/components/chat/ChatAttachmentChips.vue',
    '/src/components/chat/ChatComposer.vue',
    '/src/components/chat/ChatDraftSteps.vue',
    '/src/components/chat/ChatMessage.vue',
    '/src/components/chat/ChatMessageFiles.vue',
    '/src/components/chat/ChatMessageSources.vue',
    '/src/components/chat/ChatPane.vue',
    '/src/components/chat/ChatPanel.vue',
    '/src/components/chat/ChatStatusLine.vue',
    '/src/components/preview/FileViewer.vue',
    '/src/components/preview/ImageView.vue',
    '/src/components/preview/PdfView.vue',
    '/src/components/sidebar/AccountMenu.vue',
    '/src/layouts/AppLayout.vue',
    '/src/styles/chat-prose.css',
    '/src/styles/main.css: .app-auth-page__card',
    '/src/views/join/JoinView.vue',
  ] as string[],
}
