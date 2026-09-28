import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import QrCode from './QrCode.vue'
import { qrModules, qrPath, qrSide } from '@/utils/qr'

describe('QrCode', () => {
  it('draws the code for its value as an SVG image, black on white, named for a screen reader', () => {
    const value = 'https://lms.example.edu/join/aisjoin_x'
    const w = mount(QrCode, { props: { value, label: 'QR code for the invite link', size: 320 } })
    const svg = w.get('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('QR code for the invite link')
    expect(svg.attributes('width')).toBe('320')
    const modules = qrModules(value)
    expect(svg.attributes('viewBox')).toBe(`0 0 ${qrSide(modules)} ${qrSide(modules)}`)
    expect(w.get('rect').attributes('fill')).toBe('#ffffff')
    const path = w.get('path')
    expect(path.attributes('fill')).toBe('#000000')
    expect(path.attributes('d')).toBe(qrPath(modules))
  })

  it('draws again when its value changes', async () => {
    const w = mount(QrCode, { props: { value: 'a', label: 'code' } })
    const before = w.get('path').attributes('d')
    await w.setProps({ value: 'https://lms.example.edu/join/another' })
    expect(w.get('path').attributes('d')).not.toBe(before)
  })

  it('draws nothing for text no code can hold', () => {
    const w = mount(QrCode, { props: { value: 'x'.repeat(5000), label: 'code' } })
    expect(w.find('svg').exists()).toBe(false)
  })
})
