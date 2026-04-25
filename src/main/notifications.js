import { systemPreferences } from 'electron'

export function logNotificationSettings() {
  if (process.platform !== 'darwin') return

  try {
    const settings = systemPreferences.getNotificationSettings()
    console.log('[macOS] Notification settings:', settings)

    const status = settings.authorizationStatus
    if (status === 'denied') {
      console.warn('[macOS] Notifications are disabled for Electrogram. Enable them in System Preferences > Notifications.')
    } else if (status === 'notDetermined') {
      console.warn('[macOS] Notification permission has not been requested yet. It will be requested on the first incoming message.')
    } else if (status === 'authorized') {
      console.log('[macOS] Notifications are authorized.')
    }

    if (!settings.alertSetting || settings.alertSetting === 'disabled') {
      console.warn('[macOS] Notification alerts are disabled. Banners may not appear.')
    }
  } catch (err) {
    console.warn('[macOS] Could not read notification settings:', err.message)
  }
}
