import { LoginApiScreen } from './screens/login-api.js'
import { LoginPhoneScreen } from './screens/login-phone.js'
import { LoginCodeScreen } from './screens/login-code.js'
import { MainAppScreen } from './screens/main-app.js'

const container = document.getElementById('screen-container')
const liveRegion = document.getElementById('live-region')
let currentCleanup = null

export function announce(message) {
  liveRegion.textContent = ''
  // Small delay to ensure screen readers detect the change
  setTimeout(() => {
    liveRegion.textContent = message
  }, 50)
}

export function setScreen(element, cleanupFn) {
  if (currentCleanup) {
    currentCleanup()
    currentCleanup = null
  }
  container.innerHTML = ''
  container.appendChild(element)
  if (cleanupFn) {
    currentCleanup = cleanupFn
  }
  // Move focus to the new screen for accessibility
  const focusable = element.querySelector('[autofocus], button, input, textarea, [tabindex="0"]')
  if (focusable) {
    focusable.focus()
  } else {
    element.focus()
  }
}

async function init() {
  if (typeof window.electronAPI === 'undefined') {
    console.error('[Renderer] window.electronAPI is undefined – preload did not expose the API')
    const errorDiv = document.createElement('div')
    errorDiv.className = 'login-screen'
    errorDiv.style.margin = '2rem auto'
    errorDiv.innerHTML = `
      <h1>Startup Error</h1>
      <p class="error-text">The secure bridge between the UI and the main process failed to load.</p>
      <p class="hint-text">Please try running with <code>npm run dev:safe</code> or check the terminal for preload errors.</p>
    `
    document.getElementById('screen-container').appendChild(errorDiv)
    return
  }
  setScreen(LoginApiScreen())
}

init()

// Global keyboard shortcuts
let shortcutsEnabled = true

// Message details dialog state
let messageDetailsDialog = null
let lastFocusedBeforeDialog = null

function normalizeDate(date) {
  if (!date) return 0
  if (typeof date === 'number') return date
  if (date instanceof Date) return Math.floor(date.getTime() / 1000)
  return Math.floor(new Date(date).getTime() / 1000)
}

export function showMessageDetailsDialog(messageData) {
  // Ensure only one dialog instance exists at a time
  if (messageDetailsDialog) {
    closeMessageDetailsDialog()
  }

  // Remember the element that triggered the dialog so we can restore focus on close
  lastFocusedBeforeDialog = document.activeElement

  const dialog = document.createElement('div')
  dialog.id = 'message-details-dialog'
  dialog.className = 'message-details-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Message details')

  const timestamp = new Date(normalizeDate(messageData.date) * 1000).toLocaleTimeString()
  const senderDisplay = messageData.isOutgoing ? 'You' : (messageData.senderName || 'Unknown')

  // Built with DOM APIs so untrusted sender names / message text can never be parsed as HTML
  const content = document.createElement('div')
  content.className = 'message-details-content'

  const title = document.createElement('h2')
  title.className = 'message-details-title'
  title.textContent = 'Message Details'
  content.appendChild(title)

  const addField = (id, labelText, value, multiline) => {
    const field = document.createElement('div')
    field.className = 'message-details-field'
    const label = document.createElement('label')
    label.setAttribute('for', id)
    label.textContent = labelText
    const input = document.createElement(multiline ? 'textarea' : 'input')
    input.id = id
    if (!multiline) input.type = 'text'
    input.readOnly = true
    input.tabIndex = 0
    if (multiline) input.rows = 6
    input.value = value
    field.appendChild(label)
    field.appendChild(input)
    content.appendChild(field)
  }

  addField('msg-sender', 'Sender', senderDisplay, false)
  addField('msg-timestamp', 'Timestamp', timestamp, false)
  addField('msg-text', 'Text', messageData.text || '', true)

  const closeBtn = document.createElement('button')
  closeBtn.id = 'msg-details-close'
  closeBtn.type = 'button'
  closeBtn.textContent = 'Close'
  content.appendChild(closeBtn)

  dialog.appendChild(content)

  document.body.appendChild(dialog)
  messageDetailsDialog = dialog

  closeBtn.addEventListener('click', closeMessageDetailsDialog)

  // Close on backdrop click (click outside the content area)
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeMessageDetailsDialog()
    }
  })

  // Keyboard trap: keep Tab cycling inside the dialog
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const focusable = dialog.querySelectorAll(
        'button, input, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  })

  // Focus the close button for accessibility
  closeBtn.focus()

  return dialog
}

export function closeMessageDetailsDialog() {
  if (messageDetailsDialog) {
    messageDetailsDialog.remove()
    messageDetailsDialog = null
  }
  // Restore focus to the element that triggered the dialog
  if (lastFocusedBeforeDialog && lastFocusedBeforeDialog.focus) {
    lastFocusedBeforeDialog.focus()
  }
  lastFocusedBeforeDialog = null
}

export function isMessageDetailsDialogOpen() {
  return messageDetailsDialog !== null
}

document.addEventListener('keydown', (e) => {
  if (!shortcutsEnabled) return

  // Escape closes the message details dialog first
  if (e.key === 'Escape') {
    if (isMessageDetailsDialogOpen()) {
      e.preventDefault()
      closeMessageDetailsDialog()
      return
    }
  }

  // 'v' key — open message details when focused on a message
  if (e.key === 'v' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const focused = document.activeElement
    if (focused && focused.closest && focused.closest('.message-item')) {
      // Find the message data from the focused element
      const messageItem = focused.closest('.message-item')
      const messageId = messageItem.dataset.messageId
      // Look up the message in the messages array (passed via data attributes or closure)
      // We store message data on the element itself for easy access
      const msgData = messageItem._messageData
      if (msgData) {
        e.preventDefault()
        showMessageDetailsDialog(msgData)
        return
      }
    }
  }

  if (e.ctrlKey && e.key === '1') {
    e.preventDefault()
    const active = document.querySelector('#conversation-list [tabindex="0"]')
    if (active) active.focus()
    else document.getElementById('conversation-list')?.focus()
  }
  if (e.ctrlKey && e.key === '2') {
    e.preventDefault()
    const active = document.querySelector('#message-list [tabindex="0"]')
    if (active) active.focus()
    else document.getElementById('message-list')?.focus()
  }
  if (e.ctrlKey && e.key === '3') {
    e.preventDefault()
    const composer = document.getElementById('message-input')
    if (composer) composer.focus()
  }
})

export function enableShortcuts(enabled) {
  shortcutsEnabled = enabled
}
