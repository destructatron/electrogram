import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Set up DOM and mocks BEFORE importing app.js (which runs init() at top level)
const container = document.createElement('div')
container.id = 'screen-container'
const liveRegion = document.createElement('div')
liveRegion.id = 'live-region'
liveRegion.setAttribute('aria-live', 'polite')
document.body.appendChild(container)
document.body.appendChild(liveRegion)

const mockTg = {
  getSavedCredentials: vi.fn().mockResolvedValue({ apiId: '', apiHash: '' }),
  connect: vi.fn().mockRejectedValue(new Error('No client')),
}

global.window = {
  electronAPI: {
    tg: mockTg,
  },
}

const { announce, setScreen, enableShortcuts } = await import('../src/renderer/app.js')

describe('announce', () => {
  beforeEach(() => {
    liveRegion.textContent = ''
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears live region then sets message after delay', () => {
    announce('Test message')
    expect(liveRegion.textContent).toBe('')
    vi.advanceTimersByTime(60)
    expect(liveRegion.textContent).toBe('Test message')
  })

  it('handles multiple announces sequentially', () => {
    announce('First')
    vi.advanceTimersByTime(60)
    expect(liveRegion.textContent).toBe('First')
    announce('Second')
    vi.advanceTimersByTime(60)
    expect(liveRegion.textContent).toBe('Second')
  })
})

describe('setScreen', () => {
  beforeEach(() => {
    container.innerHTML = ''
  })

  it('replaces screen container content with element', () => {
    const el = document.createElement('div')
    el.id = 'test-screen'
    setScreen(el)
    expect(container.children[0]).toBe(el)
  })

  it('calls previous cleanup function when switching screens', () => {
    const cleanup1 = vi.fn()
    const el1 = document.createElement('div')
    el1.id = 'screen1'
    setScreen(el1, cleanup1)

    const cleanup2 = vi.fn()
    const el2 = document.createElement('div')
    el2.id = 'screen2'
    setScreen(el2, cleanup2)

    expect(cleanup1).toHaveBeenCalled()
    expect(cleanup2).not.toHaveBeenCalled()
  })

  it('focuses first focusable element after screen switch', () => {
    const el = document.createElement('div')
    const input = document.createElement('input')
    el.appendChild(input)
    setScreen(el)
    expect(document.activeElement).toBe(input)
  })

  it('focuses element itself if no focusable children found', () => {
    const el = document.createElement('div')
    el.tabIndex = 0
    setScreen(el)
    expect(document.activeElement).toBe(el)
  })
})

describe('enableShortcuts', () => {
  it('exists and is callable', () => {
    expect(typeof enableShortcuts).toBe('function')
    enableShortcuts(false)
    enableShortcuts(true)
  })
})