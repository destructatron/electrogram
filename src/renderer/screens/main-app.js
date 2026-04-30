import { announce } from '../app.js'

let currentDialogId = null
let dialogs = []
let messages = []
let unsubscribeUpdate = null
let unsubscribeNotification = null
let currentAudio = null
let currentMessageId = null
let attachedFiles = []
let replyingTo = null
let editingMessage = null

function ensureUnsubscribed() {
  if (unsubscribeUpdate) {
    unsubscribeUpdate()
    unsubscribeUpdate = null
  }
  if (unsubscribeNotification) {
    unsubscribeNotification()
    unsubscribeNotification = null
  }
}

export function MainAppScreen() {
  ensureUnsubscribed()

  const container = document.createElement('div')
  container.className = 'main-app'
  container.setAttribute('role', 'region')
  container.setAttribute('aria-label', 'Main Application')

  container.innerHTML = `
    <section class="conversation-pane" id="conversation-pane" aria-label="Conversations">
      <header>Conversations</header>
      <ul class="conversation-list" id="conversation-list" tabindex="-1" aria-label="Conversation list"></ul>
    </section>
    <section class="chat-pane" id="chat-pane" aria-label="Chat">
      <div class="chat-header" id="chat-header">
        <button class="back-button" id="back-button" aria-label="Back to conversations">Back</button>
        <span id="chat-title">Select a conversation</span>
      </div>
      <div class="empty-state" id="empty-state">Select a conversation to start messaging</div>
      <ul class="message-list" id="message-list" role="list" tabindex="-1" aria-label="Messages" style="display:none;"></ul>
      <div class="typing-indicator" id="typing-indicator" style="display:none;"></div>
      <div class="composer" id="composer" style="display:none;">
        <div id="edit-preview" class="edit-preview" style="display:none;"></div>
        <div id="reply-preview" class="reply-preview" style="display:none;"></div>
        <div id="attachment-list" class="attachment-list" style="display:none;"></div>
        <textarea id="message-input" rows="1" aria-label="Message" placeholder="Type a message..."></textarea>
        <button id="attach-button" aria-label="Attach file">📎</button>
        <button id="record-button" aria-label="Record voice message">🎤</button>
        <button id="send-button" aria-label="Send message">Send</button>
        <div id="recording-ui" class="recording-ui" style="display:none;">
          <span id="recording-status" aria-live="polite">Recording...</span>
          <button id="stop-record-button" aria-label="Stop recording">⏹ Stop</button>
        </div>
        <div id="preview-ui" class="preview-ui" style="display:none;">
          <span id="preview-label">Voice message ready</span>
          <button id="send-voice-button" aria-label="Send voice message">Send</button>
          <button id="cancel-voice-button" aria-label="Cancel recording">Cancel</button>
        </div>
      </div>
    </section>
  `

  const conversationList = container.querySelector('#conversation-list')
  const messageList = container.querySelector('#message-list')

  // Only the focused message has tabbable inline buttons
  messageList.addEventListener('focusin', (e) => {
    const li = e.target.closest('.message-item')
    if (li) {
      messageList.querySelectorAll('.message-button-row button').forEach(b => b.tabIndex = -1)
      li.querySelectorAll('.message-button-row button').forEach(b => b.tabIndex = 0)
    }
  })
  messageList.addEventListener('focusout', (e) => {
    const li = e.target.closest('.message-item')
    if (li) {
      const related = e.relatedTarget
      if (!related || !li.contains(related)) {
        li.querySelectorAll('.message-button-row button').forEach(b => b.tabIndex = -1)
      }
    }
  })

  const chatTitle = container.querySelector('#chat-title')
  const emptyState = container.querySelector('#empty-state')
  const composer = container.querySelector('#composer')
  const messageInput = container.querySelector('#message-input')
  const sendButton = container.querySelector('#send-button')
  const backButton = container.querySelector('#back-button')
  const chatPane = container.querySelector('#chat-pane')
  const attachButton = container.querySelector('#attach-button')
  const attachmentList = container.querySelector('#attachment-list')
  const replyPreview = container.querySelector('#reply-preview')
  const editPreview = container.querySelector('#edit-preview')
  const recordButton = container.querySelector('#record-button')
  const recordingUI = container.querySelector('#recording-ui')
  const stopRecordButton = container.querySelector('#stop-record-button')
  const previewUI = container.querySelector('#preview-ui')
  const sendVoiceButton = container.querySelector('#send-voice-button')
  const cancelVoiceButton = container.querySelector('#cancel-voice-button')
  const typingIndicator = container.querySelector('#typing-indicator')

  // Notification sounds
  const sentSound = new Audio(new URL('../../sounds/telegram_sent.mp3', import.meta.url).href)
  const receivedSound = new Audio(new URL('../../sounds/telegram_received.mp3', import.meta.url).href)

  function playSentSound() {
    sentSound.currentTime = 0
    sentSound.play().catch(() => {})
  }

  function playReceivedSound() {
    receivedSound.currentTime = 0
    receivedSound.play().catch(() => {})
  }

  // Roving tabindex for conversation list
  let convIndex = -1

  function setupRovingTabindex(listElement, itemsSelector, onActivate) {
    let activeIndex = -1
    const getItems = () => Array.from(listElement.querySelectorAll(itemsSelector))

    function updateFocus(index, shouldFocus = true) {
      const items = getItems()
      if (!items.length) return
      activeIndex = Math.max(0, Math.min(index, items.length - 1))
      items.forEach((item, i) => {
        item.tabIndex = i === activeIndex ? 0 : -1
      })
      if (shouldFocus) {
        items[activeIndex].focus()
        items[activeIndex].scrollIntoView({ block: 'nearest' })
      }
    }

    listElement.addEventListener('keydown', (e) => {
      const items = getItems()
      console.log('[RovingTabindex] keydown on', listElement.id, 'key:', e.key, 'items:', items.length, 'activeIndex:', activeIndex)
      if (!items.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        updateFocus(activeIndex + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        updateFocus(activeIndex - 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        updateFocus(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        updateFocus(items.length - 1)
      }
    })

    listElement.addEventListener('click', (e) => {
      const item = e.target.closest(itemsSelector)
      if (item) {
        const idx = getItems().indexOf(item)
        if (idx !== -1) {
          updateFocus(idx)
          onActivate(item, idx)
        }
      }
    })

    return {
      updateFocus,
      getActiveIndex: () => activeIndex,
      setActiveIndex: (idx) => updateFocus(idx),
      setActiveIndexWithoutFocus: (idx) => {
        const items = getItems()
        if (!items.length) return
        activeIndex = Math.max(0, Math.min(idx, items.length - 1))
        items.forEach((item, i) => {
          item.tabIndex = i === activeIndex ? 0 : -1
        })
      },
      focusActive: () => {
        const items = getItems()
        if (items.length && activeIndex >= 0) {
          items[activeIndex].focus()
        } else {
          listElement.focus()
        }
      }
    }
  }

  const convNav = setupRovingTabindex(conversationList, '.conversation-item', (item, idx) => {
    const dialog = dialogs[idx]
    if (dialog) openDialog(dialog)
  })

  const msgNav = setupRovingTabindex(messageList, '.message-item', () => {
    // Messages are read-only; just focus them
  })

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatFileSize(bytes) {
    const num = Number(bytes) || 0
    if (num === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(num) / Math.log(k))
    return parseFloat((num / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  function normalizeDate(date) {
    if (!date) return 0
    if (typeof date === 'number') return date
    if (date instanceof Date) return Math.floor(date.getTime() / 1000)
    return Math.floor(new Date(date).getTime() / 1000)
  }

  function getDayStart(timestamp) {
    const d = new Date(normalizeDate(timestamp) * 1000)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }

  function formatDateSeparator(timestamp) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const msgDate = new Date(normalizeDate(timestamp) * 1000)
    const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate()).getTime()
    const diffDays = Math.round((today - msgDay) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return msgDate.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: msgDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  function getMessagePreviewText(msg) {
    if (msg.isVoice) return `Voice message (${formatDuration(msg.voiceDuration || 0)})`
    if (msg.hasDocument) return `${msg.fileName || 'File'} (${formatFileSize(msg.documentSize || 0)})`
    return msg.serviceText || msg.text || ''
  }

  function getMessageCopyText(msg) {
    if (msg.text) return msg.text
    if (msg.serviceText) return msg.serviceText
    if (msg.isVoice) return 'Voice message'
    if (msg.hasDocument) return msg.fileName
    return ''
  }

  // Typing indicators
  const typingUsers = new Map() // userId -> { userName, timer }
  const TYPING_TIMEOUT = 6000

  function applyMessageEdit(messageId, newText, newInlineButtons) {
    const idStr = String(messageId)
    // Update in-memory message
    const msg = messages.find(m => String(m.id) === idStr)
    if (msg) {
      msg.text = newText
      if (newInlineButtons !== undefined) {
        msg.inlineButtons = newInlineButtons
      }
    }
    // Update DOM
    const li = messageList.querySelector(`[data-message-id="${idStr}"]`)
    if (li) {
      const textEl = li.querySelector('.message-text')
      if (textEl) textEl.textContent = newText
      // Rebuild inline buttons if they changed
      const oldButtons = li.querySelector('.message-buttons')
      if (oldButtons) oldButtons.remove()
      if (msg && msg.inlineButtons && msg.inlineButtons.length > 0) {
        renderInlineButtons(msg, li)
      }
      const senderLabel = msg ? (msg.isOutgoing ? 'You' : (msg.senderName || 'Unknown')) : ''
      if (msg) {
        li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
      }
    }
    return msg
  }

  function updateTypingVisual() {
    if (typingUsers.size === 0) {
      typingIndicator.style.display = 'none'
      typingIndicator.textContent = ''
      return
    }
    typingIndicator.style.display = 'block'
    const names = Array.from(typingUsers.values()).map(u => u.userName)
    if (names.length === 1) {
      typingIndicator.textContent = `${names[0]} is typing...`
    } else if (names.length === 2) {
      typingIndicator.textContent = `${names[0]} and ${names[1]} are typing...`
    } else {
      typingIndicator.textContent = `${names.length} people are typing...`
    }
  }

  function clearTypingUser(userId) {
    const user = typingUsers.get(userId)
    if (user) {
      clearTimeout(user.timer)
      typingUsers.delete(userId)
      updateTypingVisual()
    }
  }

  function clearAllTyping() {
    for (const user of typingUsers.values()) {
      clearTimeout(user.timer)
    }
    typingUsers.clear()
    updateTypingVisual()
  }

  function announceTyping(names) {
    if (names.length === 1) {
      announce(`${names[0]} is typing`)
    } else if (names.length === 2) {
      announce(`${names[0]} and ${names[1]} are typing`)
    } else {
      announce(`${names.length} people are typing`)
    }
  }

  function handleTypingUpdate(update) {
    if (update.chatId !== currentDialogId) return
    const existing = typingUsers.has(update.userId)
    // Reset or set timer
    if (existing) {
      const user = typingUsers.get(update.userId)
      clearTimeout(user.timer)
      user.timer = setTimeout(() => clearTypingUser(update.userId), TYPING_TIMEOUT)
      return
    }
    // New typer
    typingUsers.set(update.userId, {
      userName: update.userName,
      timer: setTimeout(() => clearTypingUser(update.userId), TYPING_TIMEOUT)
    })
    updateTypingVisual()
    const names = Array.from(typingUsers.values()).map(u => u.userName)
    announceTyping(names)
  }

  async function attachFiles() {
    try {
      const paths = await window.electronAPI.tg.openFileDialog()
      if (paths && paths.length > 0) {
        attachedFiles = attachedFiles.concat(paths)
        renderAttachments()
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err)
      announce('Failed to open file dialog.')
    }
  }

  function renderReplyPreview() {
    replyPreview.innerHTML = ''
    if (!replyingTo) {
      replyPreview.style.display = 'none'
      return
    }
    replyPreview.style.display = 'flex'
    const label = document.createElement('span')
    label.textContent = `Replying to ${replyingTo.senderName}: ${replyingTo.text}`
    const cancel = document.createElement('button')
    cancel.textContent = '×'
    cancel.setAttribute('aria-label', 'Cancel reply')
    cancel.addEventListener('click', () => {
      replyingTo = null
      renderReplyPreview()
      messageInput.focus()
    })
    replyPreview.appendChild(label)
    replyPreview.appendChild(cancel)
  }

  function renderEditPreview() {
    editPreview.innerHTML = ''
    if (!editingMessage) {
      editPreview.style.display = 'none'
      return
    }
    editPreview.style.display = 'flex'
    const label = document.createElement('span')
    label.textContent = `Editing message`
    const cancel = document.createElement('button')
    cancel.textContent = '×'
    cancel.setAttribute('aria-label', 'Cancel editing')
    cancel.addEventListener('click', () => {
      editingMessage = null
      renderEditPreview()
      messageInput.value = ''
      messageInput.focus()
    })
    editPreview.appendChild(label)
    editPreview.appendChild(cancel)
  }

  function renderAttachments() {
    attachmentList.innerHTML = ''
    if (attachedFiles.length === 0) {
      attachmentList.style.display = 'none'
      return
    }
    attachmentList.style.display = 'flex'
    attachedFiles.forEach((path, index) => {
      const item = document.createElement('div')
      item.className = 'attachment-item'
      const name = document.createElement('span')
      name.textContent = path.split(/[\\/]/).pop()
      const remove = document.createElement('button')
      remove.textContent = '×'
      remove.setAttribute('aria-label', `Remove ${name.textContent}`)
      remove.addEventListener('click', () => {
        attachedFiles.splice(index, 1)
        renderAttachments()
      })
      item.appendChild(name)
      item.appendChild(remove)
      attachmentList.appendChild(item)
    })
    const clearAll = document.createElement('button')
    clearAll.textContent = 'Clear all'
    clearAll.setAttribute('aria-label', 'Clear all attachments')
    clearAll.addEventListener('click', () => {
      attachedFiles = []
      renderAttachments()
    })
    attachmentList.appendChild(clearAll)
  }

  async function playVoiceMessage(messageId) {
    if (currentAudio && currentMessageId === messageId) {
      if (currentAudio.paused) {
        currentAudio.play()
      } else {
        currentAudio.pause()
      }
      return
    }
    if (currentAudio) {
      currentAudio.pause()
      URL.revokeObjectURL(currentAudio.src)
      currentAudio = null
      currentMessageId = null
    }
    try {
      announce('Loading voice message...')
      const buffer = await window.electronAPI.tg.downloadVoiceMessage(messageId)
      const blob = new Blob([buffer], { type: 'audio/ogg' })
      const url = URL.createObjectURL(blob)
      currentAudio = new Audio(url)
      currentMessageId = messageId
      currentAudio.play()
      currentAudio.addEventListener('ended', () => {
        currentMessageId = null
        currentAudio = null
      })
    } catch (err) {
      announce('Failed to load voice message.')
    }
  }

  // Direct arrow-key handlers on message items (fallback + screen-reader safety)
  function attachMessageKeyHandler(li) {
    li.addEventListener('keydown', (e) => {
      console.log('[MessageItem] keydown', e.key, 'on', li.textContent.slice(0, 20))
      if (e.key === 'Enter') {
        if (li.dataset.voice === 'true') {
          e.preventDefault()
          playVoiceMessage(li.dataset.messageId)
        } else if (li.dataset.document === 'true') {
          e.preventDefault()
          downloadDocument(li.dataset.messageId, li.dataset.fileName)
        }
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        const msg = messages.find(m => String(m.id) === li.dataset.messageId)
        if (msg && !msg.serviceText) {
          e.preventDefault()
          editingMessage = null
          renderEditPreview()
          replyingTo = {
            id: msg.id,
            senderName: msg.isOutgoing ? 'You' : (msg.senderName || 'Unknown'),
            text: getMessagePreviewText(msg)
          }
          renderReplyPreview()
          messageInput.focus()
          announce(`Replying to ${replyingTo.senderName}`)
        }
        return
      }
      if (e.key === 'e' || e.key === 'E') {
        const msg = messages.find(m => String(m.id) === li.dataset.messageId)
        if (msg && msg.isOutgoing && !msg.serviceText && !msg.hasDocument && !msg.isVoice) {
          e.preventDefault()
          replyingTo = null
          renderReplyPreview()
          editingMessage = { id: msg.id, text: msg.text }
          renderEditPreview()
          messageInput.value = msg.text
          messageInput.focus()
          announce('Editing message')
        }
        return
      }
      if (e.key === 'c' || e.key === 'C') {
        const msg = messages.find(m => String(m.id) === li.dataset.messageId)
        if (msg) {
          e.preventDefault()
          const text = getMessageCopyText(msg)
          if (text) {
            navigator.clipboard.writeText(text).then(() => {
              announce('Copied to clipboard')
            }).catch(() => {
              announce('Failed to copy')
            })
          } else {
            announce('Nothing to copy')
          }
        }
        return
      }
      if (e.key === 'ArrowUp') {
        const prev = li.previousElementSibling
        if (prev && prev.classList.contains('message-item')) {
          e.preventDefault()
          li.tabIndex = -1
          prev.tabIndex = 0
          prev.focus()
          prev.scrollIntoView({ block: 'nearest' })
        }
      } else if (e.key === 'ArrowDown') {
        const next = li.nextElementSibling
        if (next && next.classList.contains('message-item')) {
          e.preventDefault()
          li.tabIndex = -1
          next.tabIndex = 0
          next.focus()
          next.scrollIntoView({ block: 'nearest' })
        }
      } else if (e.key === 'Home') {
        e.preventDefault()
        const first = messageList.querySelector('.message-item')
        if (first && first !== li) {
          li.tabIndex = -1
          first.tabIndex = 0
          first.focus()
          first.scrollIntoView({ block: 'nearest' })
        }
      } else if (e.key === 'End') {
        e.preventDefault()
        const all = messageList.querySelectorAll('.message-item')
        const last = all[all.length - 1]
        if (last && last !== li) {
          li.tabIndex = -1
          last.tabIndex = 0
          last.focus()
          last.scrollIntoView({ block: 'nearest' })
        }
      }
    })
  }

  async function loadDialogs() {
    try {
      dialogs = await window.electronAPI.tg.getDialogs()
      renderDialogs()
      announce(`Loaded ${dialogs.length} conversations.`)
    } catch (err) {
      announce('Failed to load conversations.')
    }
  }

  function reorderDialogs() {
    const focusedBtn = conversationList.querySelector('.conversation-item:focus')
    const focusedId = focusedBtn?.dataset.id || null

    dialogs.sort((a, b) => (b.date || 0) - (a.date || 0))

    dialogs.forEach((dialog) => {
      const btn = conversationList.querySelector(`[data-id="${dialog.id}"]`)
      if (btn) {
        conversationList.appendChild(btn.parentElement)
      }
    })

    const newFocusIndex = focusedId ? dialogs.findIndex(d => d.id === focusedId) : 0
    const allItems = Array.from(conversationList.querySelectorAll('.conversation-item'))
    allItems.forEach((btn, i) => {
      btn.tabIndex = i === newFocusIndex ? 0 : -1
    })

    convNav.setActiveIndexWithoutFocus(Math.max(0, newFocusIndex))
  }

  function renderDialogs() {
    conversationList.innerHTML = ''
    dialogs.forEach((dialog, index) => {
      const li = document.createElement('li')

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'conversation-item'
      btn.tabIndex = index === 0 ? 0 : -1
      btn.dataset.id = dialog.id

      const titleSpan = document.createElement('span')
      titleSpan.className = 'conversation-title'
      titleSpan.textContent = dialog.title

      if (dialog.unreadCount > 0) {
        const unread = document.createElement('span')
        unread.className = 'conversation-unread'
        unread.textContent = String(dialog.unreadCount)
        titleSpan.appendChild(unread)
      }

      const last = document.createElement('span')
      last.className = 'conversation-last'
      last.textContent = dialog.lastMessage || 'No messages'

      btn.appendChild(titleSpan)
      btn.appendChild(last)
      li.appendChild(btn)
      conversationList.appendChild(li)
    })
    convNav.setActiveIndex(0)
  }

  async function openDialog(dialog) {
    currentDialogId = dialog.id
    chatTitle.textContent = dialog.title
    emptyState.style.display = 'none'
    messageList.style.display = ''
    composer.style.display = ''
    clearAllTyping()
    messages = []
    messageList.innerHTML = ''

    // On mobile, show chat pane
    if (window.innerWidth <= 640) {
      chatPane.classList.remove('hidden')
    }

    try {
      const msgs = await window.electronAPI.tg.getMessages(dialog.id, 100)
      messages = msgs
      renderMessages()
      if (msgs.length === 0) {
        const emptyMsg = document.createElement('li')
        emptyMsg.className = 'empty-state'
        emptyMsg.textContent = 'No messages yet'
        emptyMsg.style.padding = '1rem'
        messageList.appendChild(emptyMsg)
      }
      // Mark messages as read and clear local unread state
      if (msgs.length > 0) {
        window.electronAPI.tg.markAsRead(dialog.id, msgs[msgs.length - 1].id).catch(() => {})
      }
      dialog.unreadCount = 0
      const convItem = conversationList.querySelector(`[data-id="${dialog.id}"]`)
      if (convItem) {
        const unread = convItem.querySelector('.conversation-unread')
        if (unread) unread.remove()
      }
      announce(`Opened ${dialog.title}. ${msgs.length} messages loaded.`)
      // Focus composer
      messageInput.focus()
    } catch (err) {
      console.error('[MainApp] Failed to load messages:', err)
      const errorMsg = document.createElement('li')
      errorMsg.className = 'error-text'
      errorMsg.textContent = 'Failed to load messages. Press Escape to go back.'
      errorMsg.style.padding = '1rem'
      messageList.appendChild(errorMsg)
      announce('Failed to load messages.')
    }
  }

  function closeDialog() {
    currentDialogId = null
    chatTitle.textContent = 'Select a conversation'
    emptyState.style.display = ''
    messageList.style.display = 'none'
    composer.style.display = 'none'
    messages = []
    messageList.innerHTML = ''
    if (window.innerWidth <= 640) {
      chatPane.classList.add('hidden')
    }
    convNav.focusActive()
  }

  async function loadMoreMessages() {
    if (!currentDialogId || messages.length === 0) return
    try {
      const oldestId = messages[0].id
      const newMsgs = await window.electronAPI.tg.getMessages(currentDialogId, 100, oldestId)
      if (newMsgs.length === 0) {
        announce('No older messages.')
        return
      }
      messages = [...newMsgs, ...messages]
      renderMessages(newMsgs.length)
      announce(`Loaded ${newMsgs.length} older messages.`)
    } catch (err) {
      console.error('[MainApp] Failed to load more messages:', err)
      announce('Failed to load older messages.')
    }
  }

  function addReplyPreview(msg, li) {
    if (!msg.replyTo) return
    const reply = document.createElement('div')
    reply.className = 'message-reply'
    reply.setAttribute('role', 'none')
    const replySender = document.createElement('span')
    replySender.className = 'message-reply-sender'
    replySender.textContent = `${msg.isOutgoing ? 'You' : (msg.senderName || 'Unknown')} replying to ${msg.replyTo.senderName}`
    const replyText = document.createElement('span')
    replyText.className = 'message-reply-text'
    replyText.textContent = msg.replyTo.text
    reply.appendChild(replySender)
    reply.appendChild(replyText)
    li.appendChild(reply)
  }

  function formatMessageTimestamp(date) {
    const ts = normalizeDate(date) * 1000
    const msgDate = new Date(ts)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate()).getTime()
    const diffDays = Math.round((today - msgDay) / (1000 * 60 * 60 * 24))
    const timeStr = msgDate.toLocaleTimeString()

    if (diffDays === 0) return timeStr
    if (diffDays === 1) return `Yesterday at ${timeStr}`
    const dateStr = msgDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: msgDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
    return `${dateStr} at ${timeStr}`
  }

  function buildMessageLabel(msg, senderLabel) {
    let content
    if (msg.isVoice) {
      content = `Voice message (${formatDuration(msg.voiceDuration || 0)})`
    } else if (msg.hasDocument) {
      content = `File ${msg.fileName || 'unknown'} (${formatFileSize(msg.documentSize || 0)})`
      if (msg.text) content += `: ${msg.text}`
    } else if (msg.serviceText) {
      content = msg.serviceText
    } else {
      content = msg.text || ''
    }
    if (msg.inlineButtons && msg.inlineButtons.length > 0) {
      const btnCount = msg.inlineButtons.reduce((sum, r) => sum + r.buttons.length, 0)
      content += `. ${btnCount} button${btnCount === 1 ? '' : 's'}`
    }
    const timeStr = formatMessageTimestamp(msg.date)
    if (msg.replyTo) {
      return `${senderLabel} replying to ${msg.replyTo.senderName || 'Unknown'}: ${content}. Original message: ${msg.replyTo.text || ''}. ${timeStr}`
    }
    return `${senderLabel}: ${content}. ${timeStr}`
  }

  async function handleButtonClick(messageId, row, col) {
    try {
      announce('Processing...')
      const result = await window.electronAPI.tg.clickInlineButton(messageId, row, col)
      if (result.type === 'url') {
        window.open(result.url, '_blank')
        announce('Opening link')
      } else if (result.type === 'callback') {
        if (result.message) {
          announce(result.message)
        } else {
          announce('Button pressed')
        }
      } else {
        announce('Button pressed')
      }
    } catch (err) {
      console.error('Button click failed:', err)
      announce('Button failed')
    }
  }

  function attachButtonKeyHandler(button, li) {
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        button.click()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = li.previousElementSibling
        if (prev && prev.classList.contains('message-item')) {
          li.tabIndex = -1
          prev.tabIndex = 0
          prev.focus()
          prev.scrollIntoView({ block: 'nearest' })
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = li.nextElementSibling
        if (next && next.classList.contains('message-item')) {
          li.tabIndex = -1
          next.tabIndex = 0
          next.focus()
          next.scrollIntoView({ block: 'nearest' })
        }
        return
      }
    })
  }

  function renderInlineButtons(msg, li) {
    if (!msg.inlineButtons || msg.inlineButtons.length === 0) return
    const container = document.createElement('div')
    container.className = 'message-buttons'
    msg.inlineButtons.forEach((row) => {
      const rowEl = document.createElement('div')
      rowEl.className = 'message-button-row'
      row.buttons.forEach((btn) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.tabIndex = -1
        button.textContent = btn.text
        button.addEventListener('click', () => {
          handleButtonClick(msg.id, btn.row, btn.col)
        })
        attachButtonKeyHandler(button, li)
        rowEl.appendChild(button)
      })
      container.appendChild(rowEl)
    })
    const timeEl = li.querySelector('.message-time')
    if (timeEl) {
      li.insertBefore(container, timeEl)
    } else {
      li.appendChild(container)
    }
  }

  function renderMessages(focusIndex = null) {
    messageList.innerHTML = ''
    let lastDayStart = null
    messages.forEach((msg, index) => {
      const msgDayStart = getDayStart(msg.date)
      if (lastDayStart === null || msgDayStart !== lastDayStart) {
        const separator = document.createElement('li')
        separator.className = 'message-date-separator'
        separator.setAttribute('role', 'separator')
        separator.setAttribute('aria-label', formatDateSeparator(msg.date))
        separator.textContent = formatDateSeparator(msg.date)
        messageList.appendChild(separator)
        lastDayStart = msgDayStart
      }
      const li = document.createElement('li')
      li.className = `message-item ${msg.isOutgoing ? 'outgoing' : 'incoming'}`
      li.setAttribute('role', 'listitem')
      li.tabIndex = index === (focusIndex !== null ? focusIndex : messages.length - 1) ? 0 : -1
      li.dataset.messageId = msg.id
      const senderLabel = msg.isOutgoing ? 'You' : (msg.senderName || 'Unknown')

      if (msg.replyTo) {
        const srOnly = document.createElement('span')
        srOnly.className = 'sr-only'
        srOnly.textContent = buildMessageLabel(msg, senderLabel)
        li.appendChild(srOnly)
      }

      if (!msg.isOutgoing && !msg.serviceText) {
        const sender = document.createElement('div')
        sender.className = 'message-sender'
        sender.textContent = msg.senderName || 'Unknown'
        li.appendChild(sender)
      }

      addReplyPreview(msg, li)

      if (msg.isVoice) {
        li.dataset.voice = 'true'
        const voice = document.createElement('div')
        voice.className = 'message-voice'
        voice.textContent = `🎤 Voice message (${formatDuration(msg.voiceDuration)})`
        li.appendChild(voice)
        li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
      } else if (msg.hasDocument) {
        li.dataset.document = 'true'
        li.dataset.fileName = msg.fileName || 'file'
        const doc = document.createElement('div')
        doc.className = 'message-document'
        doc.textContent = `📎 ${msg.fileName} (${formatFileSize(msg.documentSize)})`
        li.appendChild(doc)
        if (msg.text) {
          const text = document.createElement('div')
          text.className = 'message-text'
          text.textContent = msg.text
          li.appendChild(text)
        }
        li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
      } else if (msg.serviceText) {
        li.classList.add('service')
        const service = document.createElement('div')
        service.className = 'message-service'
        service.textContent = msg.serviceText
        li.appendChild(service)
        li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
      } else {
        const text = document.createElement('div')
        text.className = 'message-text'
        text.textContent = msg.text
        li.appendChild(text)
        li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
      }

      renderInlineButtons(msg, li)

      const time = document.createElement('div')
      time.className = 'message-time'
      time.textContent = new Date(normalizeDate(msg.date) * 1000).toLocaleTimeString()
      li.appendChild(time)

      attachMessageKeyHandler(li)
      messageList.appendChild(li)
    })
    msgNav.setActiveIndex(focusIndex !== null ? focusIndex : messages.length - 1)
    if (focusIndex === null) {
      messageList.scrollTop = messageList.scrollHeight
    }
  }

  function appendMessage(msg) {
    const existingIndex = messages.findIndex(m => String(m.id) === String(msg.id))
    if (existingIndex !== -1) {
      // Replace existing message data (e.g., more complete update) but don't duplicate DOM
      messages[existingIndex] = msg
      return
    }
    messages.push(msg)
    const li = document.createElement('li')
    li.className = `message-item ${msg.isOutgoing ? 'outgoing' : 'incoming'}`
    li.setAttribute('role', 'listitem')
    li.tabIndex = -1
    li.dataset.messageId = msg.id
    const senderLabel = msg.isOutgoing ? 'You' : (msg.senderName || 'Unknown')

    if (msg.replyTo) {
      const srOnly = document.createElement('span')
      srOnly.className = 'sr-only'
      srOnly.textContent = buildMessageLabel(msg, senderLabel)
      li.appendChild(srOnly)
    }

    if (!msg.isOutgoing && !msg.serviceText) {
      const sender = document.createElement('div')
      sender.className = 'message-sender'
      sender.textContent = msg.senderName || 'Unknown'
      li.appendChild(sender)
    }

    addReplyPreview(msg, li)

    if (msg.isVoice) {
      li.dataset.voice = 'true'
      const voice = document.createElement('div')
      voice.className = 'message-voice'
      voice.textContent = `🎤 Voice message (${formatDuration(msg.voiceDuration)})`
      li.appendChild(voice)
      li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
    } else if (msg.hasDocument) {
      li.dataset.document = 'true'
      li.dataset.fileName = msg.fileName || 'file'
      const doc = document.createElement('div')
      doc.className = 'message-document'
      doc.textContent = `📎 ${msg.fileName} (${formatFileSize(msg.documentSize)})`
      li.appendChild(doc)
      if (msg.text) {
        const text = document.createElement('div')
        text.className = 'message-text'
        text.textContent = msg.text
        li.appendChild(text)
      }
      li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
    } else if (msg.serviceText) {
      li.classList.add('service')
      const service = document.createElement('div')
      service.className = 'message-service'
      service.textContent = msg.serviceText
      li.appendChild(service)
      li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
    } else {
      const text = document.createElement('div')
      text.className = 'message-text'
      text.textContent = msg.text
      li.appendChild(text)
      li.setAttribute('aria-label', buildMessageLabel(msg, senderLabel))
    }

    // Insert date separator if this message starts a new day
    const prevMsg = messages[messages.length - 2]
    const msgDayStart = getDayStart(msg.date)
    const prevDayStart = prevMsg ? getDayStart(prevMsg.date) : null
    if (prevDayStart === null || msgDayStart !== prevDayStart) {
      const separator = document.createElement('li')
      separator.className = 'message-date-separator'
      separator.setAttribute('role', 'separator')
      separator.setAttribute('aria-label', formatDateSeparator(msg.date))
      separator.textContent = formatDateSeparator(msg.date)
      messageList.appendChild(separator)
    }

    renderInlineButtons(msg, li)

    const time = document.createElement('div')
    time.className = 'message-time'
    time.textContent = new Date(normalizeDate(msg.date) * 1000).toLocaleTimeString()
    li.appendChild(time)

    attachMessageKeyHandler(li)
    messageList.appendChild(li)
    messageList.scrollTop = messageList.scrollHeight

    // Play sound for new messages in the focused chat (skip incoming in muted chats)
    const currentDialog = dialogs.find(d => d.id === currentDialogId)
    if (msg.isOutgoing || !(currentDialog && currentDialog.muted)) {
      playSentSound()
    }

    // Update conversation last message and reorder
    const dialog = dialogs.find(d => d.id === currentDialogId)
    if (dialog) {
      dialog.lastMessage = msg.isVoice ? 'Voice message' : (msg.hasDocument ? (msg.text || msg.fileName) : msg.text)
      dialog.date = msg.date
    }
    const convItem = conversationList.querySelector(`[data-id="${currentDialogId}"]`)
    if (convItem) {
      const last = convItem.querySelector('.conversation-last')
      if (last) last.textContent = msg.isVoice ? 'Voice message' : (msg.hasDocument ? (msg.text || msg.fileName) : msg.text)
    }
    reorderDialogs()

    if (!msg.isOutgoing) {
      window.electronAPI.tg.markAsRead(currentDialogId, msg.id).catch(() => {})
      announce(`New message in ${chatTitle.textContent}: ${msg.isVoice ? 'Voice message' : (msg.hasDocument ? (msg.text || msg.fileName) : msg.text)}`)
    }
  }

  async function sendMessage() {
    const text = messageInput.value.trim()
    if ((!text && attachedFiles.length === 0) || !currentDialogId) return

    // Handle editing an existing message
    if (editingMessage) {
      try {
        announce('Editing message...')
        const edited = await window.electronAPI.tg.editMessage(currentDialogId, editingMessage.id, text)
        editingMessage = null
        renderEditPreview()
        messageInput.value = ''
        // Update the message in the list and DOM
        const msg = applyMessageEdit(edited.id, edited.text)
        // Update conversation last message
        const convItem = conversationList.querySelector(`[data-id="${currentDialogId}"]`)
        if (convItem) {
          const last = convItem.querySelector('.conversation-last')
          if (last) last.textContent = edited.text
        }
        const dialog = dialogs.find(d => d.id === currentDialogId)
        if (dialog) dialog.lastMessage = edited.text
      } catch (err) {
        console.error('Failed to edit message:', err)
        announce('Failed to edit message.')
      }
      return
    }

    const replyToMsgId = replyingTo ? replyingTo.id : null

    if (attachedFiles.length > 0) {
      try {
        announce('Sending files...')
        const msgs = await window.electronAPI.tg.sendFiles(currentDialogId, attachedFiles, text, replyToMsgId)
        for (const msg of msgs) {
          if (replyToMsgId) {
            msg.replyTo = { ...replyingTo }
          }
          appendMessage(msg)
        }
        attachedFiles = []
        messageInput.value = ''
        replyingTo = null
        renderReplyPreview()
        renderAttachments()
      } catch (err) {
        console.error('Failed to send files:', err)
        announce('Failed to send files.')
        return
      }
    } else if (text) {
      messageInput.value = ''
      try {
        const msg = await window.electronAPI.tg.sendMessage(currentDialogId, text, replyToMsgId)
        if (replyToMsgId) {
          msg.replyTo = { ...replyingTo }
        }
        appendMessage(msg)
        replyingTo = null
        renderReplyPreview()
      } catch (err) {
        announce('Failed to send message.')
        messageInput.value = text
      }
    }
  }

  async function downloadDocument(messageId, fileName) {
    try {
      announce(`Downloading ${fileName}...`)
      const savedPath = await window.electronAPI.tg.downloadFile(messageId, fileName)
      if (savedPath) {
        announce(`Saved ${fileName}`)
      } else {
        announce('Download cancelled')
      }
    } catch (err) {
      console.error('Download failed:', err)
      announce('Failed to download file')
    }
  }

  sendButton.addEventListener('click', sendMessage)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  })

  let mediaRecorder = null
  let recordedChunks = []
  let recordingStartTime = 0

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : ''
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recordedChunks = []
      recordingStartTime = Date.now()

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data)
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        showPreviewUI()
      }

      mediaRecorder.start(100)
      showRecordingUI()
      announce('Recording started. Press stop to finish.')
    } catch (err) {
      announce('Could not access microphone.')
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
  }

  function showRecordingUI() {
    messageInput.style.display = 'none'
    sendButton.style.display = 'none'
    attachButton.style.display = 'none'
    recordButton.style.display = 'none'
    previewUI.style.display = 'none'
    recordingUI.style.display = 'flex'
    stopRecordButton.focus()
  }

  function showPreviewUI() {
    recordingUI.style.display = 'none'
    messageInput.style.display = 'none'
    sendButton.style.display = 'none'
    attachButton.style.display = 'none'
    recordButton.style.display = 'none'
    previewUI.style.display = 'flex'
    sendVoiceButton.focus()
    announce('Voice message ready. Press Enter to send or Escape to cancel.')
  }

  function showComposerUI() {
    recordingUI.style.display = 'none'
    previewUI.style.display = 'none'
    messageInput.style.display = ''
    sendButton.style.display = ''
    attachButton.style.display = ''
    recordButton.style.display = ''
    mediaRecorder = null
    recordedChunks = []
    attachedFiles = []
    replyingTo = null
    editingMessage = null
    renderReplyPreview()
    renderEditPreview()
    renderAttachments()
    messageInput.focus()
  }

  async function sendRecordedVoice() {
    if (recordedChunks.length === 0 || !currentDialogId) return
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType })
    const arrayBuffer = await blob.arrayBuffer()
    const duration = Math.round((Date.now() - recordingStartTime) / 1000)
    try {
      announce('Sending voice message...')
      const msg = await window.electronAPI.tg.sendVoiceMessage(currentDialogId, arrayBuffer, duration)
      appendMessage(msg)
      showComposerUI()
    } catch (err) {
      console.error('Failed to send voice message:', err)
      announce('Failed to send voice message.')
    }
  }

  function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    showComposerUI()
  }

  attachButton.addEventListener('click', attachFiles)
  recordButton.addEventListener('click', startRecording)
  stopRecordButton.addEventListener('click', stopRecording)
  sendVoiceButton.addEventListener('click', sendRecordedVoice)
  cancelVoiceButton.addEventListener('click', cancelRecording)

  backButton.addEventListener('click', closeDialog)

  // Handle notification clicks
  unsubscribeNotification = window.electronAPI.tg.onNotificationClicked((chatId) => {
    const dialog = dialogs.find(d => d.id === chatId)
    if (dialog) {
      // On mobile, ensure chat pane is visible
      if (window.innerWidth <= 640) {
        chatPane.classList.remove('hidden')
      }
      openDialog(dialog)
    }
  })

  // Listen for real-time updates
  unsubscribeUpdate = window.electronAPI.tg.onUpdate((update) => {
    if (update.type === 'typing') {
      handleTypingUpdate(update)
      return
    }
    if (update.type === 'editMessage') {
      if (currentDialogId && update.chatId === currentDialogId) {
        applyMessageEdit(update.id, update.text, update.inlineButtons)
        // Update conversation last message
        const convItem = conversationList.querySelector(`[data-id="${currentDialogId}"]`)
        if (convItem) {
          const last = convItem.querySelector('.conversation-last')
          if (last) last.textContent = update.isVoice ? 'Voice message' : (update.hasDocument ? (update.text || update.fileName) : update.text)
          const dialog = dialogs.find(d => d.id === currentDialogId)
          if (dialog) {
            dialog.lastMessage = update.isVoice ? 'Voice message' : (update.hasDocument ? (update.text || update.fileName) : update.text)
          }
        }
        announce('Message edited')
      }
      return
    }
    if (update.type === 'newMessage') {
      if (currentDialogId && update.chatId === currentDialogId) {
        // Clear typing for this user when their message arrives
        if (update.senderId && typingUsers.has(update.senderId)) {
          clearTypingUser(update.senderId)
        }
        appendMessage(update)
      } else {
        // Update unread in conversation list
        const dialog = dialogs.find(d => d.id === update.chatId)
        // Play notification sound and show system notification for non-focused chat (skip muted)
        if (!(dialog && dialog.muted)) {
          playReceivedSound()
          const title = dialog ? dialog.title : 'New message'
          const body = update.isVoice ? 'Voice message' : (update.hasDocument ? (update.text || update.fileName) : update.text)
          window.electronAPI.tg.showNotification(title, body, update.chatId)
        }
        if (dialog) {
          dialog.unreadCount = (dialog.unreadCount || 0) + 1
          dialog.lastMessage = update.text
          dialog.date = update.date
        }
        const convItem = conversationList.querySelector(`[data-id="${update.chatId}"]`)
        if (convItem) {
          const unread = convItem.querySelector('.conversation-unread')
          const current = unread ? parseInt(unread.textContent, 10) : 0
          if (unread) {
            unread.textContent = String(current + 1)
          } else {
            const title = convItem.querySelector('.conversation-title')
            const badge = document.createElement('span')
            badge.className = 'conversation-unread'
            badge.textContent = '1'
            title.appendChild(badge)
          }
          const last = convItem.querySelector('.conversation-last')
          if (last) last.textContent = update.text
        }
        reorderDialogs()
      }
    }
  })

  // Escape closes the current chat or cancels recording
  document.addEventListener('keydown', (e) => {
    if (e.key === 'PageUp' && currentDialogId) {
      e.preventDefault()
      loadMoreMessages()
      return
    }
    if (e.key === 'Escape') {
      if (recordingUI.style.display !== 'none') {
        e.preventDefault()
        cancelRecording()
      } else if (previewUI.style.display !== 'none') {
        e.preventDefault()
        cancelRecording()
      } else if (editingMessage) {
        e.preventDefault()
        editingMessage = null
        renderEditPreview()
        messageInput.value = ''
        messageInput.focus()
      } else if (replyingTo) {
        e.preventDefault()
        replyingTo = null
        renderReplyPreview()
        messageInput.focus()
      } else if (currentDialogId) {
        e.preventDefault()
        closeDialog()
      }
    }
  })

  loadDialogs()

  return container
}

// Cleanup when leaving main app
export function cleanupMainApp() {
  ensureUnsubscribed()
  if (unsubscribeNotification) {
    unsubscribeNotification()
    unsubscribeNotification = null
  }
  if (currentAudio) {
    currentAudio.pause()
    URL.revokeObjectURL(currentAudio.src)
    currentAudio = null
    currentMessageId = null
  }
  currentDialogId = null
  dialogs = []
  messages = []
  attachedFiles = []
  replyingTo = null
  editingMessage = null
  clearAllTyping()
}
