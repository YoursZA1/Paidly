import { Link } from "react-router-dom";
import { ArrowRight, Percent, RefreshCw, Shield } from "lucide-react";
import { createAffiliateApplyUrl } from "@/utils";

/**
 * Homepage strip — drives discovery of the public /affiliate program.
 */
export default function AffiliateSection() {
  return (
    <section className="relative border-y border-white/[0.08] bg-gradient-to-br from-[#0f0f0f] via-[#0a0a0a] to-[#111] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF4F00]">
              Partners
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
              Earn by Helping Businesses Get Paid Faster
            </h2>
            <p className="text-base leading-relaxed text-zinc-400">
              Share Paidly with businesses that invoice and get paid. Earn recurring income when your
              referrals subscribe — built for accountants, agencies, and creators who already talk
              about money.
            </p>
            <ul className="flex flex-col gap-3 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <Percent className="mt-0.5 h-5 w-5 shrink-0 text-[#FF4F00]" aria-hidden />
                <span>Recurring revenue on paid subscriptions</span>
              </li>
              <li className="flex items-start gap-3">
                <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-[#FF4F00]" aria-hidden />
                <span>Tracking and payouts from your affiliate dashboard</span>
              </li>
              <li className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#FF4F00]" aria-hidden />
                <span>Simple application — we review every partner</span>
              </li>
            </ul>
          </div>
          <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8">
            <p className="text-sm font-medium text-zinc-200">Start in two steps</p>
            <ol className="list-inside list-decimal space-y-2 text-sm text-zinc-400">
              <li>Apply — tell us about your audience</li>
              <li>Get approved — unlock your referral link in the app</li>
            </ol>
            <Link
              to={createAffiliateApplyUrl()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF4F00] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/25 transition hover:bg-[#E64700]"
            >
              Apply Now
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="text-xs text-zinc-500">
              After you&apos;re approved, you&apos;ll find your link under{" "}
              <span className="text-zinc-400">Affiliate</span> in the Paidly dashboard.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
