import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import ProductPreview from "@/components/ProductPreview";
import Pricing from "@/components/Pricing";
import ValueSection from "@/components/ValueSection";
import SocialProof from "@/components/SocialProof";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";
import LandingLoginModal from "@/components/auth/LandingLoginModal";
import WaitlistSection from "@/components/WaitlistSection";
import LaunchCountdownFloat from "@/components/LaunchCountdownFloat";

/**
 * Marketing landing (Supabase-style dark shell). Optional authSlot renders between hero and features
 * (used by Signup). Log in opens a modal from the nav, hero, and footer.
 * @param {{ authSlot?: React.ReactNode, navActive?: "login" | "signup" | null, showWaitlist?: boolean }} props
 */
export default function Home({
  authSlot = null,
  navActive = null,
  showWaitlist = true,
}) {
  const location = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);

  const openLogin = useCallback(() => setLoginOpen(true), []);

  useEffect(() => {
    if (location.hash !== "#waitlist") return;
    const scrollToWaitlist = () =>
      document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollToWaitlist();
    const t = window.setTimeout(scrollToWaitlist, 150);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.hash]);


  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-32 font-sans text-zinc-100 antialiased selection:bg-[#FF4F00]/30 sm:pb-28">
      <Navbar active={navActive} onLoginClick={openLogin} />
      <Hero onLoginClick={openLogin} />
      {showWaitlist ? <WaitlistSection /> : null}
      {authSlot}
      <Features />
      <ProductPreview />
      <Pricing />
      <ValueSection />
      <SocialProof />
      <CTASection />
      <Footer onLoginClick={openLogin} />
      <LandingLoginModal open={loginOpen} onOpenChange={setLoginOpen} />
      <LaunchCountdownFloat />
    </div>
  );
}
