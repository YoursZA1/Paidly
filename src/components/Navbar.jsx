import { Link } from "react-router-dom";
import { createPageUrl, createWaitlistUrl, createAffiliateLandingUrl } from "@/utils";

/**
 * @param {{ active?: "login" | "signup" | null, onLoginClick: () => void }} props
 */
export default function Navbar({ active = null, onLoginClick }) {
  return (
    <header className="landing-nav sticky top-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link to={createPageUrl("Home")} className="flex items-center gap-2.5 text-white" aria-label="Paidly home">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
            <img src="/logo.svg" alt="" className="h-6 w-6" aria-hidden />
          </div>
          <span className="text-sm font-semibold tracking-tight sm:text-base">Paidly</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex" aria-label="Primary">
          <a href="#features" className="transition hover:text-white">
            Features
          </a>
          <a href="#pricing" className="transition hover:text-white">
            Pricing
          </a>
          <a href="#product" className="transition hover:text-white">
            Product
          </a>
          <Link to={createAffiliateLandingUrl()} className="transition hover:text-white">
            Affiliate
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onLoginClick?.()}
            className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition sm:px-4 ${
              active === "login" ? "text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            Log In
          </button>
          <Link
            to={createWaitlistUrl()}
            className="rounded-lg bg-[#FF4F00] px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/25 transition hover:bg-[#E64700] sm:px-4"
          >
            Join waitlist
          </Link>
        </div>
      </div>
    </header>
  );
}
