export interface IgnoreRule {
  rule_type: string
  pattern: string
}

/**
 * Returns true if the PR should be silently ignored (no draft created).
 * Case-insensitive for title rules; exact match for label rules.
 */
export function shouldIgnorePR(
  prTitle: string,
  labels: string[],
  rules: IgnoreRule[]
): boolean {
  const title = prTitle.toLowerCase()
  return rules.some(rule => {
    const pattern = rule.pattern.toLowerCase()
    switch (rule.rule_type) {
      case 'title_prefix':
        return title.startsWith(pattern)
      case 'title_contains':
        return title.includes(pattern)
      case 'label':
        // Labels are case-sensitive in GitHub
        return labels.includes(rule.pattern)
      default:
        return false
    }
  })
}
