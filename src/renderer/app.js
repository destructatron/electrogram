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

document.addEventListener('keydown', (e) => {
  if (!shortcutsEnabled) return
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
