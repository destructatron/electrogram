import { describe, it, expect, vi } from 'vitest'

// Mock app.js BEFORE importing login-api.js
vi.mock('../../src/renderer/app.js', () => ({
  setScreen: vi.fn(),
  announce: vi.fn(),
  enableShortcuts: vi.fn(),
}))

// Also mock the preload electronAPI for login-api.js
const mockTg = {
  getSavedCredentials: vi.fn().mockResolvedValue({ apiId: '', apiHash: '' }),
  connect: vi.fn().mockRejectedValue(new Error('No client')),
}

global.window = {
  electronAPI: {
    tg: mockTg,
  },
}

const { LoginApiScreen } = await import('../../src/renderer/screens/login-api.js')

describe('LoginApiScreen', () => {
  let screen

  describe('structure', () => {
    it('creates a div with login-screen class', () => {
      screen = LoginApiScreen()
      expect(screen.className).toBe('login-screen')
    })

    it('has correct ARIA attributes', () => {
      screen = LoginApiScreen()
      expect(screen.getAttribute('role')).toBe('region')
      expect(screen.getAttribute('aria-label')).toBe('API Credentials')
    })

    it('contains API ID and API Hash inputs', () => {
      screen = LoginApiScreen()
      const apiId = screen.querySelector('#api-id')
      const apiHash = screen.querySelector('#api-hash')
      expect(apiId).not.toBeNull()
      expect(apiHash).not.toBeNull()
    })

    it('API ID input accepts numbers and has autofocus', () => {
      screen = LoginApiScreen()
      const apiId = screen.querySelector('#api-id')
      expect(apiId.type).toBe('number')
      expect(apiId.hasAttribute('autofocus')).toBe(true)
    })

    it('has a submit button', () => {
      screen = LoginApiScreen()
      const btn = screen.querySelector('#api-submit')
      expect(btn).not.toBeNull()
      expect(btn.type).toBe('submit')
    })

    it('has an error div with correct ARIA attributes', () => {
      screen = LoginApiScreen()
      const error = screen.querySelector('#api-error')
      expect(error).not.toBeNull()
      expect(error.getAttribute('role')).toBe('alert')
      expect(error.getAttribute('aria-live')).toBe('assertive')
    })

    it('has a form with correct id', () => {
      screen = LoginApiScreen()
      const form = screen.querySelector('#api-form')
      expect(form).not.toBeNull()
    })

    it('has a link to my.telegram.org', () => {
      screen = LoginApiScreen()
      const link = screen.querySelector('a[href="https://my.telegram.org/apps"]')
      expect(link).not.toBeNull()
    })
  })

  describe('credential validation', () => {
    it('getSavedCredentials returns empty strings when no credentials saved', async () => {
      const creds = await mockTg.getSavedCredentials()
      expect(creds.apiId).toBe('')
      expect(creds.apiHash).toBe('')
    })

    it('connect throws when client not initialized', async () => {
      await expect(mockTg.connect('12345', 'abc')).rejects.toThrow('No client')
    })
  })
})