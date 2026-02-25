import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createPageUrl } from '@/utils';
import { Target, Eye, Heart, ArrowRight } from 'lucide-react';

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-1">About InvoiceBreek</h1>
          <p className="text-muted-foreground">
            Our mission and what we stand for.
          </p>
        </div>

        <Card className="rounded-xl border border-border shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Mission
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              InvoiceBreek helps small businesses and freelancers get paid faster by making
              invoicing, quotes, and cash flow simple and professional. We aim to reduce the
              friction between sending an invoice and receiving payment so you can focus on
              your work.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Vision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              We believe every business deserves clear, reliable tools for billing and
              finances—without complexity or hidden costs. Our vision is to be the go-to
              platform for creating, sending, and tracking invoices and quotes, with
              transparency and ease at the core.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border shadow-sm mb-8">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              Values
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground">
            <ul className="list-disc list-inside space-y-1">
              <li>Simplicity — straightforward workflows and no clutter</li>
              <li>Reliability — your data and reports when you need them</li>
              <li>Transparency — clear pricing and no surprise fees</li>
              <li>Respect for your time — fast setup and minimal admin</li>
            </ul>
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
