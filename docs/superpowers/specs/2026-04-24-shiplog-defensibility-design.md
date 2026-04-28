# Mergecast v1.1 — Defensibility Sprint Design

**Date:** 2026-04-24
**Status:** ✅ Implemented — shipped to `main`
**Context:** Post-MVP hardening. Fixes spec gaps that create first impressions of incompleteness, and adds the two mechanisms that create genuine lock-in: a viral distribution loop ("Powered by Mergecast") and a retention signal (entry view analytics). Also adds PR noise filtering to reduce the most common churn driver, RSS for developer credibility, and a conversion banner to turn quota hits into upgrades rather than frustration.

---

## Problem Statement

The MVP is functionally complete but strategically weak:

1. **No viral loop** — every public changelog page generates traffic for Mergecast but zero word-of-mouth return; there is no attribution or backlink
2. **No retention signal** — users publish an entry and then have no visibility into whether anyone read it; without visible impact, the product feels hollow
3. **Signal-to-noise problem** — every `chore:`, `ci:`, `docs:` PR creates a draft that must be manually archived; this is the most predictable churn driver
4. **Missing developer credibility markers** — no RSS feed signals an amateur product to the developer audience
5. **Wrong positioning** — the landing page leads with AI, which every competitor also claims; the widget (the only feature without a direct free alternative) is buried
6. **Invisible quota wall** — users hit the free tier limit without warning and feel tricked rather than converted

---

## Scope

Six targeted changes. Nothing else.

| # | Feature                                           | Type                               |
|---|---------------------------------------------------|------------------------------------|
| 1 | "Powered by Mergecast" badge on public changelogs | Viral loop + spec gap              |
| 2 | Entry view analytics (view count per entry)       | Retention signal + data moat       |
| 3 | PR ignore rules (per-workspace noise filter)      | Churn prevention + product quality |
| 4 | RSS feed at `/[slug]/rss.xml`                     | Developer credibility + spec gap   |
| 5 | Widget-first landing page rewrite                 | Positioning fix                    |
| 6 | Approaching-limit conversion banner               | Conversion + spec gap              |

---

## 1. Data Layer

Single new migration. Two additions.

### 1.1 `changelog_entries.view_count`

```sql
ALTER TABLE changelog_entries ADD COLUMN view_count INT NOT NULL DEFAULT 0;
```

Incremented non-blocking from the public SSR page after fetching entries. No new API endpoint — the public page server component fires a Supabase RPC call and does not await it (does not block render). A Postgres function handles the bulk increment.

```sql
CREATE OR REPLACE FUNCTION increment_entry_views(entry_ids UUID[])
RETURNS void LANGUAGE sql AS $$
  UPDATE changelog_entries
  SET view_count = view_count + 1
  WHERE id = ANY(entry_ids);
$$;
```

The RPC is called with only the entry IDs visible on the current page render. Widget fetches (`GET /api/public/changelog/[slug]`) do **not** increment view counts — only direct public page visits do, to avoid inflation from widget polling.

### 1.2 `pr_ignore_rules` table

```sql
CREATE TABLE pr_ignore_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('title_prefix', 'title_contains', 'label')),
  pattern       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, rule_type, pattern)
);

-- RLS: workspace members only
ALTER TABLE pr_ignore_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members can manage ignore rules"
  ON pr_ignore_rules
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
```

**Default rules seeded on workspace creation** (added to the existing workspace POST handler):

| rule_type        | pattern      |
|------------------|--------------|
| `title_prefix`   | `chore:`     |
| `title_prefix`   | `docs:`      |
| `title_prefix`   | `ci:`        |
| `title_prefix`   | `test:`      |
| `title_contains` | `bump deps`  |
| `title_contains` | `dependabot` |

These cover the most common PR noise categories. Users can delete any of them.

---

## 2. Feature: "Powered by Mergecast" Badge

**Where:** `app/(public)/[slug]/page.tsx`

**Logic:** The public page already fetches workspace data. Extend the query to also fetch `changelog_settings.show_powered_by`. Render a small fixed-position badge at the bottom-right of the page if:
- `plan === 'free'` OR `plan === 'starter'`, AND
- `show_powered_by === true` (the default)

Growth+ users can disable it via the Settings page (the `show_powered_by` column already exists in the schema; the settings UI just needs to expose the toggle).

**Badge design:** Minimal — `"Powered by Mergecast"` in small muted text, linking to `https://mergecast.co`. No logo, no visual noise. Respects the workspace's accent color for the link.

**Settings toggle:** Add a "Powered by Mergecast badge" toggle to the Settings page under the "Changelog Page" section. Visible to all plans, but only takes effect for Growth+ (show a lock icon + "Growth plan" label for free/starter users clicking it).

---

## 3. Feature: Entry View Analytics

**Increment path:** `app/(public)/[slug]/page.tsx` (server component). After `fetchPublishedEntries`, extract the entry IDs and call:

```typescript
// Fire and forget — do not await
supabaseService.rpc('increment_entry_views', { entry_ids: entries.map(e => e.id) })
```

Use the service client (bypasses RLS) for this call only. No user-facing loading state affected.

**Dashboard display:**

- **Entry list** (`app/(app)/dashboard/page.tsx`): Add a `👁 N` view count to each entry card, displayed in muted text alongside the existing status badge and date. Zero views shown as `👁 0` (not hidden — the zero is informative during early days).
- **Entry detail** (`app/(app)/dashboard/entries/[id]/page.tsx`): Add to the right panel metadata row, e.g. `62 views · Published Apr 22`.

**No per-subscriber, no per-email analytics in this sprint.** The view count is the only signal. Email open rates are a future addition.

---

## 4. Feature: PR Ignore Rules

### 4.1 Webhook enforcement

In `app/api/webhooks/github/route.ts`, after `parsePullRequestEvent` returns a non-null result, load the workspace's ignore rules:

```typescript
const { data: ignoreRules } = await supabase
  .from('pr_ignore_rules')
  .select('rule_type, pattern')
  .eq('workspace_id', workspace.id)

const ignored = ignoreRules?.some(rule => {
  const title = parsed.prTitle.toLowerCase()
  const pattern = rule.pattern.toLowerCase()
  if (rule.rule_type === 'title_prefix') return title.startsWith(pattern)
  if (rule.rule_type === 'title_contains') return title.includes(pattern)
  if (rule.rule_type === 'label') return parsed.labels?.includes(rule.pattern)
  return false
})

if (ignored) return NextResponse.json({ received: true }) // silent skip
```

The parsed PR event needs `labels` added to `ParsedPullRequest` in `lib/github/webhook.ts` — currently it only parses title, body, number, etc.

### 4.2 API routes

```
GET  /api/workspaces/[id]/ignore-rules       → list rules for workspace
POST /api/workspaces/[id]/ignore-rules       → create rule { rule_type, pattern }
DELETE /api/workspaces/[id]/ignore-rules/[ruleId] → delete rule
```

Standard auth + membership check pattern. `POST` validates `rule_type` is one of the three allowed values. Duplicate (workspace_id, rule_type, pattern) returns 409.

### 4.3 Settings UI

New "Ignore rules" section at the bottom of `app/(app)/dashboard/settings/page.tsx`:

- List of existing rules as removable chips/rows (rule type label + pattern + ✕ button)
- "Add rule" inline form: dropdown (Title starts with / Title contains / Has label) + text input + Add button
- Empty state: "No rules yet — default rules are pre-configured when you connect your first repo"

---

## 5. Feature: RSS Feed

**Route:** `app/(public)/[slug]/rss.xml/route.ts`

Returns `Content-Type: application/rss+xml; charset=utf-8`. Fetches the same published entries as the public page (limit 50, newest first). Renders RSS 2.0 XML via a template string — no external dependency needed.

**Feed structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>{workspace.name} Changelog</title>
    <link>https://mergecast.co/{slug}</link>
    <description>Latest updates from {workspace.name}</description>
    <language>en</language>
    {entries.map(entry => `
    <item>
      <title>{escapeXml(entry.title)}</title>
      <link>https://mergecast.co/{slug}#{entry.id}</link>
      <guid isPermaLink="false">{entry.id}</guid>
      <pubDate>{new Date(entry.published_at).toUTCString()}</pubDate>
      <description><![CDATA[{entry.final_content}]]></description>
    </item>`)}
  </channel>
</rss>
```

**Public changelog page additions:**
- `<link rel="alternate" type="application/rss+xml" title="{workspace.name} Changelog" href="/{slug}/rss.xml">` in `<head>`
- Small RSS icon (SVG inline, no dependency) in the public page footer, linking to the feed

---

## 6. Feature: Widget-First Landing Page Rewrite

**Goal:** Lead with what is genuinely differentiated (the in-product widget), not with AI (which every competitor claims).

**New hero headline:** `"The 'What's new' button your users actually read."`
**New hero subheadline:** `"One script tag adds a changelog widget to your product. Mergecast writes the updates from your GitHub PRs automatically."`

**Hero visual:** A static CSS mockup of the widget — a floating `What's new` button in the bottom-right corner of a fake browser chrome, with the drawer open showing 2-3 fake entries. Implemented in pure Tailwind, no image dependency.

**Features grid reorder:**
1. Embeddable widget (now first — the differentiator)
2. GitHub-connected
3. AI-written drafts
4. Email subscribers

**How it works rewrite** (reflects the widget as the end-state, not email):
1. Connect your repo
2. Merge a PR → Mergecast drafts the release note
3. Publish → widget updates instantly, subscribers get emailed

**CTA copy:** Keep "Start for free" — no change needed.

**Everything else** on the landing page (pricing, footer, nav) stays the same.

---

## 7. Feature: Approaching-Limit Conversion Banner

**Where:** `app/(app)/dashboard/page.tsx`

**Logic:** The dashboard already fetches workspace data (via `/api/workspaces`). Extend to use `publish_count_this_month` and `plan`:

| Condition                           | Banner                                                                                |
|-------------------------------------|---------------------------------------------------------------------------------------|
| `plan === 'free'` and `count === 2` | Yellow: "1 publish left this month · [Upgrade to remove limits →]"                    |
| `plan === 'free'` and `count >= 3`  | Red: "Monthly limit reached · [Upgrade to publish →]" — links to `/dashboard/billing` |
| Any other condition                 | No banner                                                                             |

**Style:** A slim dismissible banner below the page header (not a modal, not blocking). To dismiss is session-only — it reappears on next load. Clicking "Upgrade" navigates to `/dashboard/billing`.

---

## Error Handling

| Scenario                                   | Handling                                                                                                            |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `increment_entry_views` RPC fails          | Silently ignored — analytics are best-effort, never block page render                                               |
| Ignore rules DB unreachable during webhook | Fail open — create the draft anyway (log warning). Better to create a noisy draft than silently drop a real update. |
| RSS feed: workspace not found              | Return 404 with plain text "Not found"                                                                              |
| RSS feed: no published entries             | Return valid RSS with empty `<channel>` (no `<item>` elements)                                                      |
| `POST /ignore-rules` with duplicate        | Return 409 `RULE_ALREADY_EXISTS`                                                                                    |

---

## Testing

New tests to add alongside implementation:

| Test file                        | What it covers                                                                              |
|----------------------------------|---------------------------------------------------------------------------------------------|
| `tests/lib/ignore-rules.test.ts` | `title_prefix`, `title_contains`, `label` matching; case-insensitivity; no rules = no match |
| `tests/api/ignore-rules.test.ts` | POST creates rule; DELETE removes it; auth guard; duplicate → 409                           |
| `tests/api/rss.test.ts`          | Valid RSS structure; escapes special XML chars in title/content; empty feed is valid        |

Existing `tests/lib/github-webhook.test.ts` — add cases for "PR ignored by rule" and "labels parsed from payload".

---

## What This Does Not Change

- Billing/Stripe logic — untouched
- Email send logic — untouched
- Widget bundle — untouched (the landing page mockup is CSS-only)
- Database migrations for existing tables except the one `ALTER TABLE` for `view_count`
- Auth flow — untouched
