import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { QR_QUIET_ZONE, qrModules, qrPath, qrScale, qrSide } from './qr'

/** The modules as an RGBA image, `scale` pixels to a module, with the quiet zone: what a camera would see. */
function image(modules: boolean[][], scale = 4) {
  const side = qrSide(modules) * scale
  const data = new Uint8ClampedArray(side * side * 4).fill(255)
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((r + QR_QUIET_ZONE) * scale + y) * side + (c + QR_QUIET_ZONE) * scale + x) * 4
          data[i] = data[i + 1] = data[i + 2] = 0
        }
    }),
  )
  return { data, side }
}

function decode(modules: boolean[][]): string | null {
  const { data, side } = image(modules)
  return jsQR(data, side, side)?.data ?? null
}

describe('qrModules', () => {
  it('makes the smallest code that holds the text, square, with its finder patterns', () => {
    const small = qrModules('hi')
    expect(small).toHaveLength(21)
    small.forEach((row) => expect(row).toHaveLength(21))
    // The finder pattern's outer ring and centre, top left.
    expect(small[0]!.slice(0, 7)).toEqual([true, true, true, true, true, true, true])
    expect(small[1]!.slice(0, 7)).toEqual([true, false, false, false, false, false, true])
    expect(small[3]![3]).toBe(true)
    // A longer text needs a larger version.
    expect(qrModules('x'.repeat(200)).length).toBeGreaterThan(21)
  })

  it('reads back as the link it was made from', () => {
    const link = 'https://lms.example.edu/join/aisjoin_abcdefghijkl_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_abc'
    expect(decode(qrModules(link))).toBe(link)
    expect(decode(qrModules(link, 'H'))).toBe(link)
  })

  it('carries text outside ASCII as UTF-8', () => {
    const text = 'https://課程.example/join/試'
    expect(decode(qrModules(text))).toBe(text)
  })

  it('refuses text no code can hold', () => {
    expect(() => qrModules('x'.repeat(5000))).toThrow()
  })
})

describe('qrPath', () => {
  it('draws each run of dark modules in a row as one rectangle, inside the quiet zone', () => {
    const m = [
      [true, true, false],
      [false, true, true],
      [true, false, true],
    ]
    expect(qrPath(m)).toBe('M4 4h2v1h-2zM5 5h2v1h-2zM4 6h1v1h-1zM6 6h1v1h-1z')
    expect(qrPath(m, 0)).toBe('M0 0h2v1h-2zM1 1h2v1h-2zM0 2h1v1h-1zM2 2h1v1h-1z')
    expect(qrPath([[false, false]])).toBe('')
  })
})

describe('qrSide and qrScale', () => {
  it('measure the code with its quiet zone, and give each module whole pixels', () => {
    const m = qrModules('hi')
    expect(qrSide(m)).toBe(21 + 8)
    expect(qrSide(m, 0)).toBe(21)
    expect(qrScale(m, 1024)).toBe(Math.floor(1024 / 29))
    expect(qrScale(m, 10)).toBe(1)
  })
})
