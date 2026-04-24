import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { GitBranch, Zap, Mail, Code2, CheckCircle } from 'lucide-react'

// Features ordered by defensibility: widget first (unique), then the rest
const FEATURES = [
  { icon: Code2,     title: 'Embeddable widget',  desc: "One script tag adds a \"What's new\" drawer to your product. Stays in sync with every publish." },
  { icon: GitBranch, title: 'GitHub-connected',   desc: 'Listens for merged PRs automatically. No manual input, no copy-paste.' },
  { icon: Zap,       title: 'AI-written drafts',  desc: 'GPT-4o turns technical PR descriptions into readable release notes in seconds.' },
  { icon: Mail,      title: 'Email subscribers',  desc: 'Users subscribe on your changelog page. Every publish triggers a broadcast automatically.' },
]

const PRICING = [
  {
    name: 'Free',
    price: '$0',
    features: ['1 repo', '3 publishes/mo', '100 subscribers', 'mergecast.co subdomain'],
    cta: 'Start free',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '$29',
    features: ['1 repo', 'Unlimited publishes', '1,000 subscribers', 'Custom domain'],
    cta: 'Get started',
    highlighted: true,
  },
  {
    name: 'Growth',
    price: '$59',
    features: ['3 repos', 'Unlimited publishes', '10,000 subscribers', 'Remove Mergecast badge'],
    cta: 'Get started',
    highlighted: false,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="font-semibold">Mergecast</span>
        <div className="flex items-center gap-4">
          <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero — widget-first */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Copy */}
          <div className="space-y-6">
            <Badge variant="secondary">Now in early access</Badge>
            <h1 className="text-4xl font-bold tracking-tight leading-tight">
              The &ldquo;What&rsquo;s new&rdquo; button<br />your users actually read.
            </h1>
            <p className="text-lg text-muted-foreground">
              One script tag adds a changelog widget to your product. Mergecast writes the updates
              from your GitHub PRs automatically, then emails your subscribers when you publish.
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Start for free
              </Link>
              <Link
                href="/mergecast"
                className="inline-flex items-center justify-center rounded-md border border-input px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                See a live example
              </Link>
            </div>
          </div>

          {/* Widget mockup */}
          <div className="relative flex items-end justify-end">
            {/* Fake browser chrome */}
            <div className="w-full rounded-xl border bg-muted/30 overflow-hidden shadow-lg">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b bg-muted/50">
                <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <div className="mx-3 h-5 flex-1 rounded bg-background/60 text-xs text-muted-foreground flex items-center px-2">
                  your-app.com
                </div>
              </div>
              <div className="relative h-48 bg-background p-4">
                {/* Fake app content */}
                <div className="space-y-2 opacity-30">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </div>

                {/* Widget drawer (open state) */}
                <div className="absolute bottom-2 right-2 w-52 rounded-lg border bg-background shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30">
                    <p className="text-xs font-semibold">What&rsquo;s new</p>
                  </div>
                  <div className="divide-y">
                    {[
                      { title: 'Dark mode is here', date: 'Apr 22' },
                      { title: 'Faster search', date: 'Apr 15' },
                      { title: 'API v2 launched', date: 'Apr 8' },
                    ].map(item => (
                      <div key={item.title} className="px-3 py-2">
                        <p className="text-xs font-medium">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.date}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating label */}
            <div className="absolute -bottom-3 right-4 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md">
              <Code2 className="h-3 w-3" />
              One &lt;script&gt; tag
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-lg border p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="font-medium">{title}</p>
              </div>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
        <div className="space-y-6">
          {[
            { step: '1', title: 'Paste one script tag',       desc: 'Add Mergecast to your product. The widget appears instantly — no config needed.' },
            { step: '2', title: 'Connect your repo',          desc: 'Install the GitHub App. Mergecast starts watching for merged PRs.' },
            { step: '3', title: 'Merge → Review → Publish',   desc: 'AI drafts the release note. You review, edit if needed, and publish. Widget updates, subscribers get emailed.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-sm font-bold">
                {step}
              </div>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRICING.map(({ name, price, features, cta, highlighted }) => (
            <div
              key={name}
              className={`rounded-lg border p-6 space-y-6 ${highlighted ? 'border-foreground' : ''}`}
            >
              <div>
                {highlighted && <Badge className="mb-2">Most popular</Badge>}
                <p className="text-lg font-semibold">{name}</p>
                <p className="text-3xl font-bold mt-1">
                  {price}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
              </div>
              <ul className="space-y-2">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors w-full ${
                  highlighted
                    ? 'bg-foreground text-background hover:opacity-90'
                    : 'border border-input hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>Mergecast</span>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
