import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "@/utils";
import { FileText, ShieldCheck, CreditCard, Ban, RotateCcw } from "lucide-react";

const SUPPORT_EMAIL = "support@paidly.co.za";

export default function TermsAndConditions() {
  const lastUpdated = "25 June 2026";
  const location = useLocation();

  // Allow deep links like /TermsAndConditions#refund-cancellation (e.g. the footer link)
  // to scroll straight to the relevant policy section.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-1 font-display">
            Terms &amp; Conditions
          </h1>
          <p className="text-muted-foreground text-sm">Last updated: {lastUpdated}</p>
        </div>

        <Card className="rounded-xl border border-border shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Agreement to use Paidly
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground text-sm">
            <p>
              These Terms govern your use of Paidly, including invoicing, quoting, cash flow tools,
              expense tracking, document generation, and related integrations.
            </p>
            <p>
              By creating an account or using Paidly, you agree to these Terms and our Privacy Policy.
              These Terms include our billing, cancellation, and refund policies set out below.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4 text-sm text-muted-foreground">
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">1) Account and access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>- You must provide accurate registration and business information.</p>
              <p>- You are responsible for activity under your account and credentials.</p>
              <p>- Keep your login details secure and notify us about unauthorized access.</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">2) Acceptable use</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>- You may use Paidly only for lawful business purposes.</p>
              <p>- You may not misuse the platform, interfere with operations, or bypass security.</p>
              <p>- You are responsible for the legality and accuracy of data and documents you create.</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">3) Data and services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                Paidly uses third-party infrastructure (including Supabase and Vercel) and may use
                additional providers for functions like email delivery, payments, and OCR processing.
              </p>
              <p>
                While we work to maintain high availability and data integrity, uninterrupted or
                error-free service is not guaranteed.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                4) Subscriptions, billing and renewals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                <span className="font-medium text-foreground">Free trial.</span> Paidly offers a 7-day
                free trial. You will not be charged during the trial, and you can cancel any time
                before it ends to avoid being billed.
              </p>
              <p>
                <span className="font-medium text-foreground">Plans and billing cycle.</span> Paid
                plans are billed in advance on a recurring basis — monthly or annually, depending on
                the plan you choose — at the price shown at checkout (in South African Rand, including
                any applicable VAT).
              </p>
              <p>
                <span className="font-medium text-foreground">Payments.</span> Payments are processed
                securely through our payment gateway, PayFast. By subscribing, you authorize Paidly to
                charge your selected payment method for the recurring subscription fee until you cancel.
              </p>
              <p>
                <span className="font-medium text-foreground">Automatic renewal.</span> Your
                subscription renews automatically at the end of each billing cycle unless you cancel
                before the renewal date. Each renewal is charged at the then-current price for your plan.
              </p>
              <p>
                <span className="font-medium text-foreground">Price changes.</span> We may change plan
                pricing from time to time. Where prices change, we will give you reasonable advance
                notice, and the new price will apply from your next billing cycle.
              </p>
              <p>
                <span className="font-medium text-foreground">Failed payments.</span> If a payment
                fails, we may retry the charge and/or suspend access to paid features until the
                outstanding amount is settled. You remain responsible for your own accounting, tax
                submissions, and legal compliance.
              </p>
            </CardContent>
          </Card>

          <Card id="refund-cancellation" className="scroll-mt-24 rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Ban className="h-4 w-4 text-primary" />
                5) Cancellation policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                - You can cancel your subscription at any time from{" "}
                <span className="font-medium text-foreground">Settings → Billing</span>, or by emailing{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
              <p>
                - Cancellation stops future renewals. It takes effect at the end of your current paid
                billing period — you keep access to paid features until then, and you will not be
                charged again after that.
              </p>
              <p>
                - Cancelling during your free trial stops it immediately (or at the end of the trial)
                and you will not be charged.
              </p>
              <p>
                - After your paid period ends, your account moves to a limited or read-only state. We
                retain your data for a reasonable period so you can export it or reactivate, after
                which it may be permanently deleted in line with our Privacy Policy.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-primary" />
                6) Refund policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                - Because we offer a free trial so you can evaluate Paidly before paying, subscription
                fees are generally non-refundable, including for partial billing periods or unused time
                after cancellation.
              </p>
              <p>
                - <span className="font-medium text-foreground">Monthly plans:</span> once a billing
                month has started it is non-refundable. Cancel before your next renewal to avoid the
                following charge.
              </p>
              <p>
                - <span className="font-medium text-foreground">Annual plans:</span> non-refundable
                except where required by law or approved by us at our discretion (for example, a
                pro-rata credit in exceptional circumstances).
              </p>
              <p>
                - <span className="font-medium text-foreground">Billing errors:</span> duplicate
                charges, or charges resulting from a proven billing error on our side, are refunded in
                full to your original payment method.
              </p>
              <p>
                - <span className="font-medium text-foreground">Your statutory rights:</span> nothing
                in this policy limits any rights you may have under the Consumer Protection Act 68 of
                2008 or the Electronic Communications and Transactions Act 25 of 2002. Where those laws
                grant you a cooling-off or other right, that right applies.
              </p>
              <p>
                - <span className="font-medium text-foreground">Requesting a refund:</span> email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                  {SUPPORT_EMAIL}
                </a>{" "}
                within 7 days of the charge, with your account email and details. Approved refunds are
                returned to the original payment method via PayFast within a reasonable period (usually
                up to 10 business days).
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">7) Intellectual property and limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>- Paidly and its software remain our intellectual property.</p>
              <p>- You retain ownership of your uploaded and generated business data.</p>
              <p>
                To the extent permitted by law, Paidly is provided &ldquo;as is&rdquo; and we are not liable for
                indirect, incidental, or consequential losses arising from use of the platform.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                8) Suspension, termination, and updates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                We may suspend or terminate access for abuse, security concerns, non-payment, or legal
                requirements. You may stop using Paidly at any time.
              </p>
              <p>
                We may update these Terms periodically. Continued use after updates means you accept
                the revised version.
              </p>
              <p>
                These Terms are governed by the laws of the Republic of South Africa. For any billing,
                cancellation, or refund query, contact us at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 text-sm">
          <Link to={createPageUrl("PrivacyPolicy")} className="text-primary hover:underline">
            Read Privacy Policy
          </Link>
          <Link to={createPageUrl("Home")} className="text-muted-foreground hover:text-foreground">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
