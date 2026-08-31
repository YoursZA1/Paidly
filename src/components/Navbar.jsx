import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl, createSignupUrl } from "@/utils";

/**
 * @param {{ active?: "login" | "signup" | null, onLoginClick: () => void }} props
 */
export default function Navbar({ active = null, onLoginClick }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`landing-nav sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-white/[0.08] bg-[#0a0a0a]/90 shadow-xl shadow-black/30 backdrop-blur-xl"
          : "border-transparent bg-transparent backdrop-blur-none"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          to={createPageUrl("Home")}
          className="flex items-center gap-2.5 text-white"
          aria-label="Paidly home"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF4F00] shadow-md shadow-[#FF4F00]/30 ring-1 ring-[#FF4F00]/50">
            <img src="/logo.svg" alt="" className="h-5 w-5" aria-hidden />
          </div>
          <span className="text-sm font-semibold tracking-tight sm:text-base">Paidly</span>
        </Link>

        <nav
          className="hidden items-center gap-7 text-sm text-zinc-400 md:flex"
          aria-label="Primary"
        >
          {[
            { label: "Features", href: "#features" },
            { label: "Pricing", href: "#pricing" },
            { label: "Product", href: "#product" },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="relative py-1 transition-colors duration-150 hover:text-white"
            >
              {item.label}
            </a>
          ))}
          <Link
            to={createPageUrl("HowTo")}
            className="transition-colors duration-150 hover:text-white"
          >
            How to
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onLoginClick?.()}
            className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 sm:px-4 ${
              active === "login" ? "text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            Log In
          </button>
          <Link
            to={createSignupUrl()}
            className="rounded-lg bg-[#FF4F00] px-3 py-2 text-sm font-semibold text-white shadow-md shadow-[#FF4F00]/25 transition-all duration-200 hover:bg-[#E64700] hover:shadow-[#FF4F00]/35 sm:px-4"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
