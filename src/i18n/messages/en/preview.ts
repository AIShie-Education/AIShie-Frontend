// The file viewer (components/preview) and "Download as PDF" (PrintButton).
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
  // An Office or OpenDocument file, shown as the PDF the server converts it into (its rendition).
  rendition: {
    pages: 'PDF of one page | PDF of {n} pages',
    downloadPdf: 'Download PDF',
    downloadPdfOf: 'Download PDF “{name}”',
    downloadPdfTip: 'The PDF the server made of this file, as shown here',
    listedTip: 'Previewed as the PDF the server made of it',
    converting: 'Converting to PDF…',
    convertingText:
      'The server is making a PDF of this file to show here. It appears by itself once it is ready; meanwhile, download the file to open it.',
    none: 'It could not be converted to PDF',
    reason: {
      password_protected: 'The file is protected by a password.',
      unsupported: 'The file could not be read as an Office document.',
      too_large: 'Its PDF would be too large to keep.',
      conversion_failed: 'The conversion failed.',
      timeout: 'The conversion took too long, and was stopped.',
      attempts_exhausted: 'It was tried several times, and never finished.',
      other: 'There is no PDF of it.',
    },
    downloadOriginal: 'Download the file to open it.',
    retry: 'Try again',
    queuedAgain: 'It will be converted to PDF again.',
    retryFailed: 'It could not be sent to be converted again',
    refusal: {
      rendition_done: 'It has been converted already.',
      no_rendition: 'This file is not one that is converted to PDF.',
      permission_denied: 'Only those who may change this document may have it converted again.',
      not_your_message:
        'Only whoever sent the file, and staff who decide for the one who asked, may have it converted again.',
      retracted: 'The message was withdrawn, and its files with it.',
    },
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
    actual: 'Zoom {n}: show at actual size',
    actualTip: 'Actual size',
    fitWidth: 'Fit width',
    fit: 'Fit',
  },
  print: {
    button: 'Download as PDF',
    hint: 'In the print window, choose “Save as PDF”',
    opening: 'Opening the print window: choose “Save as PDF” there to save the file.',
    failed: 'The print layout could not be opened',
    textVersionOf: '{name} — text version',
    textVersionNote:
      'A text version (文字版) is the file’s words, read from it: its layout, pictures and formatting are not part of it.',
    conversationWith: 'Conversation with {name}',
    messages: 'One message | {n} messages',
    withdrawn: 'Withdrawn',
    files: 'Files: {names}',
    partial: 'The earliest messages could not be read, and are not included.',
  },
}
