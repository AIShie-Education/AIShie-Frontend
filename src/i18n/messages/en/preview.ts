// The file viewer (components/preview).
export default {
  open: 'Preview “{name}”',
  openTip: 'Preview',
  files: 'Files',
  previous: 'Previous file',
  next: 'Next file',
  position: '{n} of {total}',
  close: 'Close the preview',
  download: 'Download',
  downloadFile: 'Download “{name}”',
  loading: 'Loading “{name}”…',
  failed: 'The file could not be loaded',
  tooLarge: {
    title: 'Too large to preview',
    text: 'Files up to {max} are shown here. Download it to open it.',
  },
  none: {
    title: 'No preview for this kind of file',
    text: 'Download it to open it in a program that reads it.',
  },
  notText: {
    title: 'This file holds no text to show',
    text: 'Its name says text, but what it holds is not. Download it to open it.',
  },
  cannotShow: {
    title: 'This file could not be shown here',
    text: 'It may be damaged, or of a kind this browser does not show. Download it to open it.',
    media: 'This browser cannot play it. Download it to play it.',
  },
  password: {
    title: 'This PDF is protected by a password',
    text: 'Download it, and open it with its password.',
  },
  office: {
    title: 'No preview available yet',
    none: 'A preview of Word, PowerPoint and Excel files is not available yet. Download it to open it.',
    waiting:
      'Its text version (文字版) is still being made, and is shown here once it is done. Meanwhile, download it to open it.',
    noText: 'It has no text version to show. Download it to open it.',
    textVersion:
      'This is the file’s text version (文字版): its words, read from it, without its layout, pictures or formatting. Download the file to see it as it is.',
  },
  text: {
    empty: 'This file is empty.',
  },
  csv: {
    table: 'Contents of “{name}”',
    rowsCut: 'Showing the first {n} rows. Download the file to see them all.',
    columnsCut: 'Showing the first {n} columns.',
  },
  pdf: {
    toolbar: 'Pages and zoom',
    prevPage: 'Previous page',
    nextPage: 'Next page',
    pageInput: 'Page number',
    of: 'of {total}',
    pages: '{name}, page {page} of {total}',
  },
  image: {
    toolbar: 'Zoom',
    stage: 'Image “{name}”',
  },
  zoom: {
    in: 'Zoom in',
    out: 'Zoom out',
    actual: 'Zoom {n} %: show at actual size',
    actualTip: 'Actual size',
    fitWidth: 'Fit width',
    fit: 'Fit',
  },
}
