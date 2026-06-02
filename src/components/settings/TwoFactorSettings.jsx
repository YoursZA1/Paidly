import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Shield, ShieldCheck, ShieldOff, Copy, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function StatusBadge({ active }) {
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
            {active ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
            {active ? "Enabled" : "Disabled"}
        </span>
    );
}

export default function TwoFactorSettings() {
    const { toast } = useToast();
    const [status, setStatus] = useState("loading"); // loading | disabled | enrolling | enabled
    const [activeFactor, setActiveFactor] = useState(null);
    const [enrollData, setEnrollData] = useState(null); // { id, qr_code, secret }
    const [otpCode, setOtpCode] = useState("");
    const [isWorking, setIsWorking] = useState(false);
    const [secretCopied, setSecretCopied] = useState(false);

    const loadFactors = useCallback(async () => {
        setStatus("loading");
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) {
            setStatus("disabled");
            return;
        }
        const verified = data?.totp?.find((f) => f.factor_type === "totp" && f.status === "verified");
        if (verified) {
            setActiveFactor(verified);
            setStatus("enabled");
        } else {
            setActiveFactor(null);
            setStatus("disabled");
        }
    }, []);

    useEffect(() => {
        loadFactors();
    }, [loadFactors]);

    const handleStartEnroll = async () => {
        setIsWorking(true);
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Paidly" });
        setIsWorking(false);
        if (error) {
            toast({ title: "Could not start 2FA setup", description: error.message, variant: "destructive" });
            return;
        }
        setEnrollData({ id: data.id, qr_code: data.totp.qr_code, secret: data.totp.secret });
        setOtpCode("");
        setStatus("enrolling");
    };

    const handleVerify = async () => {
        if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
            toast({ title: "Enter a 6-digit code from your authenticator app", variant: "destructive" });
            return;
        }
        setIsWorking(true);
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code: otpCode });
        setIsWorking(false);
        if (error) {
            toast({ title: "Verification failed", description: error.message, variant: "destructive" });
            setOtpCode("");
            return;
        }
        toast({ title: "Two-factor authentication enabled", description: "Your account is now protected with TOTP." });
        setEnrollData(null);
        setOtpCode("");
        await loadFactors();
    };

    const handleCancelEnroll = async () => {
        if (enrollData?.id) {
            await supabase.auth.mfa.unenroll({ factorId: enrollData.id }).catch(() => {});
        }
        setEnrollData(null);
        setOtpCode("");
        setStatus("disabled");
    };

    const handleDisable = async () => {
        if (!activeFactor) return;
        setIsWorking(true);
        const { error } = await supabase.auth.mfa.unenroll({ factorId: activeFactor.id });
        setIsWorking(false);
        if (error) {
            toast({ title: "Could not disable 2FA", description: error.message, variant: "destructive" });
            return;
        }
        toast({ title: "Two-factor authentication disabled" });
        setActiveFactor(null);
        setStatus("disabled");
    };

    const copySecret = () => {
        if (!enrollData?.secret) return;
        navigator.clipboard.writeText(enrollData.secret).then(() => {
            setSecretCopied(true);
            setTimeout(() => setSecretCopied(false), 2000);
        });
    };

    if (status === "loading") {
        return (
            <div className="space-y-4">
                <Skeleton className="h-5 w-48 rounded-lg" />
                <Skeleton className="h-16 w-full rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <Shield className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-foreground">Authenticator app (TOTP)</p>
                        <p className="text-xs text-muted-foreground">Use an app like Google Authenticator or Authy</p>
                    </div>
                </div>
                <StatusBadge active={status === "enabled"} />
            </div>

            {status === "disabled" && (
                <div className="rounded-xl border border-border p-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Protect your account with a time-based one-time password. You&apos;ll be asked for a code from your authenticator app each time you sign in.
                    </p>
                    <Button onClick={handleStartEnroll} disabled={isWorking} className="rounded-xl h-9">
                        {isWorking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                        Enable two-factor authentication
                    </Button>
                </div>
            )}

            {status === "enrolling" && enrollData && (
                <div className="rounded-xl border border-border p-5 space-y-5">
                    <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="text-xs">Complete setup by scanning the QR code and entering the verification code below. Do not close this page.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                        <div className="shrink-0">
                            <p className="text-xs font-medium text-muted-foreground mb-2">1. Scan with your authenticator app</p>
                            <img src={enrollData.qr_code} alt="TOTP QR code" className="w-40 h-40 rounded-xl border border-border bg-white" />
                        </div>
                        <div className="flex-1 space-y-3">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Or enter the key manually</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-xs font-mono bg-muted rounded-lg px-3 py-2 break-all select-all">
                                        {enrollData.secret}
                                    </code>
                                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg" onClick={copySecret} title="Copy secret">
                                        {secretCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="totp-code" className="text-xs font-medium">2. Enter the 6-digit code</Label>
                                <Input
                                    id="totp-code"
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    placeholder="000000"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    className="font-mono text-center text-lg tracking-[0.4em] rounded-xl h-11 w-36"
                                    maxLength={6}
                                    onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <Button onClick={handleVerify} disabled={isWorking || otpCode.length !== 6} className="rounded-xl h-9">
                            {isWorking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Verify &amp; activate
                        </Button>
                        <Button variant="ghost" onClick={handleCancelEnroll} disabled={isWorking} className="rounded-xl h-9 text-muted-foreground">
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {status === "enabled" && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-4 space-y-3">
                    <p className="text-sm text-foreground">
                        Your account is protected with two-factor authentication. You&apos;ll be prompted for a code when signing in from a new device.
                    </p>
                    <Button variant="outline" onClick={handleDisable} disabled={isWorking} className="rounded-xl h-9 text-destructive border-destructive/30 hover:bg-destructive/5">
                        {isWorking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldOff className="w-4 h-4 mr-2" />}
                        Disable two-factor authentication
                    </Button>
                </div>
            )}
        </div>
    );
}
