import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "@/utils";
import { Database, Lock, Shield } from "lucide-react";

export default function PrivacyPolicy() {
  const lastUpdated = "26 March 2026";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-1 font-display">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">
            Last updated: {lastUpdated}
          </p>
        </div>

        <Card className="rounded-xl border border-border shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              How Paidly handles your data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              Paidly is a business finance platform for invoices, quotes, cash flow, and receipt
              processing. This policy explains how we collect, use, store, and protect information
              when you use the web app and related services.
            </p>
            <p>
              By using Paidly, you agree to the practices in this policy.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4 text-sm text-muted-foreground">
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Information we collect
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>- Account information (name, email, login metadata).</p>
              <p>- Business profile data (company details, tax and banking details you provide).</p>
              <p>- Operational data (clients, invoices, quotes, expenses, notes, and reports).</p>
              <p>- Uploaded documents, including receipt images and generated PDFs.</p>
              <p>- Basic usage and diagnostics needed for reliability and fraud prevention.</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                How we use information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>- Provide core Paidly features and secure authentication.</p>
              <p>- Generate business documents, exports, and email workflows you trigger.</p>
              <p>- Process receipt scans and extract fields from uploaded files.</p>
              <p>- Troubleshoot incidents, detect abuse, and improve service quality.</p>
              <p>- Comply with legal obligations and enforce our Terms &amp; Conditions.</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Infrastructure and processors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                Paidly is hosted on Vercel and uses Supabase for authentication and data storage.
                We may also use integrated services for document delivery, payment workflows, and
                OCR/automation related to receipt handling.
              </p>
              <p>
                These providers process data only to deliver Paidly services and are expected to
                maintain appropriate security controls.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Data retention and your rights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                We retain business records for as long as your account is active, or as required for
                compliance, dispute handling, and legitimate business operations.
              </p>
              <p>
                You can request access, correction, export, or deletion of your personal data by
                contacting us at <a className="text-primary hover:underline" href="mailto:support@paidly.co.za">support@paidly.co.za</a>.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 text-sm">
          <Link to={createPageUrl("TermsAndConditions")} className="text-primary hover:underline">
            Read Terms &amp; Conditions
          </Link>
          <Link to={createPageUrl("Home")} className="text-muted-foreground hover:text-foreground">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
