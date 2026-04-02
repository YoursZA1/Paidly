import { useState } from "react";
import { Loader2, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { submitWaitlistSignup } from "@/api/waitlistClient";
import {
  PRODUCT_LAUNCH_DATE_LABEL,
  PRODUCT_LAUNCH_SUBTITLE,
  getProductLaunchTimeLeftPhrase,
  getWaitlistThankYouMessage,
} from "@/constants/productLaunch";
import { useTurnstileChallenge } from "@/hooks/useTurnstileChallenge";
import TurnstileChallenge from "@/components/security/TurnstileChallenge";

export default function WaitlistSection() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [thanksOpen, setThanksOpen] = useState(false);
  const [thanksTitle, setThanksTitle] = useState("");
  const [thanksDescription, setThanksDescription] = useState("");
  const turnstile = useTurnstileChallenge({
    requiredEnvKey: "VITE_TURNSTILE_REQUIRE_WAITLIST",
    theme: "dark",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setMessage("Please enter your email.");
      return;
    }
    if (turnstile.required && !turnstile.token) {
      setMessage("Please complete the security check.");
      return;
    }
    setStatus("loading");
    try {
      const res = await submitWaitlistSignup({
        email: normalized,
        name: name.trim() || undefined,
        turnstileToken: turnstile.token,
      });
      if (res?.ok) {
        setEmail("");
        setName("");
        turnstile.reset();
        const timeLeft = getProductLaunchTimeLeftPhrase();
        if (res.duplicate) {
          setThanksTitle("You're already on the list");
          setThanksDescription(
            `We’ll still email you before we go live on ${PRODUCT_LAUNCH_DATE_LABEL}. ${timeLeft} left.`
          );
        } else {
          const { title, description } = getWaitlistThankYouMessage();
          setThanksTitle(title);
          setThanksDescription(description);
        }
        setThanksOpen(true);
      } else {
        setMessage(res?.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "We couldn't save that right now. Please try again in a moment.";
      setMessage(msg);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <section
      id="waitlist"
      className="scroll-mt-28 border-t border-white/[0.06] bg-[#080808] px-4 py-14 sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-lg text-center">
        <h2 className="font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Join the waitlist
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400 sm:text-base">
          {PRODUCT_LAUNCH_SUBTITLE}
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-left">
          <div className="space-y-2">
            <Label htmlFor="waitlist-name" className="text-zinc-200">
              Name <span className="text-zinc-400 font-normal">(optional)</span>
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                id="waitlist-name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl border-zinc-600/80 bg-zinc-950/50 pl-10 text-zinc-100 placeholder:text-zinc-400"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="waitlist-email" className="text-zinc-200">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                id="waitlist-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border-zinc-600/80 bg-zinc-950/50 pl-10 text-zinc-100 placeholder:text-zinc-400"
                required
              />
            </div>
          </div>
          {message && (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          )}
          <TurnstileChallenge
            siteKey={turnstile.siteKey}
            required={turnstile.required}
            ready={turnstile.ready}
            containerRef={turnstile.containerRef}
            helperClassName="text-xs text-zinc-400"
          />
          <Button
            type="submit"
            disabled={status === "loading" || (turnstile.required && !turnstile.ready)}
            className="h-12 w-full rounded-xl bg-[#FF4F00] text-white hover:bg-[#E64700]"
          >
            {status === "loading" ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Joining…
              </span>
            ) : (
              "Join the waitlist"
            )}
          </Button>
        </form>

        <AlertDialog open={thanksOpen} onOpenChange={setThanksOpen}>
          <AlertDialogContent className="rounded-2xl border-border bg-zinc-950 text-zinc-100 sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-white">{thanksTitle}</AlertDialogTitle>
              <AlertDialogDescription className="text-left text-base leading-relaxed text-zinc-300">
                {thanksDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                className="w-full rounded-xl bg-[#FF4F00] text-white hover:bg-[#E64700] sm:w-auto"
                onClick={() => setThanksOpen(false)}
              >
                OK
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
