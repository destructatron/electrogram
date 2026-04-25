import { setScreen, announce } from '../app.js'
import { LoginPhoneScreen } from './login-phone.js'

export function LoginApiScreen() {
  const div = document.createElement('div')
  div.className = 'login-screen'
  div.setAttribute('role', 'region')
  div.setAttribute('aria-label', 'API Credentials')
  div.tabIndex = -1

  div.innerHTML = `
    <h1>Welcome to Electrogram</h1>
    <p class="hint-text">Enter your Telegram API credentials. You can get these from <a href="https://my.telegram.org/apps" target="_blank" rel="noopener">my.telegram.org/apps</a>.</p>
    <form id="api-form">
      <label for="api-id">API ID</label>
      <input type="number" id="api-id" name="apiId" required autofocus aria-required="true" autocomplete="off" />
      <label for="api-hash">API Hash</label>
      <input type="text" id="api-hash" name="apiHash" required aria-required="true" autocomplete="off" />
      <div id="api-error" class="error-text" role="alert" aria-live="assertive"></div>
      <button type="submit" id="api-submit">Connect</button>
    </form>
  `

  const form = div.querySelector('#api-form')
  const errorDiv = div.querySelector('#api-error')
  const submitBtn = div.querySelector('#api-submit')

  // Attempt auto-connect with saved credentials
  async function tryAutoConnect() {
    const creds = await window.electronAPI.tg.getSavedCredentials()
    if (!creds.apiId || !creds.apiHash) return false

    form.apiId.value = creds.apiId
    form.apiHash.value = creds.apiHash
    submitBtn.disabled = true
    submitBtn.textContent = 'Connecting with saved credentials...'
    announce('Connecting with saved credentials...')

    try {
      const result = await window.electronAPI.tg.connect(creds.apiId, creds.apiHash)
      if (result.authorized) {
        announce('Connected and signed in.')
        const { MainAppScreen, cleanupMainApp } = await import('./main-app.js')
        setScreen(MainAppScreen(), cleanupMainApp)
        return true
      } else {
        announce('Connected. Please sign in.')
        setScreen(LoginPhoneScreen())
        return true
      }
    } catch (err) {
      const msg = err?.message || 'Saved credentials failed. Please re-enter them.'
      errorDiv.textContent = msg
      announce(msg)
      submitBtn.disabled = false
      submitBtn.textContent = 'Connect'
      form.querySelector('#api-id').focus()
      return false
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorDiv.textContent = ''
    submitBtn.disabled = true
    submitBtn.textContent = 'Connecting...'

    const apiId = form.apiId.value.trim()
    const apiHash = form.apiHash.value.trim()

    try {
      const result = await window.electronAPI.tg.connect(apiId, apiHash)
      if (result.authorized) {
        announce('Connected and signed in.')
        const { MainAppScreen, cleanupMainApp } = await import('./main-app.js')
        setScreen(MainAppScreen(), cleanupMainApp)
      } else {
        announce('Connected. Please sign in.')
        setScreen(LoginPhoneScreen())
      }
    } catch (err) {
      const msg = err?.message || 'Failed to connect. Please check your credentials.'
      errorDiv.textContent = msg
      announce(msg)
      submitBtn.disabled = false
      submitBtn.textContent = 'Connect'
      form.querySelector('#api-id').focus()
    }
  })

  // Kick off auto-connect attempt
  tryAutoConnect()

  return div
}
