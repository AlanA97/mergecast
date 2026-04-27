import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Mergecast",
  description: "How Mergecast collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            <span aria-hidden="true">← </span>Back to Mergecast
          </Link>
          <h1 className="mt-6 text-3xl font-bold">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: April 27, 2026</p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">

          {/* Introduction */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Introduction</h2>
            <p>
              Mergecast (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the Mergecast platform
              accessible at mergecast.co (the &ldquo;Service&rdquo;). This Privacy Policy explains how we collect,
              use, disclose, and safeguard your personal information when you use our Service.
            </p>
            <p>
              By using Mergecast, you agree to the collection and use of information in accordance with this
              policy. If you do not agree, please discontinue use of the Service.
            </p>
            <p>
              This policy is intended to comply with applicable data protection laws, including the General Data
              Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).
            </p>
          </section>

          {/* Data Controller */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Data Controller</h2>
            <p>
              The data controller responsible for your personal data is:
            </p>
            <div className="rounded-md border px-4 py-3 space-y-1">
              <p>[Company Name]</p>
              <p>[Address]</p>
              <p>Contact: <a href="mailto:contact@mergecast.co" className="underline hover:text-foreground">[contact@mergecast.co]</a></p>
            </div>
          </section>

          {/* Data We Collect */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Information We Collect</h2>
            <p>We collect the following categories of personal information:</p>

            <h3 className="font-semibold text-foreground mt-4">3.1 Account and Authentication Data</h3>
            <p>
              When you sign up or log in, we collect your email address, hashed password (if using
              email/password auth), and authentication tokens. If you use GitHub OAuth to sign in, we receive
              your GitHub user ID, public profile information (username, avatar), and the OAuth access token
              required to access repositories you authorize.
            </p>

            <h3 className="font-semibold text-foreground mt-4">3.2 GitHub Repository Data</h3>
            <p>
              When you connect a GitHub repository to Mergecast, we receive webhook events from GitHub
              including pull request metadata (title, description, author, merged date, labels, and linked
              commits). We do not store the full source code of your repositories — only the PR metadata
              needed to generate changelog entries.
            </p>

            <h3 className="font-semibold text-foreground mt-4">3.3 Payment and Billing Data</h3>
            <p>
              Subscription payments are processed by Stripe. We do not store full credit card numbers on our
              servers. We retain Stripe customer IDs, subscription plan details, and billing history
              (invoices, payment dates, amounts) as required for financial record-keeping.
            </p>

            <h3 className="font-semibold text-foreground mt-4">3.4 Usage and Log Data</h3>
            <p>
              We automatically collect information about how you use the Service, including pages visited,
              features used, timestamps, IP addresses, browser type, and device type. This data is used for
              service improvement, security monitoring, and diagnosing technical issues.
            </p>

            <h3 className="font-semibold text-foreground mt-4">3.5 Subscriber Email Addresses</h3>
            <p>
              If your end users subscribe to changelog notifications via your public changelog page, we
              collect their email addresses on your behalf. Subscribers go through a double opt-in process
              (confirmation email required before they receive notifications). You, as the workspace owner,
              are responsible for ensuring you have a lawful basis for collecting subscriber data.
            </p>

            <h3 className="font-semibold text-foreground mt-4">3.6 Workspace and Content Data</h3>
            <p>
              We store the changelog entries you create or publish, your workspace settings, connected
              repository configurations, and any customizations you make to your public changelog page.
            </p>
          </section>

          {/* Why We Collect It */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. How We Use Your Information</h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-foreground">Service delivery:</span> To operate the Mergecast platform, process GitHub webhooks, generate AI-assisted changelog drafts, and publish changelogs.</li>
              <li><span className="font-medium text-foreground">Billing and subscriptions:</span> To manage your subscription plan, process payments through Stripe, and issue invoices.</li>
              <li><span className="font-medium text-foreground">Email notifications:</span> To send transactional emails (account confirmation, password reset) and, if you are a subscriber, to deliver changelog notification emails on behalf of workspace owners.</li>
              <li><span className="font-medium text-foreground">Security and fraud prevention:</span> To detect and prevent unauthorized access, abuse, or fraudulent activity.</li>
              <li><span className="font-medium text-foreground">Service improvement:</span> To analyze usage patterns and improve the platform&rsquo;s features and reliability.</li>
              <li><span className="font-medium text-foreground">Legal compliance:</span> To comply with applicable laws, regulations, and legal processes.</li>
            </ul>
            <p>
              We rely on the following legal bases under GDPR: contract performance (to provide the Service),
              legitimate interests (security, fraud prevention, and service improvement), legal obligation
              (financial records), and consent (email marketing, where applicable).
            </p>
          </section>

          {/* Third-Party Processors */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Third-Party Service Processors</h2>
            <p>
              We share data with the following sub-processors who process personal data on our behalf. Each
              processor is bound by appropriate data processing agreements.
            </p>

            <div className="space-y-4 mt-2">
              <div>
                <h3 className="font-semibold text-foreground">Supabase</h3>
                <p>
                  Our primary database and authentication provider. Supabase stores user accounts, workspace
                  data, changelog entries, and subscriber email addresses. Data is encrypted at rest and in
                  transit. See <a href="https://supabase.com/privacy" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">supabase.com/privacy</a>.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground">OpenAI (GPT-4o)</h3>
                <p>
                  We send pull request metadata (title, description, labels) to OpenAI&rsquo;s API to generate
                  AI-assisted changelog draft suggestions. We do not send your email address, payment data,
                  or any other personally identifiable information to OpenAI. OpenAI may use submitted data
                  in accordance with their API usage policies. See <a href="https://openai.com/privacy" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">openai.com/privacy</a>.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground">Stripe</h3>
                <p>
                  Payment processing for subscription plans. Stripe handles all credit card data directly;
                  we only store your Stripe customer ID and subscription status. See <a href="https://stripe.com/privacy" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">stripe.com/privacy</a>.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground">Resend</h3>
                <p>
                  Transactional and notification email delivery. Resend processes email addresses when we
                  send confirmation emails, password resets, and changelog notification broadcasts. See <a href="https://resend.com/privacy" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">resend.com/privacy</a>.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground">GitHub</h3>
                <p>
                  When you connect a repository, GitHub acts as a data source for pull request events via
                  webhooks and OAuth. Your use of GitHub is subject to <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">GitHub&rsquo;s Privacy Statement</a>.
                </p>
              </div>
            </div>
          </section>

          {/* Data Retention */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Data Retention</h2>
            <p>We retain personal data for the following periods:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-foreground">Account data:</span> Retained for as long as your account is active. Upon account deletion, account data is deleted within 30 days, except where retention is required by law.</li>
              <li><span className="font-medium text-foreground">Changelog entries and workspace data:</span> Retained for the lifetime of your workspace. Deleted upon workspace deletion.</li>
              <li><span className="font-medium text-foreground">Payment and billing records:</span> Retained for 7 years after the last transaction to comply with tax and accounting regulations.</li>
              <li><span className="font-medium text-foreground">Log and usage data:</span> Retained for up to 90 days for security and diagnostic purposes.</li>
              <li><span className="font-medium text-foreground">Subscriber email addresses:</span> Retained until the subscriber unsubscribes or the workspace owner deletes them.</li>
            </ul>
          </section>

          {/* Cookies */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Cookies and Tracking</h2>
            <p>
              Mergecast uses cookies strictly necessary for the operation of the Service:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-foreground">Session cookies:</span> Used to maintain your authenticated session while you are logged in. These are deleted when you log out or close your browser.</li>
              <li><span className="font-medium text-foreground">Authentication cookies:</span> Set by Supabase to maintain secure login state across page loads.</li>
            </ul>
            <p>
              We do not currently use third-party analytics cookies, advertising cookies, or any cross-site
              tracking technologies. If this changes, this policy will be updated and users will be notified.
            </p>
          </section>

          {/* Your Rights */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Your Data Rights</h2>
            <p>
              Depending on your location, you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-foreground">Right of access:</span> Request a copy of the personal data we hold about you.</li>
              <li><span className="font-medium text-foreground">Right to rectification:</span> Request correction of inaccurate or incomplete personal data.</li>
              <li><span className="font-medium text-foreground">Right to erasure:</span> Request deletion of your personal data (&ldquo;right to be forgotten&rdquo;), subject to legal retention requirements.</li>
              <li><span className="font-medium text-foreground">Right to data portability:</span> Request your personal data in a structured, machine-readable format.</li>
              <li><span className="font-medium text-foreground">Right to object / opt-out:</span> Object to processing based on legitimate interests, or opt out of email communications at any time via the unsubscribe link in any email.</li>
              <li><span className="font-medium text-foreground">Right to restrict processing:</span> Request that we limit how we use your data in certain circumstances.</li>
              <li><span className="font-medium text-foreground">CCPA rights (California residents):</span> The right to know, delete, and opt out of the &ldquo;sale&rdquo; of personal information. We do not sell personal data.</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:contact@mergecast.co" className="underline hover:text-foreground">
                [contact@mergecast.co]
              </a>
              . We will respond to verified requests within 30 days.
            </p>
          </section>

          {/* Data Security */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal data
              against unauthorized access, alteration, disclosure, or destruction. These include:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Encryption of data at rest and in transit (TLS/HTTPS)</li>
              <li>Row-level security policies on our database</li>
              <li>Restricted access to production systems</li>
              <li>Regular security reviews</li>
            </ul>
            <p>
              No method of transmission over the internet or electronic storage is 100% secure. If you
              become aware of a security vulnerability in our Service, please contact us immediately at{" "}
              <a href="mailto:contact@mergecast.co" className="underline hover:text-foreground">
                [contact@mergecast.co]
              </a>.
            </p>
          </section>

          {/* International Transfers */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. International Data Transfers</h2>
            <p>
              Your data may be processed in countries outside your home jurisdiction, including the United
              States, where our third-party processors operate. Where data is transferred from the European
              Economic Area (EEA), we rely on appropriate safeguards such as Standard Contractual Clauses
              (SCCs) or adequacy decisions. For more information, contact us at{" "}
              <a href="mailto:contact@mergecast.co" className="underline hover:text-foreground">
                [contact@mergecast.co]
              </a>.
            </p>
          </section>

          {/* Children */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">11. Children&rsquo;s Privacy</h2>
            <p>
              Mergecast is not directed at individuals under the age of 16. We do not knowingly collect
              personal data from children. If you believe we have inadvertently collected such data, please
              contact us and we will delete it promptly.
            </p>
          </section>

          {/* Changes */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we make material changes, we will
              notify you by email (to the address associated with your account) or by posting a prominent
              notice on our website at least 30 days before the changes take effect. The &ldquo;Last updated&rdquo; date
              at the top of this page reflects the most recent revision.
            </p>
            <p>
              Continued use of the Service after the effective date of any changes constitutes your
              acceptance of the updated policy.
            </p>
          </section>

          {/* Contact */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">13. Contact Us</h2>
            <p>
              If you have questions, concerns, or requests regarding this Privacy Policy or our data
              practices, please contact us at:
            </p>
            <div className="rounded-md border px-4 py-3 space-y-1">
              <p>[Company Name]</p>
              <p>[Address]</p>
              <p>
                Email:{" "}
                <a href="mailto:contact@mergecast.co" className="underline hover:text-foreground">
                  [contact@mergecast.co]
                </a>
              </p>
            </div>
            <p>
              If you are located in the EEA and believe your data protection rights have been violated, you
              have the right to lodge a complaint with your local supervisory authority.
            </p>
          </section>

        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t text-sm text-muted-foreground flex gap-4">
          <Link href="/terms" className="hover:text-foreground">Terms &amp; Conditions</Link>
          <Link href="/" className="hover:text-foreground">Back to Mergecast</Link>
        </footer>
      </div>
    </main>
  );
}
