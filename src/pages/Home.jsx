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
import JsonLd from "@/components/seo/JsonLd";
import { buildHomeStructuredDataGraph } from "@/lib/seo/structuredData";

/**
 * Marketing landing (Supabase-style dark shell). Optional authSlot renders between hero and features
 * (used by Signup). Log in opens a modal from the nav, hero, and footer.
 * @param {{ authSlot?: React.ReactNode, navActive?: "login" | "signup" | null, showWaitlist?: boolean }} props
 */
export default function Home({
  authSlot = null,
  navActive = null,
  showWaitlist = false,
}) {
  const location = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);

  const openLogin = useCallback(() => setLoginOpen(true), []);

  useEffect(() => {
    // Open login modal if navActive is 'login' or hash is '#sign-in'
    if (navActive === "login" || location.hash === "#sign-in") {
      setLoginOpen(true);
    }
  }, [location.hash, navActive]);


  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-32 font-sans text-zinc-100 antialiased selection:bg-[#FF4F00]/30 sm:pb-28">
      <JsonLd id="home" data={buildHomeStructuredDataGraph()} />
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
    </div>
  );
}
