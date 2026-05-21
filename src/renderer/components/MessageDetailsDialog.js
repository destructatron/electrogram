/**
 * MessageDetailsDialog — a reusable read-only dialog component.
 * Displays message text (multi-line), timestamp, and sender.
 * Uses the same visual styling as the existing search-modal pattern.
 *
 * @param {Object} messageData
 * @param {string} messageData.text         - The message body text
 * @param {number} messageData.timestamp     - Unix timestamp (seconds)
 * @param {string} messageData.senderName    - Display name of the sender
 * @param {string} [messageData.senderId]    - Optional sender ID for aria-label
 * @param {string} [messageData.messageId]  - Optional message ID for aria-label
 * @returns {HTMLElement} The dialog element
 */
export function MessageDetailsDialog(messageData) {
  const {
    text = '',
    timestamp = null,
    senderName = 'Unknown',
    senderId = null,
    messageId = null,
  } = messageData

  // Format timestamp as locale date + time string
  let formattedTimestamp = ''
  if (timestamp) {
    const date = new Date(timestamp * 1000)
    formattedTimestamp = date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  // Escape text for safe DOM insertion
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  const escapedText = escapeHtml(text)
  const escapedSender = escapeHtml(senderName)
  const escapedTimestamp = escapeHtml(formattedTimestamp)

  // Build a unique dialog id for aria relationships
  const dialogId = `message-details-dialog-${Date.now()}`

  const dialog = document.createElement('div')
  dialog.className = 'message-details-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', `Message details from ${senderName}`)

  dialog.innerHTML = `
    <div class="message-details-content">
      <div class="message-details-field">
        <span class="message-details-label" id="${dialogId}-sender-label">Sender</span>
        <span class="message-details-value" aria-labelledby="${dialogId}-sender-label">${escapedSender}</span>
      </div>
      <div class="message-details-field">
        <span class="message-details-label" id="${dialogId}-timestamp-label">Timestamp</span>
        <span class="message-details-value" aria-labelledby="${dialogId}-timestamp-label">${escapedTimestamp}</span>
      </div>
      <div class="message-details-field">
        <span class="message-details-label" id="${dialogId}-text-label">Message Text</span>
        <textarea
          class="message-details-text"
          aria-labelledby="${dialogId}-text-label"
          aria-readonly="true"
          readonly
          rows="${Math.max(4, (text.match(/\n/g) || []).length + 3)}"
        >${escapedText}</textarea>
      </div>
    </div>
  `

  // Keyboard trap: keep focus inside dialog while open
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

  return dialog
}