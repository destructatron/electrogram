import { setScreen, announce } from '../app.js'
import { MainAppScreen, cleanupMainApp } from './main-app.js'

export function LoginCodeScreen(phoneNumber) {
  const div = document.createElement('div')
  div.className = 'login-screen'
  div.setAttribute('role', 'region')
  div.setAttribute('aria-label', 'Verification Code')
  div.tabIndex = -1

  div.innerHTML = `
    <h1>Enter Code</h1>
    <p class="hint-text">Enter the verification code sent to ${phoneNumber}.</p>
    <form id="code-form">
      <label for="code">Verification Code</label>
      <input type="text" id="code" name="code" required autofocus aria-required="true" autocomplete="one-time-code" inputmode="numeric" maxlength="6" />
      <div id="code-error" class="error-text" role="alert" aria-live="assertive"></div>
      <button type="submit" id="code-submit">Sign In</button>
    </form>
    <form id="password-form" style="display:none; margin-top:1rem;">
      <label for="password">2FA Password</label>
      <input type="password" id="password" name="password" required aria-required="true" autocomplete="current-password" />
      <div id="password-error" class="error-text" role="alert" aria-live="assertive"></div>
      <button type="submit" id="password-submit">Submit Password</button>
    </form>
  `

  const codeForm = div.querySelector('#code-form')
  const passwordForm = div.querySelector('#password-form')
  const codeError = div.querySelector('#code-error')
  const passwordError = div.querySelector('#password-error')
  const codeSubmit = div.querySelector('#code-submit')
  const passwordSubmit = div.querySelector('#password-submit')

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    codeError.textContent = ''
    codeSubmit.disabled = true
    codeSubmit.textContent = 'Signing in...'

    const code = codeForm.code.value.trim()

    try {
      const result = await window.electronAPI.tg.signIn(code)
      if (result.needsPassword) {
        announce('Two-factor authentication required.')
        codeForm.style.display = 'none'
        passwordForm.style.display = 'block'
        passwordForm.querySelector('#password').focus()
        return
      }
      if (result.authorized) {
        announce('Signed in successfully.')
        setScreen(MainAppScreen(), cleanupMainApp)
        return
      }
    } catch (err) {
      const msg = err?.message || 'Invalid code. Please try again.'
      codeError.textContent = msg
      announce(msg)
      codeSubmit.disabled = false
      codeSubmit.textContent = 'Sign In'
      codeForm.querySelector('#code').focus()
    }
  })

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    passwordError.textContent = ''
    passwordSubmit.disabled = true
    passwordSubmit.textContent = 'Checking...'

    const password = passwordForm.password.value

    try {
      const result = await window.electronAPI.tg.signInPassword(password)
      if (result.authorized) {
        announce('Signed in successfully.')
        setScreen(MainAppScreen(), cleanupMainApp)
      }
    } catch (err) {
      const msg = err?.message || 'Incorrect password. Please try again.'
      passwordError.textContent = msg
      announce(msg)
      passwordSubmit.disabled = false
      passwordSubmit.textContent = 'Submit Password'
      passwordForm.querySelector('#password').focus()
    }
  })

  return div
}
