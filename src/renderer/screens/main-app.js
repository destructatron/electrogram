import { announce } from '../app.js'

let currentDialogId = null
let dialogs = []
let messages = []
let unsubscribeUpdate = null
let currentAudio = null
let currentMessageId = null
let attachedFiles = []
let replyingTo = null

function ensureUnsubscribed() {
  if (unsubscribeUpdate) {
    unsubscribeUpdate()
    unsubscribeUpdate = null
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
      <div class="composer" id="composer" style="display:none;">
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
  const recordButton = container.querySelector('#record-button')
  const recordingUI = container.querySelector('#recording-ui')
  const stopRecordButton = container.querySelector('#stop-record-button')
  const previewUI = container.querySelector('#preview-ui')
  const sendVoiceButton = container.querySelector('#send-voice-button')
  const cancelVoiceButton = container.querySelector('#cancel-voice-button')

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

  function getMessagePreviewText(msg) {
    if (msg.isVoice) return `Voice message (${formatDuration(msg.voiceDuration)})`
    if (msg.hasDocument) return `${msg.fileName} (${formatFileSize(msg.documentSize)})`
    return msg.serviceText || msg.text
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
      dialogs = await window.electronAPI.tg.getDialogs(50)
      renderDialogs()
      announce(`Loaded ${dialogs.length} conversations.`)
    } catch (err) {
      announce('Failed to load conversations.')
    }
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
    messages = []
    messageList.innerHTML = ''

    // On mobile, show chat pane
    if (window.innerWidth <= 640) {
      chatPane.classList.remove('hidden')
    }

    try {
      const msgs = await window.electronAPI.tg.getMessages(dialog.id, 50)
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

  function addReplyPreview(msg, li) {
    if (!msg.replyTo) return
    const reply = document.createElement('div')
    reply.className = 'message-reply'
    const replySender = document.createElement('span')
    replySender.className = 'message-reply-sender'
    replySender.textContent = `Replying to ${msg.replyTo.senderName}`
    const replyText = document.createElement('span')
    replyText.className = 'message-reply-text'
    replyText.textContent = msg.replyTo.text
    reply.appendChild(replySender)
    reply.appendChild(replyText)
    li.appendChild(reply)
  }

  function buildMessageLabel(msg, senderLabel) {
    let content
    if (msg.isVoice) {
      content = `Voice message (${formatDuration(msg.voiceDuration)})`
    } else if (msg.hasDocument) {
      content = `File ${msg.fileName} (${formatFileSize(msg.documentSize)})`
      if (msg.text) content += `: ${msg.text}`
    } else if (msg.serviceText) {
      content = msg.serviceText
    } else {
      content = msg.text
    }
    if (msg.replyTo) {
      return `${senderLabel} replying to ${msg.replyTo.senderName}: ${content}. Original message: ${msg.replyTo.text}`
    }
    return `${senderLabel}: ${content}`
  }

  function renderMessages() {
    messageList.innerHTML = ''
    messages.forEach((msg, index) => {
      const li = document.createElement('li')
      li.className = `message-item ${msg.isOutgoing ? 'outgoing' : 'incoming'}`
      li.setAttribute('role', 'listitem')
      li.tabIndex = index === messages.length - 1 ? 0 : -1
      li.dataset.messageId = msg.id
      const senderLabel = msg.isOutgoing ? 'You' : (msg.senderName || 'Unknown')

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

      const time = document.createElement('div')
      time.className = 'message-time'
      time.textContent = new Date(msg.date * 1000).toLocaleTimeString()
      li.appendChild(time)

      attachMessageKeyHandler(li)
      messageList.appendChild(li)
    })
    msgNav.setActiveIndex(messages.length - 1)
    // Scroll to bottom
    messageList.scrollTop = messageList.scrollHeight
  }

  function appendMessage(msg) {
    messages.push(msg)
    const li = document.createElement('li')
    li.className = `message-item ${msg.isOutgoing ? 'outgoing' : 'incoming'}`
    li.setAttribute('role', 'listitem')
    li.tabIndex = -1
    li.dataset.messageId = msg.id
    const senderLabel = msg.isOutgoing ? 'You' : (msg.senderName || 'Unknown')

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

    const time = document.createElement('div')
    time.className = 'message-time'
    time.textContent = new Date(msg.date * 1000).toLocaleTimeString()
    li.appendChild(time)

    attachMessageKeyHandler(li)
    messageList.appendChild(li)
    messageList.scrollTop = messageList.scrollHeight

    // Play sound for new messages in the focused chat (skip incoming in muted chats)
    const currentDialog = dialogs.find(d => d.id === currentDialogId)
    if (msg.isOutgoing || !(currentDialog && currentDialog.muted)) {
      playSentSound()
    }

    // Update conversation last message
    const convItem = conversationList.querySelector(`[data-id="${currentDialogId}"]`)
    if (convItem) {
      const last = convItem.querySelector('.conversation-last')
      if (last) last.textContent = msg.isVoice ? 'Voice message' : (msg.hasDocument ? (msg.text || msg.fileName) : msg.text)
      const dialog = dialogs.find(d => d.id === currentDialogId)
      if (dialog) {
        dialog.lastMessage = msg.isVoice ? 'Voice message' : (msg.hasDocument ? (msg.text || msg.fileName) : msg.text)
      }
    }

    if (!msg.isOutgoing) {
      window.electronAPI.tg.markAsRead(currentDialogId, msg.id).catch(() => {})
      announce(`New message in ${chatTitle.textContent}: ${msg.isVoice ? 'Voice message' : (msg.hasDocument ? (msg.text || msg.fileName) : msg.text)}`)
    }
  }

  async function sendMessage() {
    const text = messageInput.value.trim()
    if ((!text && attachedFiles.length === 0) || !currentDialogId) return
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
    renderReplyPreview()
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

  // Listen for real-time updates
  unsubscribeUpdate = window.electronAPI.tg.onUpdate((update) => {
    if (update.type === 'newMessage') {
      if (currentDialogId && update.chatId === currentDialogId) {
        appendMessage(update)
      } else {
        // Update unread in conversation list
        const dialog = dialogs.find(d => d.id === update.chatId)
        // Play notification sound for non-focused chat (skip muted)
        if (!(dialog && dialog.muted)) {
          playReceivedSound()
        }
        if (dialog) {
          dialog.unreadCount = (dialog.unreadCount || 0) + 1
          dialog.lastMessage = update.text
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
      }
    }
  })

  // Escape closes the current chat or cancels recording
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (recordingUI.style.display !== 'none') {
        e.preventDefault()
        cancelRecording()
      } else if (previewUI.style.display !== 'none') {
        e.preventDefault()
        cancelRecording()
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
}
