import { TelegramClient, Api } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { NewMessage, Raw } from 'telegram/events/index.js'
import { CustomFile } from 'telegram/client/uploads.js'
import { app, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { computeCheck } from 'telegram/Password.js'

const SESSION_FILE = path.join(app.getPath('userData'), 'session.txt')
const CREDS_FILE = path.join(app.getPath('userData'), 'credentials.json')

class TelegramManager {
  constructor() {
    this.client = null
    this.sessionString = ''
    this.apiId = 0
    this.apiHash = ''
    this.phoneCodeHash = ''
    this.phoneNumber = ''
    this.window = null
    this.dialogsCache = new Map()
    this.messagesCache = new Map()
    this.loadSession()
  }

  getSavedCredentials() {
    try {
      if (fs.existsSync(CREDS_FILE)) {
        const data = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'))
        return { apiId: data.apiId || '', apiHash: data.apiHash || '' }
      }
    } catch (e) {
      console.error('Failed to load credentials', e)
    }
    return { apiId: '', apiHash: '' }
  }

  saveCredentials(apiId, apiHash) {
    try {
      fs.writeFileSync(CREDS_FILE, JSON.stringify({ apiId, apiHash }), 'utf-8')
    } catch (e) {
      console.error('Failed to save credentials', e)
    }
  }

  loadSession() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        this.sessionString = fs.readFileSync(SESSION_FILE, 'utf-8').trim()
      }
    } catch (e) {
      console.error('Failed to load session', e)
    }
  }

  saveSession() {
    try {
      if (this.client && this.client.session) {
        this.sessionString = this.client.session.save()
        fs.writeFileSync(SESSION_FILE, this.sessionString, 'utf-8')
      }
    } catch (e) {
      console.error('Failed to save session', e)
    }
  }

  setWindow(win) {
    this.window = win
  }

  async connect(apiId, apiHash) {
    this.apiId = Number(apiId)
    this.apiHash = apiHash
    this.saveCredentials(apiId, apiHash)
    const session = new StringSession(this.sessionString || '')
    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      useWSS: false
    })
    await this.client.connect()
    this.saveSession()
    this.setupHandlers()
    return { connected: true, authorized: await this.client.isUserAuthorized() }
  }

  getDisplayName(entity) {
    if (!entity) return 'Unknown'
    if (entity.className === 'User') {
      const parts = [entity.firstName, entity.lastName].filter(Boolean)
      return parts.join(' ') || entity.username || 'Unknown'
    }
    return entity.title || entity.username || 'Unknown'
  }

  getVoiceInfo(msg) {
    const media = msg.media
    if (media && media.className === 'MessageMediaDocument') {
      const document = media.document
      if (document && document.attributes) {
        const audioAttr = document.attributes.find(a => a.className === 'DocumentAttributeAudio')
        if (audioAttr && audioAttr.voice) {
          return { isVoice: true, voiceDuration: audioAttr.duration || 0 }
        }
      }
    }
    return { isVoice: false, voiceDuration: 0 }
  }

  getReplyPreview(msg) {
    if (msg.text) return msg.text
    const voiceInfo = this.getVoiceInfo(msg)
    if (voiceInfo.isVoice) return 'Voice message'
    if (msg.action) return 'Service message'
    return ''
  }

  getFileInfo(msg) {
    const media = msg.media
    if (media && media.className === 'MessageMediaDocument') {
      const document = media.document
      if (document) {
        const filenameAttr = document.attributes.find(a => a.className === 'DocumentAttributeFilename')
        const audioAttr = document.attributes.find(a => a.className === 'DocumentAttributeAudio')
        const videoAttr = document.attributes.find(a => a.className === 'DocumentAttributeVideo')
        if (audioAttr && audioAttr.voice) return null
        if (videoAttr) return null
        return {
          hasDocument: true,
          fileName: filenameAttr ? filenameAttr.fileName : 'file',
          documentSize: Number(document.size) || 0
        }
      }
    }
    return null
  }

  async getServiceText(msg) {
    if (!msg || !msg.action) return null

    const getName = async (userId) => {
      if (!userId) return 'Someone'
      try {
        const entity = await this.client.getEntity(userId)
        return entity.firstName || entity.title || entity.username || 'Someone'
      } catch {
        return 'Someone'
      }
    }

    switch (msg.action.className) {
      case 'MessageActionChatAddUser': {
        const names = []
        for (const uid of msg.action.users) {
          names.push(await getName(uid))
        }
        return names.length === 1 ? `${names[0]} joined` : `${names.join(', ')} joined`
      }
      case 'MessageActionChatDeleteUser': {
        const name = await getName(msg.action.userId)
        return `${name} left`
      }
      case 'MessageActionChatJoinedByLink':
      case 'MessageActionChatJoinedByRequest': {
        const name = msg.senderId ? await getName(msg.senderId) : 'Someone'
        return `${name} joined`
      }
      case 'MessageActionChatCreate':
        return 'Group created'
      case 'MessageActionChannelCreate':
        return 'Channel created'
      case 'MessageActionChatEditTitle':
        return 'Group name changed'
      case 'MessageActionChatEditPhoto':
        return 'Group photo changed'
      case 'MessageActionChatDeletePhoto':
        return 'Group photo deleted'
      case 'MessageActionPinMessage':
        return 'Message pinned'
      case 'MessageActionHistoryClear':
        return 'History cleared'
      default:
        return null
    }
  }

  setupHandlers() {
    if (!this.client) return
    this.client.addEventHandler(async (event) => {
      const msg = event.message
      this.messagesCache.set(msg.id, msg)
      const sender = await msg.getSender()
      const voiceInfo = this.getVoiceInfo(msg)
      const serviceText = await this.getServiceText(msg)
      const fileInfo = this.getFileInfo(msg)
      let replyTo = null
      if (msg.replyToMsgId) {
        const original = await msg.getReplyMessage()
        if (original) {
          this.messagesCache.set(original.id, original)
          replyTo = {
            id: original.id,
            senderName: original.out ? 'You' : this.getDisplayName(original.sender),
            text: this.getReplyPreview(original)
          }
        }
      }
      const update = {
        type: 'newMessage',
        id: msg.id,
        text: msg.text || serviceText || (voiceInfo.isVoice ? 'Voice message' : '') || (fileInfo ? fileInfo.fileName : ''),
        serviceText,
        replyTo,
        hasDocument: !!fileInfo,
        fileName: fileInfo ? fileInfo.fileName : null,
        documentSize: fileInfo ? fileInfo.documentSize : 0,
        date: msg.date,
        senderId: msg.senderId ? msg.senderId.toString() : null,
        senderName: this.getDisplayName(sender),
        chatId: msg.chatId ? msg.chatId.toString() : null,
        isOutgoing: msg.out || false,
        isVoice: voiceInfo.isVoice,
        voiceDuration: voiceInfo.voiceDuration
      }
      this.pushUpdate(update)
    }, new NewMessage({}))

    this.client.addEventHandler(async (event) => {
      const update = event
      if (update.className === 'UpdateUserTyping') {
        try {
          const user = await this.client.getEntity(update.userId)
          this.pushUpdate({
            type: 'typing',
            chatId: update.userId.toString(),
            userId: update.userId.toString(),
            userName: this.getDisplayName(user),
            action: update.action.className
          })
        } catch {
          this.pushUpdate({
            type: 'typing',
            chatId: update.userId.toString(),
            userId: update.userId.toString(),
            userName: 'Someone',
            action: update.action.className
          })
        }
      } else if (update.className === 'UpdateChatUserTyping' || update.className === 'UpdateChannelUserTyping') {
        const chatId = update.chatId.toString()
        let userId = null
        let userName = 'Someone'
        try {
          if (update.fromId && update.fromId.className === 'PeerUser') {
            userId = update.fromId.userId.toString()
            const user = await this.client.getEntity(update.fromId.userId)
            userName = this.getDisplayName(user)
          } else if (update.fromId) {
            userId = update.fromId.toString()
            const entity = await this.client.getEntity(update.fromId)
            userName = this.getDisplayName(entity)
          }
        } catch {
          // fallback to 'Someone'
        }
        this.pushUpdate({
          type: 'typing',
          chatId,
          userId,
          userName,
          action: update.action.className
        })
      }
    }, new Raw({}))
  }

  pushUpdate(update) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('tg:update', update)
    }
  }

  async sendCode(phoneNumber) {
    if (!this.client) throw new Error('Not connected')
    this.phoneNumber = phoneNumber
    const result = await this.client.sendCode(
      { apiId: this.apiId, apiHash: this.apiHash },
      phoneNumber
    )
    this.phoneCodeHash = result.phoneCodeHash
    return { sent: true, isCodeViaApp: result.isCodeViaApp }
  }

  async signIn(phoneCode) {
    if (!this.client) throw new Error('Not connected')
    try {
      const result = await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.phoneNumber,
          phoneCodeHash: this.phoneCodeHash,
          phoneCode
        })
      )
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        return { needsSignUp: true }
      }
      this.saveSession()
      return { authorized: true, user: result.user }
    } catch (err) {
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        return { needsPassword: true }
      }
      throw err
    }
  }

  async signInPassword(password) {
    if (!this.client) throw new Error('Not connected')
    const passwordSrp = await this.client.invoke(new Api.account.GetPassword())
    const check = await computeCheck(passwordSrp, password)
    const result = await this.client.invoke(
      new Api.auth.CheckPassword({ password: check })
    )
    this.saveSession()
    return { authorized: true, user: result.user }
  }

  async getDialogs(limit = 50) {
    if (!this.client) throw new Error('Not connected')
    const dialogs = await this.client.getDialogs({ limit })
    this.dialogsCache.clear()
    return await Promise.all(dialogs.map(async (d) => {
      const entity = d.entity || {}
      const title = d.title || entity.firstName || entity.username || 'Unknown'
      const isUser = entity.className === 'User'
      const id = d.id ? d.id.toString() : null
      if (id) {
        this.dialogsCache.set(id, d.entity || d.inputEntity || d.id)
      }
      const serviceText = await this.getServiceText(d.message)
      const voiceInfo = this.getVoiceInfo(d.message)
      const notifySettings = d.dialog && d.dialog.notifySettings ? d.dialog.notifySettings : null
      const muteUntil = notifySettings && typeof notifySettings.muteUntil === 'number' ? notifySettings.muteUntil : 0
      const silent = notifySettings && notifySettings.silent === true
      const muted = silent || muteUntil > Math.floor(Date.now() / 1000)
      return {
        id,
        title: String(title),
        unreadCount: d.unreadCount || 0,
        lastMessage: d.message ? (d.message.text || serviceText || (voiceInfo.isVoice ? 'Voice message' : '')) : '',
        isUser,
        isChannel: entity.className === 'Channel',
        isGroup: !isUser && entity.className !== 'Channel',
        muted,
        date: d.date ? (typeof d.date === 'number' ? d.date : Math.floor(d.date.getTime() / 1000)) : 0
      }
    }))
  }

  async getMessages(dialogId, limit = 50) {
    if (!this.client) throw new Error('Not connected')
    const cached = this.dialogsCache.get(dialogId)
    const entity = cached || dialogId
    const messages = await this.client.getMessages(entity, { limit })
    const msgMap = new Map()
    messages.forEach(m => msgMap.set(m.id, m))
    const result = await Promise.all(messages.map(async (m) => {
      this.messagesCache.set(m.id, m)
      const voiceInfo = this.getVoiceInfo(m)
      const serviceText = await this.getServiceText(m)
      const fileInfo = this.getFileInfo(m)
      let replyTo = null
      if (m.replyToMsgId) {
        const original = msgMap.get(m.replyToMsgId)
        if (original) {
          replyTo = {
            id: original.id,
            senderName: original.out ? 'You' : this.getDisplayName(original.sender),
            text: this.getReplyPreview(original)
          }
        }
      }
      return {
        id: m.id,
        text: m.text || '',
        serviceText,
        replyTo,
        hasDocument: !!fileInfo,
        fileName: fileInfo ? fileInfo.fileName : null,
        documentSize: fileInfo ? fileInfo.documentSize : 0,
        date: m.date ? (typeof m.date === 'number' ? m.date : Math.floor(m.date.getTime() / 1000)) : 0,
        senderId: m.senderId ? m.senderId.toString() : null,
        senderName: this.getDisplayName(m.sender),
        isOutgoing: m.out || false,
        isVoice: voiceInfo.isVoice,
        voiceDuration: voiceInfo.voiceDuration
      }
    }))
    return result.reverse()
  }

  async sendMessage(dialogId, text, replyToMsgId = null) {
    if (!this.client) throw new Error('Not connected')
    const cached = this.dialogsCache.get(dialogId)
    const entity = cached || dialogId
    const result = await this.client.sendMessage(entity, { message: text, replyTo: replyToMsgId || undefined })
    this.messagesCache.set(result.id, result)
    const me = await this.client.getMe()
    const voiceInfo = this.getVoiceInfo(result)
    const serviceText = await this.getServiceText(result)
    return {
      id: result.id,
      text: result.text || '',
      serviceText,
      date: result.date ? (typeof result.date === 'number' ? result.date : Math.floor(result.date.getTime() / 1000)) : 0,
      senderId: result.senderId ? result.senderId.toString() : null,
      senderName: this.getDisplayName(me),
      isOutgoing: true,
      isVoice: voiceInfo.isVoice,
      voiceDuration: voiceInfo.voiceDuration
    }
  }

  async markAsRead(dialogId, maxId = 0) {
    if (!this.client) throw new Error('Not connected')
    const cached = this.dialogsCache.get(dialogId)
    const entity = cached || dialogId
    try {
      await this.client.markAsRead(entity, undefined, { maxId })
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }

  async sendVoiceMessage(dialogId, audioBuffer, duration = 0) {
    if (!this.client) throw new Error('Not connected')
    const cached = this.dialogsCache.get(dialogId)
    const entity = cached || dialogId
    const buffer = Buffer.from(audioBuffer)
    const file = new CustomFile('voice.ogg', buffer.length, '', buffer)
    const result = await this.client.sendFile(entity, {
      file: file,
      voiceNote: true,
      attributes: [
        new Api.DocumentAttributeAudio({
          voice: true,
          duration: Math.max(0, Math.round(duration))
        })
      ]
    })
    this.messagesCache.set(result.id, result)
    const me = await this.client.getMe()
    const voiceInfo = this.getVoiceInfo(result)
    const serviceText = await this.getServiceText(result)
    return {
      id: result.id,
      text: result.text || '',
      serviceText,
      date: result.date ? (typeof result.date === 'number' ? result.date : Math.floor(result.date.getTime() / 1000)) : 0,
      senderId: result.senderId ? result.senderId.toString() : null,
      senderName: this.getDisplayName(me),
      isOutgoing: true,
      isVoice: voiceInfo.isVoice,
      voiceDuration: voiceInfo.voiceDuration
    }
  }

  async sendFiles(dialogId, filePaths, caption = '', replyToMsgId = null) {
    if (!this.client) throw new Error('Not connected')
    const cached = this.dialogsCache.get(dialogId)
    const entity = cached || dialogId
    const sentMessages = []
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i]
      const fileCaption = i === 0 ? caption : ''
      const replyTo = i === 0 && replyToMsgId ? replyToMsgId : undefined
      const result = await this.client.sendFile(entity, { file: filePath, forceDocument: true, caption: fileCaption, replyTo })
      const msg = Array.isArray(result) ? result[0] : result
      if (msg) {
        this.messagesCache.set(msg.id, msg)
        const voiceInfo = this.getVoiceInfo(msg)
        const serviceText = await this.getServiceText(msg)
        const fileInfo = this.getFileInfo(msg)
        sentMessages.push({
          id: msg.id,
          text: msg.text || '',
          serviceText,
          replyTo: null,
          hasDocument: !!fileInfo,
          fileName: fileInfo ? fileInfo.fileName : null,
          documentSize: fileInfo ? Number(fileInfo.documentSize) || 0 : 0,
          date: msg.date ? (typeof msg.date === 'number' ? msg.date : Math.floor(msg.date.getTime() / 1000)) : 0,
          senderId: msg.senderId ? msg.senderId.toString() : null,
          senderName: this.getDisplayName(msg.sender),
          isOutgoing: msg.out || false,
          isVoice: voiceInfo.isVoice,
          voiceDuration: voiceInfo.voiceDuration
        })
      }
    }
    return sentMessages
  }

  async downloadFile(messageId, defaultFileName) {
    if (!this.client) throw new Error('Not connected')
    const msg = this.messagesCache.get(Number(messageId))
    if (!msg) throw new Error('Message not found')
    const buffer = await this.client.downloadMedia(msg)
    if (!buffer) throw new Error('Failed to download file')
    const { filePath } = await dialog.showSaveDialog(this.window, {
      defaultPath: defaultFileName || 'download'
    })
    if (!filePath) return null
    fs.writeFileSync(filePath, buffer)
    return filePath
  }

  async openFileDialog() {
    if (!this.window || this.window.isDestroyed()) return []
    const { filePaths } = await dialog.showOpenDialog(this.window, {
      properties: ['openFile', 'multiSelections']
    })
    return filePaths || []
  }

  async downloadVoiceMessage(messageId) {
    if (!this.client) throw new Error('Not connected')
    const msg = this.messagesCache.get(Number(messageId))
    if (!msg) throw new Error('Message not found')
    const buffer = await this.client.downloadMedia(msg)
    if (!buffer) throw new Error('Failed to download voice message')
    return buffer
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect()
      this.client = null
    }
  }
}

export const telegram = new TelegramManager()
