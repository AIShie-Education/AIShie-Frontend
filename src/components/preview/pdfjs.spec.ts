import { afterEach, describe, expect, it, vi } from 'vitest'

const { AssetData, assetNames } = await import('./pdfjs')

afterEach(() => vi.unstubAllGlobals())

describe('what pdf.js is given from the build', () => {
  it('carries every character map, the decoders of scanned and JPEG 2000 images, and Symbol and Dingbats', () => {
    const names = assetNames()
    // Chinese whose font is not embedded: Traditional (CNS, Big5) and Simplified (GB).
    for (const cmap of [
      'UniCNS-UCS2-H.bcmap',
      'B5pc-H.bcmap',
      'UniGB-UCS2-H.bcmap',
      'GBK-EUC-H.bcmap',
      'Adobe-CNS1-UCS2.bcmap',
    ])
      expect(names.cMapUrl).toContain(cmap)
    expect(names.cMapUrl!.length).toBeGreaterThan(150)
    expect(names.wasmUrl).toEqual(['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm'])
    expect(names.standardFontDataUrl).toEqual(['FoxitDingbats.pfb', 'FoxitSymbol.pfb'])
  })

  it('hands the worker the bytes of a file it asks for, from this origin, and refuses one the build does not carry', async () => {
    const asked: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url)
        return new Response(new Uint8Array([1, 2, 3]))
      }),
    )
    const data = new AssetData()
    const bytes = await data.fetch({ kind: 'cMapUrl', filename: 'UniGB-UCS2-H.bcmap' })
    expect([...bytes]).toEqual([1, 2, 3])
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatch(/UniGB-UCS2-H.*\.bcmap/)
    expect(asked[0]).not.toMatch(/^(https?:)?\/\/(?!localhost)/)
    await expect(data.fetch({ kind: 'cMapUrl', filename: '../../etc/passwd' })).rejects.toThrow('does not carry')
    await expect(data.fetch({ kind: 'wasmUrl', filename: 'quickjs-eval.wasm' })).rejects.toThrow('does not carry')
    expect(asked).toHaveLength(1)
  })
})
