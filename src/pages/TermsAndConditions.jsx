import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "@/utils";
import { FileText, ShieldCheck } from "lucide-react";

export default function TermsAndConditions() {
  const lastUpdated = "26 March 2026";

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
              <CardTitle className="text-base font-semibold">4) Payments and billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                If paid plans or transaction fees apply, you agree to pay charges shown at checkout
                or in your service agreement. Taxes, gateway fees, and bank charges may apply.
              </p>
              <p>
                You remain responsible for your own accounting, tax submissions, and legal compliance.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">5) Intellectual property and limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>- Paidly and its software remain our intellectual property.</p>
              <p>- You retain ownership of your uploaded and generated business data.</p>
              <p>
                To the extent permitted by law, Paidly is provided "as is" and we are not liable for
                indirect, incidental, or consequential losses arising from use of the platform.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                6) Suspension, termination, and updates
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
