// QR codes, made here in the browser (qrcode-generator, which has no
// dependencies of its own): a link given to a class is drawn on the page as
// an SVG, which stays sharp at any size and when printed, and saved as a PNG
// drawn from the same modules. Nothing about the link leaves the page to be
// drawn.
import qrcode from 'qrcode-generator'

/** How much of the code may be lost and still read: L 7 %, M 15 %, Q 25 %, H 30 %. */
export type QrLevel = 'L' | 'M' | 'Q' | 'H'

/** The blank border around a code, in modules: the standard asks for four. */
export const QR_QUIET_ZONE = 4

/**
 * The text as the bytes a QR code carries, one character per byte: UTF-8,
 * which is what readers take a byte-mode code to be. qrcode-generator keeps
 * only the low byte of each character it is given.
 */
function utf8Binary(text: string): string {
  let out = ''
  for (const b of new TextEncoder().encode(text)) out += String.fromCharCode(b)
  return out
}

/**
 * The modules of the smallest QR code that holds the text at the level
 * given, row by row: true is dark. Throws for text too long for any code.
 */
export function qrModules(text: string, level: QrLevel = 'M'): boolean[][] {
  const qr = qrcode(0, level)
  qr.addData(utf8Binary(text), 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  const rows: boolean[][] = []
  for (let r = 0; r < n; r++) {
    const row: boolean[] = []
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c))
    rows.push(row)
  }
  return rows
}

/**
 * An SVG path that fills the dark modules, one unit to a module, moved in
 * by margin units on each side: each run of dark modules in a row is one
 * rectangle, so that no hairline shows between neighbours.
 */
export function qrPath(modules: boolean[][], margin = QR_QUIET_ZONE): string {
  const parts: string[] = []
  modules.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (!row[c]) continue
      let end = c
      while (end + 1 < row.length && row[end + 1]) end++
      const w = end - c + 1
      parts.push(`M${c + margin} ${r + margin}h${w}v1h-${w}z`)
      c = end
    }
  })
  return parts.join('')
}

/** The side of a code with its quiet zone, in modules. */
export function qrSide(modules: boolean[][], margin = QR_QUIET_ZONE): number {
  return modules.length + 2 * margin
}

/**
 * How many pixels each module gets in an image about `size` pixels wide: a
 * whole number, so that every module is drawn sharp, and never less than one.
 */
export function qrScale(modules: boolean[][], size: number, margin = QR_QUIET_ZONE): number {
  return Math.max(1, Math.floor(size / qrSide(modules, margin)))
}

/**
 * The code as a PNG, black on white (as readers expect, whatever the page's
 * theme), about `size` pixels wide.
 */
export function qrPng(text: string, opts: { size?: number; level?: QrLevel } = {}): Promise<Blob> {
  const modules = qrModules(text, opts.level)
  const scale = qrScale(modules, opts.size ?? 1024)
  const side = qrSide(modules) * scale
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('this browser cannot draw images'))
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, side, side)
  ctx.fillStyle = '#000000'
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect((c + QR_QUIET_ZONE) * scale, (r + QR_QUIET_ZONE) * scale, scale, scale)
    }),
  )
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the image could not be made'))), 'image/png'),
  )
}

/** Saves the code for text as a PNG file named fileName, through the browser's download. */
export async function downloadQrPng(text: string, fileName: string, opts: { size?: number; level?: QrLevel } = {}) {
  const blob = await qrPng(text, opts)
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // The click has handed the file to the browser; the URL can go once it has.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
