import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitAffiliateApplication } from "@/api/affiliateClient";
import { createAffiliateLandingUrl, createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

export default function AffiliateApply() {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [whyPromote, setWhyPromote] = useState("");
  const [audiencePlatform, setAudiencePlatform] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const name = fullName.trim();
    const em = email.trim();
    if (!name) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!em) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const res = await submitAffiliateApplication({
      fullName: name,
      email: em,
      whyPromote: whyPromote.trim() || undefined,
      audiencePlatform: audiencePlatform.trim() || undefined,
    });
    setSubmitting(false);
    if (res.ok) {
      toast({
        title: "Application received",
        description: "We’ll review your application and email you with next steps.",
      });
      setFullName("");
      setEmail("");
      setWhyPromote("");
      setAudiencePlatform("");
    } else {
      toast({
        title: "Couldn’t submit",
        description: res.error || "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans text-zinc-100 antialiased selection:bg-[#FF4F00]/30">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link to={createPageUrl("Home")} className="flex items-center gap-2 text-white" aria-label="Paidly home">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
              <img src="/logo.svg" alt="" className="h-6 w-6" aria-hidden />
            </div>
            <span className="text-sm font-semibold">Paidly</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to={createAffiliateLandingUrl()} className="hidden text-zinc-400 transition hover:text-white sm:inline">
              Program overview
            </Link>
            <Link to={createPageUrl("Login")} className="text-zinc-400 transition hover:text-white">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="px-4 pb-20 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_-10%,rgba(255,79,0,0.12),transparent)]" />
        <div className="relative mx-auto max-w-lg">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#FF4F00]">
            Affiliate application
          </p>
          <h1 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Apply to earn with Paidly
          </h1>
          <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-zinc-400">
            Tell us who you reach and how you&apos;ll promote Paidly. We review every partner — usually within a few
            business days.
          </p>

          <form
            onSubmit={onSubmit}
            className="mt-10 space-y-5 rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6 sm:p-8"
          >
            <div className="space-y-2">
              <Label htmlFor="apply-name" className="text-zinc-200">
                Name
              </Label>
              <Input
                id="apply-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apply-email" className="text-zinc-200">
                Email
              </Label>
              <Input
                id="apply-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apply-why" className="text-zinc-200">
                Why do you want to promote Paidly?
              </Label>
              <Textarea
                id="apply-why"
                value={whyPromote}
                onChange={(e) => setWhyPromote(e.target.value)}
                placeholder="What resonates with your audience — invoicing, cash flow, getting paid faster…"
                rows={4}
                className="resize-none border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apply-audience" className="text-zinc-200">
                Audience size / platform
              </Label>
              <Textarea
                id="apply-audience"
                value={audiencePlatform}
                onChange={(e) => setAudiencePlatform(e.target.value)}
                placeholder="e.g. Newsletter 2k SMBs, YouTube 15k subs, accounting clients…"
                rows={3}
                className="resize-none border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#FF4F00] py-6 text-base font-semibold hover:bg-[#E64700]"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                "Apply to Earn with Paidly"
              )}
            </Button>
            <p className="flex items-start gap-2 text-xs text-zinc-500">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
              By applying you agree we may contact you about the affiliate program. See our{" "}
              <Link to={createPageUrl("PrivacyPolicy")} className="underline hover:text-zinc-400">
                Privacy Policy
              </Link>
              .
            </p>
          </form>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-zinc-500">
        <Link to={createPageUrl("Home")} className="hover:text-zinc-300">
          Paidly
        </Link>
        {" · "}
        <Link to={createAffiliateLandingUrl()} className="hover:text-zinc-300">
          Affiliate program
        </Link>
      </footer>
    </div>
  );
}
