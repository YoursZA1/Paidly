import { Link } from "react-router-dom";
import { createPageUrl, createSignupUrl, createWaitlistUrl } from "@/utils";

/**
 * @param {{ onLoginClick: () => void }} props
 */
export default function Footer({ onLoginClick }) {
  const LINKS = {
    Product: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Join waitlist", to: createWaitlistUrl() },
      { label: "Create account", to: createSignupUrl() },
    ],
    Support: [
      { label: "Log in", action: "login" },
      { label: "Privacy Policy", to: createPageUrl("PrivacyPolicy") },
      { label: "Terms & Conditions", to: createPageUrl("TermsAndConditions") },
    ],
    Contact: [{ label: "support@paidly.co.za", href: "mailto:support@paidly.co.za" }],
  };
  return (
    <footer className="border-t border-white/[0.08] bg-[#050505] px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
              <img src="/logo.svg" alt="" className="h-6 w-6" aria-hidden />
            </div>
            <span className="font-semibold text-white">Paidly</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            Invoicing and cash flow for teams who want less admin and faster payments.
          </p>
        </div>
        {Object.entries(LINKS).map(([heading, items]) => (
          <div key={heading}>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{heading}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {items.map((item) => (
                <li key={item.label}>
                  {item.action === "login" ? (
                    <button
                      type="button"
                      onClick={() => onLoginClick?.()}
                      className="cursor-pointer text-left text-zinc-400 transition hover:text-white"
                    >
                      {item.label}
                    </button>
                  ) : "to" in item && item.to ? (
                    <Link to={item.to} className="text-zinc-400 transition hover:text-white">
                      {item.label}
                    </Link>
                  ) : (
                    <a href={item.href} className="text-zinc-400 transition hover:text-white">
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 max-w-6xl border-t border-white/[0.06] pt-8 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} Paidly. All rights reserved.
      </div>
    </footer>
  );
}
