import { contextBridge, ipcRenderer } from 'electron'

try {
  console.log('[Preload] Starting preload script')
  contextBridge.exposeInMainWorld('electronAPI', {
    tg: {
      getSavedCredentials: () => ipcRenderer.invoke('tg:getSavedCredentials'),
      connect: (apiId, apiHash) => ipcRenderer.invoke('tg:connect', apiId, apiHash),
      sendCode: (phoneNumber) => ipcRenderer.invoke('tg:sendCode', phoneNumber),
      signIn: (phoneCode) => ipcRenderer.invoke('tg:signIn', phoneCode),
      signInPassword: (password) => ipcRenderer.invoke('tg:signInPassword', password),
      getDialogs: (limit) => ipcRenderer.invoke('tg:getDialogs', limit),
      getMessages: (dialogId, limit) => ipcRenderer.invoke('tg:getMessages', dialogId, limit),
      sendMessage: (dialogId, text, replyToMsgId) => ipcRenderer.invoke('tg:sendMessage', dialogId, text, replyToMsgId),
      markAsRead: (dialogId, maxId) => ipcRenderer.invoke('tg:markAsRead', dialogId, maxId),
      downloadVoiceMessage: (messageId) => ipcRenderer.invoke('tg:downloadVoiceMessage', messageId),
      sendVoiceMessage: (dialogId, audioBuffer, duration) => ipcRenderer.invoke('tg:sendVoiceMessage', dialogId, audioBuffer, duration),
      sendFiles: (dialogId, filePaths, caption, replyToMsgId) => ipcRenderer.invoke('tg:sendFiles', dialogId, filePaths, caption, replyToMsgId),
      editMessage: (dialogId, messageId, newText) => ipcRenderer.invoke('tg:editMessage', dialogId, messageId, newText),
      clickInlineButton: (messageId, row, col) => ipcRenderer.invoke('tg:clickInlineButton', messageId, row, col),
      downloadFile: (messageId, defaultFileName) => ipcRenderer.invoke('tg:downloadFile', messageId, defaultFileName),
      openFileDialog: () => ipcRenderer.invoke('tg:openFileDialog'),
      disconnect: () => ipcRenderer.invoke('tg:disconnect'),
      showNotification: (title, body, chatId) => ipcRenderer.invoke('tg:showNotification', title, body, chatId),
      onUpdate: (callback) => {
        const wrapped = (_event, data) => callback(data)
        ipcRenderer.on('tg:update', wrapped)
        return () => ipcRenderer.removeListener('tg:update', wrapped)
      },
      onNotificationClicked: (callback) => {
        const wrapped = (_event, data) => callback(data)
        ipcRenderer.on('tg:notificationClicked', wrapped)
        return () => ipcRenderer.removeListener('tg:notificationClicked', wrapped)
      }
    }
  })
  console.log('[Preload] electronAPI exposed successfully')
} catch (err) {
  console.error('[Preload] Failed to expose electronAPI:', err)
}
