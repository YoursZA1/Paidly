import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createPageUrl } from '@/utils';
import { Shield, ArrowRight } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-1 font-display">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">
            Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <Card className="rounded-xl border border-border shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Your data and privacy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              Paidly is committed to protecting your privacy. We collect only the information
              necessary to provide invoicing, quotes, and cash flow services. Your business
              data is stored securely and is not shared with third parties for marketing.
            </p>
            <p>
              We use industry-standard encryption and security practices. You can export or
              delete your data at any time from Settings. For questions about our privacy
              practices, please contact us through the app.
            </p>
          </CardContent>
        </Card>

        <Link
          to={createPageUrl('Dashboard')}
          className="inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          Back to Dashboard
          <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </div>
    </div>
  );
}
