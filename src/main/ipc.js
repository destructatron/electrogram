import { ipcMain, BrowserWindow, Notification } from 'electron'
import { telegram } from './telegram.js'

export function registerIpc() {
  ipcMain.handle('tg:getSavedCredentials', async () => {
    return telegram.getSavedCredentials()
  })

  ipcMain.handle('tg:connect', async (_event, apiId, apiHash) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) telegram.setWindow(win)
    return telegram.connect(apiId, apiHash)
  })

  ipcMain.handle('tg:sendCode', async (_event, phoneNumber) => {
    return telegram.sendCode(phoneNumber)
  })

  ipcMain.handle('tg:signIn', async (_event, phoneCode) => {
    return telegram.signIn(phoneCode)
  })

  ipcMain.handle('tg:signInPassword', async (_event, password) => {
    return telegram.signInPassword(password)
  })

  ipcMain.handle('tg:getDialogs', async (_event, limit) => {
    return telegram.getDialogs(limit)
  })

  ipcMain.handle('tg:getMessages', async (_event, dialogId, limit) => {
    return telegram.getMessages(dialogId, limit)
  })

  ipcMain.handle('tg:sendMessage', async (_event, dialogId, text, replyToMsgId) => {
    return telegram.sendMessage(dialogId, text, replyToMsgId)
  })

  ipcMain.handle('tg:markAsRead', async (_event, dialogId, maxId) => {
    return telegram.markAsRead(dialogId, maxId)
  })

  ipcMain.handle('tg:downloadVoiceMessage', async (_event, messageId) => {
    return telegram.downloadVoiceMessage(messageId)
  })

  ipcMain.handle('tg:sendVoiceMessage', async (_event, dialogId, audioBuffer, duration) => {
    return telegram.sendVoiceMessage(dialogId, audioBuffer, duration)
  })

  ipcMain.handle('tg:sendFiles', async (_event, dialogId, filePaths, caption, replyToMsgId) => {
    return telegram.sendFiles(dialogId, filePaths, caption, replyToMsgId)
  })

  ipcMain.handle('tg:editMessage', async (_event, dialogId, messageId, newText) => {
    return telegram.editMessage(dialogId, messageId, newText)
  })

  ipcMain.handle('tg:clickInlineButton', async (_event, messageId, row, col) => {
    return telegram.clickInlineButton(messageId, row, col)
  })

  ipcMain.handle('tg:showNotification', async (_event, title, body, chatId) => {
    if (!Notification.isSupported()) return
    const notification = new Notification({
      title: title || 'Electrogram',
      body: body || 'New message',
      silent: true
    })
    notification.once('click', () => {
      if (telegram.window && !telegram.window.isDestroyed()) {
        if (telegram.window.isMinimized()) telegram.window.restore()
        telegram.window.focus()
        telegram.window.webContents.send('tg:notificationClicked', chatId)
      }
    })
    notification.show()
  })

  ipcMain.handle('tg:downloadFile', async (_event, messageId, defaultFileName) => {
    return telegram.downloadFile(messageId, defaultFileName)
  })

  ipcMain.handle('tg:openFileDialog', async () => {
    return telegram.openFileDialog()
  })

  ipcMain.handle('tg:disconnect', async () => {
    return telegram.disconnect()
  })
}
