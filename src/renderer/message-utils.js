export function formatReadableDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  const parts = []

  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(`${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`)
  }

  return parts.join(' ')
}

export function getMessageReadableText(msg = {}) {
  if (msg.text) return msg.text
  if (msg.serviceText) return msg.serviceText
  if (msg.isVoice) return `Voice message, ${formatReadableDuration(msg.voiceDuration)}`
  if (msg.hasDocument) return msg.fileName ? `File: ${msg.fileName}` : 'File attachment'
  return 'No readable text available for this message.'
}

export function shouldPreventMessageTextViewerKeydown(event = {}) {
  const { key = '', metaKey = false, ctrlKey = false } = event
  const navigationKeys = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'Tab',
    'Escape'
  ])

  if (navigationKeys.has(key)) return false
  if (metaKey || ctrlKey) {
    return !['a', 'A', 'c', 'C'].includes(key)
  }

  return key.length === 1 || key === 'Enter' || key === 'Backspace' || key === 'Delete'
}
