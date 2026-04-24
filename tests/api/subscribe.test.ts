import { describe, it, expect } from 'vitest'

describe('subscribe email validation', () => {
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  it('accepts valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('rejects invalid email formats', () => {
    ;['notanemail', 'missing@', '@nodomain', ''].forEach(email => {
      expect(isValidEmail(email)).toBe(false)
    })
  })
})
