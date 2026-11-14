import React from 'react';
import { ArrowLeft, ScrollText, Mail } from 'lucide-react';

interface TermsOfServiceProps {
  onBackToHome: () => void;
}

const sections = [
  { id: 'acceptance', label: '1. Acceptance of Terms' },
  { id: 'eligibility', label: '2. Accounts & Eligibility' },
  { id: 'github', label: '3. GitHub Access' },
  { id: 'billing', label: '4. Plans, Quotas & Billing' },
  { id: 'acceptable-use', label: '5. Acceptable Use' },
  { id: 'ai-disclaimer', label: '6. AI Output Disclaimer' },
  { id: 'ip', label: '7. Intellectual Property' },
  { id: 'third-party', label: '8. Third-Party Services' },
  { id: 'termination', label: '9. Suspension & Termination' },
  { id: 'disclaimers', label: '10. Disclaimers' },
  { id: 'liability', label: '11. Limitation of Liability' },
  { id: 'indemnity', label: '12. Indemnification' },
  { id: 'governing-law', label: '13. Governing Law' },
  { id: 'changes', label: '14. Changes to These Terms' },
  { id: 'contact', label: '15. Contact Us' },
];

const SUPPORT_MAILTO = 'mailto:support.contextpilot@gmail.com?subject=Support%20Request%20-%20Context%20Pilot';

export const TermsOfService: React.FC<TermsOfServiceProps> = ({ onBackToHome }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-indigo-950 text-slate-300 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onBackToHome();
            }}
            className="flex items-center gap-3 group min-w-0"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-xs font-black shadow-md shadow-indigo-500/20 shrink-0">
              CP
            </div>
            <div className="min-w-0">
              <span className="font-bold text-sm sm:text-base tracking-tight text-white">Context Pilot</span>
              <span className="hidden sm:inline-block ml-2 text-[10px] text-indigo-400 font-mono">LEGAL</span>
            </div>
          </a>
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900/60 text-xs font-semibold text-slate-200 hover:text-white hover:border-slate-600 hover:bg-slate-900 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">Back to Home</span>
            <span className="xs:hidden sm:hidden">Home</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Page heading */}
        <div className="space-y-4 mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold">
            <ScrollText className="w-3.5 h-3.5" />
            <span>Terms</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Terms of Service</h1>
          <p className="text-xs text-slate-500">Last updated: November 14, 2026 &middot; Hausa Cybertech</p>
        </div>

        {/* Table of contents */}
        <nav aria-label="Terms of Service sections" className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-3">Contents</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-slate-400 hover:text-white transition-colors">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="space-y-8 text-[13px] leading-relaxed text-slate-300">
          <section id="acceptance" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">1. Acceptance of Terms</h2>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Context Pilot, operated by Hausa
              Cybertech (&ldquo;Hausa Cybertech&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;). By creating an account,
              signing in, or using the Service you agree to be bound by these Terms and our Privacy Policy. If you do not agree, do
              not use the Service.
            </p>
          </section>

          <section id="eligibility" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">2. Accounts &amp; Eligibility</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You must be at least 13 years old (or the minimum age of digital consent in your jurisdiction) and legally able to enter a contract.</li>
              <li>Accounts are created via Supabase Auth using your email address and password or via GitHub OAuth. You are responsible for keeping your credentials confidential and for all activity under your account.</li>
              <li>You agree to provide accurate registration information and to update it promptly if it changes.</li>
              <li>One person may not maintain multiple accounts to evade quotas or restrictions. We may suspend duplicate or fraudulent accounts.</li>
            </ul>
          </section>

          <section id="github" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">3. GitHub Access</h2>
            <p>
              Optional GitHub sign-in and repository verification are provided through GitHub OAuth. You authorize Context Pilot to
              read repository metadata and file listings for the repositories you select, solely to verify predicted file paths
              against your branches. You remain responsible for ensuring you have the right to grant us access to each connected
              repository. You may revoke access at any time from your GitHub settings; doing so may disable verification features.
            </p>
          </section>

          <section id="billing" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">4. Plans, Quotas &amp; Billing</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>The Service offers Free, Pro, and Enterprise tiers. Each tier includes monthly analysis quotas that reset each calendar month.</li>
              <li>Paid subscriptions are processed by Paystack, our payment processor. By subscribing you agree to Paystack&apos;s terms and privacy policy in addition to these Terms.</li>
              <li>Fees are displayed at checkout and are charged in the currency shown. Subscriptions renew automatically each billing cycle until cancelled.</li>
              <li>Except where required by law, fees already paid are non-refundable and non-prorated, including mid-cycle plan changes and unused quota.</li>
              <li>We may adjust plan limits, pricing, or features with reasonable notice. Material adverse changes to paid plans will be notified at least 14 days in advance.</li>
            </ul>
          </section>

          <section id="acceptable-use" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Submit unlawful, infringing, defamatory, or privacy-violating content for analysis.</li>
              <li>Attempt to reverse-engineer, decompile, or extract the models, prompts, or proprietary logic underlying the Service.</li>
              <li>Automate, script, or bulk-abuse the API or analysis endpoints in ways that exceed your plan quota or degrade the Service for others.</li>
              <li>Probe, scan, or test our infrastructure for vulnerabilities without written authorization.</li>
              <li>Resell, sublicense, or white-label the Service without written permission from Hausa Cybertech.</li>
              <li>Use the Service to violate any applicable law or the rights of any third party.</li>
            </ul>
          </section>

          <section id="ai-disclaimer" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">6. AI Output Disclaimer</h2>
            <p>
              Context Pilot generates probabilistic predictions about which files a Jira ticket may affect. Predictions — including
              confidence scores, file mappings, dependency hints, and test-file suggestions — are informational aids only and may be
              incomplete or incorrect. You are solely responsible for reviewing, validating, and testing all changes before merging
              or deploying them. The Service is not a substitute for professional engineering review.
            </p>
          </section>

          <section id="ip" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">7. Intellectual Property</h2>
            <p>
              You retain all rights, title, and interest in your code, repositories, and ticket content. As between you and us, you
              own your data. Hausa Cybertech retains all rights in the Service, including its software, design, branding, models and
              prompts. If you submit feedback or suggestions, you grant us a perpetual, worldwide, royalty-free license to use them
              to improve the Service, without obligation or compensation.
            </p>
          </section>

          <section id="third-party" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">8. Third-Party Services</h2>
            <p>
              The Service integrates third parties — including Supabase (authentication and database), GitHub (repository access),
              Google Gemini (AI processing), Paystack (payments), Resend (email delivery), and Vercel (hosting). Your use of their
              services is governed by their own terms; we are not responsible for their acts, omissions, or availability.
            </p>
          </section>

          <section id="termination" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">9. Suspension &amp; Termination</h2>
            <p>
              We may suspend or terminate your access with or without notice if you breach these Terms, create risk or possible
              legal exposure for us, or misuse the Service. You may stop using the Service and delete your account at any time from
              Account Settings. Sections that by their nature should survive termination (including Disclaimers, Limitation of
              Liability, Indemnification, and Governing Law) will survive.
            </p>
          </section>

          <section id="disclaimers" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">10. Disclaimers</h2>
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, WHETHER
              EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR
              ERROR-FREE, OR THAT PREDICTIONS WILL BE ACCURATE OR SUITABLE FOR YOUR CODEBASE.
            </p>
          </section>

          <section id="liability" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, HAUSA CYBERTECH SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, REVENUE, GOODWILL, OR PROFITS, ARISING FROM OR RELATED TO
              YOUR USE OF THE SERVICE. OUR TOTAL AGGREGATE LIABILITY FOR ANY CLAIM SHALL NOT EXCEED THE FEES YOU PAID US IN THE
              THREE (3) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR FIFTY US DOLLARS (US $50), WHICHEVER IS GREATER.
            </p>
          </section>

          <section id="indemnity" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">12. Indemnification</h2>
            <p>
              You agree to indemnify and hold Hausa Cybertech harmless from and against any claims, damages, losses, and expenses
              (including reasonable legal fees) arising from your use of the Service, your content, your repositories, your
              connection of third-party accounts, or your breach of these Terms or applicable law.
            </p>
          </section>

          <section id="governing-law" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">13. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict-of-law principles.
              You agree that the courts of Kano State, Nigeria shall have exclusive jurisdiction over disputes arising from these
              Terms, provided we may seek injunctive relief in any competent jurisdiction.
            </p>
          </section>

          <section id="changes" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">14. Changes to These Terms</h2>
            <p>
              We may modify these Terms from time to time. Material changes will be announced in-app or by email at least 14 days
              before they take effect. Continued use of the Service after the effective date constitutes acceptance of the revised
              Terms. If you do not agree, you must stop using the Service and may delete your account.
            </p>
          </section>

          <section id="contact" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">15. Contact Us</h2>
            <p>
              Hausa Cybertech &middot; Context Pilot Support
              <br />
              <a href={SUPPORT_MAILTO} className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                <Mail className="w-4 h-4" />
                support.contextpilot@gmail.com
              </a>
            </p>
          </section>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-6 text-[11px] text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <span>© {new Date().getFullYear()} Hausa Cybertech. All rights reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="text-indigo-400 hover:text-indigo-300 transition-colors">Terms of Service</a>
            <a href={SUPPORT_MAILTO} className="hover:text-white transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TermsOfService;
