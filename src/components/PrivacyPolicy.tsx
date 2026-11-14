import React from 'react';
import { ArrowLeft, ShieldCheck, Mail } from 'lucide-react';

interface PrivacyPolicyProps {
  onBackToHome: () => void;
}

const sections = [
  { id: 'overview', label: '1. Overview' },
  { id: 'collect', label: '2. Information We Collect' },
  { id: 'use', label: '3. How We Use Your Information' },
  { id: 'sharing', label: '4. How We Share Information' },
  { id: 'cookies', label: '5. Cookies & Local Storage' },
  { id: 'retention', label: '6. Data Retention' },
  { id: 'security', label: '7. Security' },
  { id: 'rights', label: '8. Your Rights & Choices' },
  { id: 'children', label: '9. Children\u2019s Privacy' },
  { id: 'international', label: '10. International Transfers' },
  { id: 'changes', label: '11. Changes to This Policy' },
  { id: 'contact', label: '12. Contact Us' },
];

const SUPPORT_MAILTO = 'mailto:support.contextpilot@gmail.com?subject=Support%20Request%20-%20Context%20Pilot';

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBackToHome }) => {
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
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Privacy</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Privacy Policy</h1>
          <p className="text-xs text-slate-500">Last updated: November 14, 2026 &middot; Hausa Cybertech</p>
        </div>

        {/* Table of contents */}
        <nav aria-label="Privacy Policy sections" className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
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
          <section id="overview" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">1. Overview</h2>
            <p>
              This Privacy Policy explains how Hausa Cybertech (&ldquo;Hausa Cybertech&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or
              &ldquo;our&rdquo;) collects, uses, and protects your information when you use Context Pilot — our AI-assisted
              application that predicts codebase impact from Jira tickets (the &ldquo;Service&rdquo;). By creating an account or
              using the Service you agree to this Policy. If you do not agree, please do not use the Service.
            </p>
          </section>

          <section id="collect" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-slate-100">Account &amp; authentication data.</strong> Context Pilot uses Supabase Auth for
                registration and sign-in. We receive and store your email address, display name, and profile photo, and Supabase
                stores your credentials (passwords are hashed and never visible to us). When you sign in with the &ldquo;Continue
                with GitHub&rdquo; button, GitHub OAuth shares your GitHub username, avatar, and a scoped access token used to verify
                predicted files against your repositories. We never see your GitHub password.
              </li>
              <li>
                <strong className="text-slate-100">Usage &amp; analysis data.</strong> Ticket texts and descriptions you submit for
                analysis, the AI predictions generated from them (predicted files, dependencies, confidence scores), your monthly
                usage counters and plan quota, feedback you submit, and the date and time of each analysis.
              </li>
              <li>
                <strong className="text-slate-100">Payment data.</strong> Subscriptions are billed by Paystack, our payment processor.
                We do not collect or store card numbers or bank credentials. We receive only a transaction reference, the plan
                tier, amount, currency, and status, which we use to activate and manage your subscription. Card details you provide
                are processed directly by Paystack under their own privacy policy.
              </li>
              <li>
                <strong className="text-slate-100">Technical data.</strong> IP address, browser and device type, approximate
                location derived from IP, and server logs used for security monitoring and debugging. We also store a limited set of
                preferences in your browser&apos;s local storage (for example, your pinned tab and cached usage counters).
              </li>
            </ul>
          </section>

          <section id="use" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To provide, operate, and maintain the Service, including running ticket analyses and verifying predictions against GitHub.</li>
              <li>To authenticate your account, enforce usage quotas, and manage subscription tiers and billing.</li>
              <li>To improve the accuracy and reliability of our AI predictions, in aggregated or de-identified form where feasible.</li>
              <li>To detect, investigate, and prevent abuse, fraud, and security incidents.</li>
              <li>To respond to support requests — the support address (support.contextpilot@gmail.com) is also used as the reply-to for product announcements.</li>
              <li>To send transactional email (for example, password recovery and account notices). Promotional broadcasts may be sent to your account email; you may ask us to stop at any time.</li>
            </ul>
          </section>

          <section id="sharing" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">4. How We Share Information</h2>
            <p>We share data only with the processors required to run the Service. We do not sell your personal data.</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-slate-100">Supabase</strong> — authentication, database hosting (account profiles, usage counters, analysis history, feedback), and user storage.</li>
              <li><strong className="text-slate-100">GitHub</strong> — repository access for OAuth sign-in and for verifying predicted file paths against your branches. Access is read-only for verification purposes.</li>
              <li><strong className="text-slate-100">Google (Gemini API)</strong> — ticket text and repository context are sent to generate AI predictions. Do not submit secrets you are not authorized to process under Google&apos;s terms.</li>
              <li><strong className="text-slate-100">Paystack</strong> — payment processing and subscription verification.</li>
              <li><strong className="text-slate-100">Vercel</strong> — application hosting, delivery, and serverless compute.</li>
              <li><strong className="text-slate-100">Resend</strong> — delivery of transactional and announcement email to your account address.</li>
            </ul>
            <p>
              We may also disclose information if required by law, to enforce our Terms of Service, or to protect the rights,
              safety, and property of Hausa Cybertech, our users, or the public.
            </p>
          </section>

          <section id="cookies" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">5. Cookies &amp; Local Storage</h2>
            <p>
              The Service relies primarily on browser local storage rather than third-party tracking cookies. Local storage holds
              your session-related cache, pinned tab, and cached usage counters so the app remains responsive between serverless
              cold starts. Clearing your browser storage logs you out and resets cached preferences. We do not use advertising or
              cross-site tracking cookies.
            </p>
          </section>

          <section id="retention" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">6. Data Retention</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Account data is retained while your account is active.</li>
              <li>Analysis history is retained to power your dashboard and quota enforcement, and may be retained after deletion for up to 30 days in backups.</li>
              <li>You may permanently delete your account in-app (Account Settings). Deletion removes your profile, history, feedback, and usage records from our live systems, subject to residual copies in encrypted backups and any records we are legally required to keep (for example, payment references).</li>
            </ul>
          </section>

          <section id="security" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">7. Security</h2>
            <p>
              We use industry-standard measures including TLS encryption in transit, Supabase row-level security, service-role keys
              restricted to server-side code, hashed credentials, and least-privilege GitHub scopes. No method of transmission or
              storage is 100% secure; if you discover a vulnerability, please contact{' '}
              <a href={SUPPORT_MAILTO} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">support.contextpilot@gmail.com</a>.
            </p>
          </section>

          <section id="rights" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">8. Your Rights &amp; Choices</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-slate-100">Access &amp; correction</strong> — view and update your profile and usage anytime in-app.</li>
              <li><strong className="text-slate-100">Deletion</strong> — permanently delete your account and associated data at any time from Account Settings.</li>
              <li><strong className="text-slate-100">GitHub access</strong> — revoke Context Pilot&apos;s GitHub permissions anytime from GitHub &rarr; Settings &rarr; Applications.</li>
              <li><strong className="text-slate-100">Marketing</strong> — ask to be removed from announcement broadcasts by replying to any broadcast email or writing to support.</li>
              <li>Depending on your jurisdiction (for example, the EU/UK GDPR or the Nigerian NDPA), you may also have rights to object, restrict, or port your data. Contact us to exercise them.</li>
            </ul>
          </section>

          <section id="children" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">9. Children&apos;s Privacy</h2>
            <p>
              The Service is intended for software professionals and is not directed at children under 13 (or under 16 where local law
              requires). We do not knowingly collect personal data from children. If you believe a child has provided us data,
              contact us and we will delete it.
            </p>
          </section>

          <section id="international" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">10. International Transfers</h2>
            <p>
              Context Pilot is operated from Nigeria and uses processors whose infrastructure may be located in the United States,
              the European Union, or elsewhere. Where required, we rely on appropriate contractual safeguards for cross-border
              transfers.
            </p>
          </section>

          <section id="changes" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">11. Changes to This Policy</h2>
            <p>
              We may update this Policy from time to time. Material changes will be announced in-app or by email before they take
              effect. Continued use of the Service after the effective date constitutes acceptance of the revised Policy.
            </p>
          </section>

          <section id="contact" className="space-y-2 scroll-mt-24">
            <h2 className="text-base font-bold text-white">12. Contact Us</h2>
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
            <a href="/privacy" className="text-indigo-400 hover:text-indigo-300 transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
            <a href={SUPPORT_MAILTO} className="hover:text-white transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;
