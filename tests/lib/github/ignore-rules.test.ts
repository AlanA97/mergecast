import { describe, it, expect } from 'vitest'
import { shouldIgnorePR } from '@/lib/github/ignore-rules'

describe('shouldIgnorePR', () => {
  it('returns false when there are no rules', () => {
    expect(shouldIgnorePR('Add dark mode', [], [])).toBe(false)
  })

  it('matches title_prefix (case-insensitive)', () => {
    const rules = [{ rule_type: 'title_prefix', pattern: 'chore:' }]
    expect(shouldIgnorePR('chore: bump deps', [], rules)).toBe(true)
    expect(shouldIgnorePR('Chore: bump deps', [], rules)).toBe(true)
    expect(shouldIgnorePR('Add feature', [], rules)).toBe(false)
  })

  it('matches title_contains (case-insensitive)', () => {
    const rules = [{ rule_type: 'title_contains', pattern: 'dependabot' }]
    expect(shouldIgnorePR('Dependabot updates lodash', [], rules)).toBe(true)
    expect(shouldIgnorePR('update dependencies', [], rules)).toBe(false)
  })

  it('matches label (exact, case-sensitive)', () => {
    const rules = [{ rule_type: 'label', pattern: 'no-changelog' }]
    expect(shouldIgnorePR('Fix bug', ['no-changelog', 'bug'], rules)).toBe(true)
    expect(shouldIgnorePR('Fix bug', ['bug'], rules)).toBe(false)
  })

  it('returns false for unknown rule_type (never matches)', () => {
    const rules = [{ rule_type: 'unknown_type', pattern: 'anything' }]
    expect(shouldIgnorePR('anything', [], rules)).toBe(false)
  })

  it('returns true if any rule matches (OR logic)', () => {
    const rules = [
      { rule_type: 'title_prefix', pattern: 'ci:' },
      { rule_type: 'title_prefix', pattern: 'docs:' },
    ]
    expect(shouldIgnorePR('docs: update readme', [], rules)).toBe(true)
    expect(shouldIgnorePR('feat: new feature', [], rules)).toBe(false)
  })
})
