import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms and conditions for using Mergecast.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            <span aria-hidden="true">← </span>Back to Mergecast
          </Link>
          <h1 className="mt-6 text-3xl font-bold">Terms &amp; Conditions</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: April 27, 2026</p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">

          {/* Acceptance */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and use of the Mergecast platform
              and services (collectively, the &ldquo;Service&rdquo;) operated by [Company Name] (&ldquo;Mergecast,&rdquo;
              &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
            </p>
            <p>
              By creating an account, accessing, or using the Service, you agree to be bound by these Terms.
              If you are using the Service on behalf of an organization, you represent that you have the
              authority to bind that organization to these Terms.
            </p>
            <p>
              If you do not agree to these Terms, do not access or use the Service.
            </p>
          </section>

          {/* Description of Service */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Description of Service</h2>
            <p>
              Mergecast is a B2B SaaS changelog platform that enables software teams to automatically
              generate, edit, and publish product changelogs. Key features include:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <span className="font-medium text-foreground">GitHub integration:</span> Connect your
                GitHub repositories and receive webhook notifications when pull requests are merged.
              </li>
              <li>
                <span className="font-medium text-foreground">AI-assisted drafting:</span> Mergecast uses
                OpenAI&rsquo;s GPT-4o model to generate suggested changelog entry drafts from pull request
                metadata. These are drafts only — you review, edit, and approve entries before publishing.
              </li>
              <li>
                <span className="font-medium text-foreground">Public changelog pages:</span> Publish your
                changelog to a public page hosted at mergecast.co/[your-slug].
              </li>
              <li>
                <span className="font-medium text-foreground">Email subscriber broadcasts:</span> Allow
                end users to subscribe to your changelog and receive email notifications when new entries
                are published.
              </li>
            </ul>
            <p>
              We reserve the right to modify, suspend, or discontinue any feature of the Service at any
              time with reasonable notice.
            </p>
          </section>

          {/* Account Registration */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Account Registration and Workspace Ownership</h2>
            <p>
              To use the Service, you must register for an account using a valid email address or your
              GitHub account. You agree to provide accurate, current, and complete registration information
              and to keep it updated.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for
              all activities that occur under your account. Notify us immediately at{" "}
              <a href="mailto:contact@mergecast.co" className="underline hover:text-foreground">
                [contact@mergecast.co]
              </a>{" "}
              if you suspect unauthorized access to your account.
            </p>
            <p>
              Each workspace has an owner — the user who created it or who was designated as owner. Workspace
              owners control access to the workspace, connected repositories, and subscriber data. If you
              create a workspace for an organization, you are responsible for ensuring that all workspace
              members comply with these Terms.
            </p>
            <p>
              You may not share, sell, or transfer your account to another party without our prior written
              consent.
            </p>
          </section>

          {/* Subscription Plans and Billing */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Subscription Plans and Billing</h2>

            <h3 className="font-semibold text-foreground mt-4">4.1 Plans</h3>
            <p>
              Mergecast offers the following subscription plans, billed monthly:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="font-medium text-foreground">Free:</span> Limited features at no cost.</li>
              <li><span className="font-medium text-foreground">Starter:</span> $19/month</li>
              <li><span className="font-medium text-foreground">Growth:</span> $49/month</li>
            </ul>
            <p>
              Plan features and quotas (e.g., number of published entries per month) are described on the
              pricing page. We reserve the right to change pricing with 30 days&rsquo; notice.
            </p>

            <h3 className="font-semibold text-foreground mt-4">4.2 Billing</h3>
            <p>
              Subscriptions are billed monthly in advance. Payments are processed by Stripe. By subscribing,
              you authorize us to charge your payment method on a recurring monthly basis until you cancel.
              All fees are in USD and exclusive of applicable taxes, which you are responsible for.
            </p>

            <h3 className="font-semibold text-foreground mt-4">4.3 No Refunds</h3>
            <p>
              All subscription fees are non-refundable. If you downgrade or cancel your subscription, your
              access continues until the end of your current billing period. We do not provide prorated
              refunds for unused time on a plan. In exceptional circumstances (e.g., extended service
              outages attributable to us), we may issue credits at our sole discretion.
            </p>

            <h3 className="font-semibold text-foreground mt-4">4.4 Free Plan and Trial</h3>
            <p>
              Free plan usage is subject to the quotas and limitations published on our pricing page. We
              reserve the right to modify or discontinue the free plan with 30 days&rsquo; notice.
            </p>
          </section>

          {/* Acceptable Use */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Acceptable Use Policy</h2>
            <p>
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You
              must not use the Service to:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>Violate any applicable law or regulation.</li>
              <li>Transmit, publish, or store content that is illegal, harmful, defamatory, obscene, or infringes third-party intellectual property rights.</li>
              <li>Send unsolicited commercial email (spam) or use the subscriber broadcast feature to send content unrelated to software changelogs without subscriber consent.</li>
              <li>Attempt to gain unauthorized access to any part of the Service, other user accounts, or our infrastructure.</li>
              <li>Interfere with or disrupt the Service, including by introducing malware, overloading systems, or circumventing rate limits or quota enforcement.</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service.</li>
              <li>Use the AI drafting features to generate content that is deliberately misleading, fraudulent, or designed to deceive end users.</li>
              <li>Resell, sublicense, or otherwise commercialize access to the Service without our prior written consent.</li>
            </ul>
            <p>
              We reserve the right to suspend or terminate accounts that violate this policy, with or
              without notice, depending on the severity of the violation.
            </p>
          </section>

          {/* Intellectual Property */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Intellectual Property</h2>

            <h3 className="font-semibold text-foreground mt-4">6.1 Mergecast Platform</h3>
            <p>
              The Mergecast platform, including its software, design, trademarks, and all proprietary
              technology, is owned by [Company Name] or its licensors. Nothing in these Terms grants you
              any right or license to use our intellectual property except as expressly provided herein.
            </p>

            <h3 className="font-semibold text-foreground mt-4">6.2 Your Content</h3>
            <p>
              You retain ownership of the changelog entries, descriptions, and other content you create
              using the Service (&ldquo;User Content&rdquo;). By using the Service, you grant Mergecast a limited,
              non-exclusive, royalty-free license to host, store, and display your User Content solely as
              necessary to provide the Service (e.g., serving your public changelog page).
            </p>

            <h3 className="font-semibold text-foreground mt-4">6.3 AI-Generated Drafts</h3>
            <p>
              Changelog drafts generated by the AI (GPT-4o) are provided as suggestions only. You are
              responsible for reviewing and approving all content before publishing. We make no warranty
              as to the accuracy, originality, or fitness of AI-generated content.
            </p>

            <h3 className="font-semibold text-foreground mt-4">6.4 Feedback</h3>
            <p>
              If you submit feedback, suggestions, or ideas about the Service, you grant us the right to
              use that feedback without restriction or compensation to you.
            </p>
          </section>

          {/* Data and Privacy */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Data and Privacy</h2>
            <p>
              Our collection and use of personal data is governed by our{" "}
              <Link href="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              , which is incorporated into these Terms by reference. By using the Service, you consent to
              our data practices as described in the Privacy Policy.
            </p>
            <p>
              As a workspace owner, you are the data controller for the email addresses of your changelog
              subscribers. You are responsible for ensuring you have a lawful basis for collecting and
              processing that data, and for complying with applicable data protection laws (including GDPR
              and CCPA) in your jurisdiction.
            </p>
          </section>

          {/* Third-Party Services */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Third-Party Services</h2>
            <p>
              The Service integrates with third-party services including GitHub, Stripe, Supabase, OpenAI,
              and Resend. Your use of those services is subject to their respective terms of service and
              privacy policies. We are not responsible for the practices or availability of third-party
              services.
            </p>
            <p>
              Connecting your GitHub account to Mergecast grants us access to the repositories and
              webhooks you authorize. You can revoke this access at any time through your GitHub account
              settings.
            </p>
          </section>

          {/* Disclaimers */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Disclaimers</h2>
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p>
              We do not warrant that the Service will be uninterrupted, error-free, or free of viruses or
              other harmful components. We do not warrant that AI-generated changelog drafts will be
              accurate, complete, or suitable for any particular purpose.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. Limitation of Liability</h2>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, [COMPANY NAME] AND ITS OFFICERS,
              DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA,
              GOODWILL, OR BUSINESS INTERRUPTION, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR
              INABILITY TO USE THE SERVICE.
            </p>
            <p>
              IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATED TO
              THESE TERMS OR THE SERVICE EXCEED THE GREATER OF (A) THE TOTAL FEES PAID BY YOU TO
              MERGECAST IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) $100 USD.
            </p>
            <p>
              SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES, SO THE
              ABOVE LIMITATIONS MAY NOT APPLY TO YOU.
            </p>
          </section>

          {/* Indemnification */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">11. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless [Company Name] and its officers, directors,
              employees, and agents from and against any claims, liabilities, damages, losses, and expenses
              (including reasonable legal fees) arising out of or in any way connected with: (a) your use
              of the Service; (b) your User Content; (c) your violation of these Terms; or (d) your
              violation of any third-party rights.
            </p>
          </section>

          {/* Termination */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">12. Termination</h2>

            <h3 className="font-semibold text-foreground mt-4">12.1 Termination by You</h3>
            <p>
              You may cancel your subscription and delete your account at any time from your account
              settings. Cancellation takes effect at the end of your current billing period. Deleting your
              account permanently removes your workspace, connected repositories, and published changelogs.
              This action is irreversible.
            </p>

            <h3 className="font-semibold text-foreground mt-4">12.2 Termination by Mergecast</h3>
            <p>
              We reserve the right to suspend or terminate your access to the Service immediately and
              without prior notice if:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>You materially breach these Terms and fail to remedy the breach within 7 days of notice.</li>
              <li>You engage in conduct that we reasonably believe poses a risk to the Service, other users, or third parties.</li>
              <li>Required by law or legal process.</li>
            </ul>
            <p>
              Upon termination for cause, no refunds will be issued for any unused subscription period.
            </p>

            <h3 className="font-semibold text-foreground mt-4">12.3 Effect of Termination</h3>
            <p>
              Upon termination, your right to use the Service ceases immediately. Provisions that by their
              nature should survive termination (including intellectual property, limitation of liability,
              indemnification, and dispute resolution) will survive.
            </p>
          </section>

          {/* Changes to Terms */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">13. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. When we make material changes, we will notify
              you by email at least 30 days before the new Terms take effect. The &ldquo;Effective date&rdquo; at the
              top of this page reflects the most recent revision.
            </p>
            <p>
              Your continued use of the Service after the effective date of updated Terms constitutes
              your acceptance of the changes. If you do not agree to the updated Terms, you must stop
              using the Service and cancel your subscription before the effective date.
            </p>
          </section>

          {/* Governing Law */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">14. Governing Law and Disputes</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of [Jurisdiction],
              without regard to its conflict of law provisions.
            </p>
            <p>
              Any dispute arising out of or in connection with these Terms or the Service shall be subject
              to the exclusive jurisdiction of the courts of [Jurisdiction]. You waive any objection to
              the exercise of jurisdiction over you by such courts.
            </p>
          </section>

          {/* General */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">15. General Provisions</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium text-foreground">Entire Agreement:</span> These Terms, together with the Privacy Policy, constitute the entire agreement between you and Mergecast regarding the Service and supersede all prior agreements.</li>
              <li><span className="font-medium text-foreground">Severability:</span> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.</li>
              <li><span className="font-medium text-foreground">Waiver:</span> Our failure to enforce any right or provision of these Terms does not constitute a waiver of that right or provision.</li>
              <li><span className="font-medium text-foreground">Assignment:</span> You may not assign these Terms or any rights hereunder without our prior written consent. We may assign these Terms in connection with a merger, acquisition, or sale of assets.</li>
              <li><span className="font-medium text-foreground">Notices:</span> Legal notices to Mergecast should be sent to [contact@mergecast.co]. We may send notices to the email address associated with your account.</li>
            </ul>
          </section>

          {/* Contact */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">16. Contact Us</h2>
            <p>
              If you have questions about these Terms, please contact us at:
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
          </section>

        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t text-sm text-muted-foreground flex gap-4">
          <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link href="/" className="hover:text-foreground">Back to Mergecast</Link>
        </footer>
      </div>
    </main>
  );
}
