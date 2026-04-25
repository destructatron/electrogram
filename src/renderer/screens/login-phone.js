import { setScreen, announce } from '../app.js'
import { LoginCodeScreen } from './login-code.js'

export function LoginPhoneScreen() {
  const div = document.createElement('div')
  div.className = 'login-screen'
  div.setAttribute('role', 'region')
  div.setAttribute('aria-label', 'Phone Number')
  div.tabIndex = -1

  div.innerHTML = `
    <h1>Sign In</h1>
    <p class="hint-text">Enter your phone number with country code, e.g. +14155552671.</p>
    <form id="phone-form">
      <label for="phone">Phone Number</label>
      <input type="tel" id="phone" name="phone" required autofocus aria-required="true" autocomplete="tel" inputmode="tel" />
      <div id="phone-error" class="error-text" role="alert" aria-live="assertive"></div>
      <button type="submit" id="phone-submit">Send Code</button>
    </form>
  `

  const form = div.querySelector('#phone-form')
  const errorDiv = div.querySelector('#phone-error')
  const submitBtn = div.querySelector('#phone-submit')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorDiv.textContent = ''
    submitBtn.disabled = true
    submitBtn.textContent = 'Sending...'

    const phone = form.phone.value.trim()

    try {
      const result = await window.electronAPI.tg.sendCode(phone)
      announce(result.isCodeViaApp ? 'Code sent via Telegram app.' : 'Code sent via SMS.')
      setScreen(LoginCodeScreen(phone))
    } catch (err) {
      const msg = err?.message || 'Failed to send code. Please try again.'
      errorDiv.textContent = msg
      announce(msg)
      submitBtn.disabled = false
      submitBtn.textContent = 'Send Code'
      form.querySelector('#phone').focus()
    }
  })

  return div
}
