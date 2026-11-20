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

const {
  announce,
  setScreen,
  enableShortcuts,
  showMessageDetailsDialog,
  closeMessageDetailsDialog,
} = await import('../src/renderer/app.js')

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

describe('showMessageDetailsDialog', () => {
  afterEach(() => {
    closeMessageDetailsDialog()
  })

  it.each([
    1779322658,
    new Date(1779322658 * 1000),
    new Date(1779322658 * 1000).toISOString(),
    null,
  ])('formats date %s with the same visible time logic as the message list', (date) => {
    showMessageDetailsDialog({
      date,
      isOutgoing: true,
      text: 'Hello',
    })

    const timestampInput = document.getElementById('msg-timestamp')
    const normalizedDate = !date
      ? 0
      : typeof date === 'number'
        ? date
        : date instanceof Date
          ? Math.floor(date.getTime() / 1000)
          : Math.floor(new Date(date).getTime() / 1000)

    expect(timestampInput.value).toBe(new Date(normalizedDate * 1000).toLocaleTimeString())
  })

  it('renders malicious sender names and message text as plain values, not HTML', () => {
    const payload = '</textarea><img id="xss-probe" src=x onerror="window.__xss=1">'
    showMessageDetailsDialog({
      date: 1779322658,
      isOutgoing: false,
      senderName: '"><script>window.__xss2=1</script>',
      text: payload,
    })

    expect(document.getElementById('xss-probe')).toBeNull()
    expect(document.getElementById('xss-probe2')).toBeNull()
    expect(window.__xss).toBeUndefined()
    expect(window.__xss2).toBeUndefined()
    expect(document.getElementById('msg-text').value).toBe(payload)
    expect(document.getElementById('msg-sender').value).toBe('"><script>window.__xss2=1</script>')
  })
})