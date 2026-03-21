import { useState } from "react";
import { Loader2, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitWaitlistSignup } from "@/api/waitlistClient";
import { PRODUCT_LAUNCH_BADGE, PRODUCT_LAUNCH_SUBTITLE } from "@/constants/productLaunch";

export default function WaitlistSection() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setSuccess(false);
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setMessage("Please enter your email.");
      return;
    }
    setStatus("loading");
    try {
      const res = await submitWaitlistSignup({ email: normalized, name: name.trim() || undefined });
      if (res?.ok) {
        setSuccess(true);
        setMessage(res.message || "You're on the list. We'll be in touch soon.");
        setEmail("");
        setName("");
      } else {
        setMessage(res?.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      setSuccess(false);
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
        <p className="text-xs font-semibold uppercase tracking-wider text-[#FF8C42]">
          {PRODUCT_LAUNCH_BADGE}
        </p>
        <h2 className="mt-3 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Join the waitlist
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400 sm:text-base">
          {PRODUCT_LAUNCH_SUBTITLE}
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-left">
          <div className="space-y-2">
            <Label htmlFor="waitlist-name" className="text-zinc-200">
              Name <span className="text-zinc-500 font-normal">(optional)</span>
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                id="waitlist-name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl border-zinc-600/80 bg-zinc-950/50 pl-10 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="waitlist-email" className="text-zinc-200">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                id="waitlist-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border-zinc-600/80 bg-zinc-950/50 pl-10 text-zinc-100 placeholder:text-zinc-500"
                required
              />
            </div>
          </div>
          {message && (
            <p
              className={`text-sm ${success ? "text-emerald-400" : "text-red-400"}`}
              role="status"
            >
              {message}
            </p>
          )}
          <Button
            type="submit"
            disabled={status === "loading"}
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
      </div>
    </section>
  );
}
