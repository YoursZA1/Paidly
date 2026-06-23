import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, AlertCircle } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

/**
 * Legacy route — email auth invites and shareable /invite?token= links.
 */
export default function AcceptInvite() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-primary/5 to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Team invitation</CardTitle>
          <p className="text-sm text-slate-500">
            Invitations are completed using the secure link from your administrator.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-700" />
            <span>
              Open the invitation email and follow the link to set your password. Shareable invite URLs
              use <Link to="/invite" className="underline font-medium">/invite?token=…</Link>.
            </span>
          </div>
          <Button
            type="button"
            onClick={() => navigate(`${createPageUrl("Login")}#sign-in`)}
            className="w-full bg-primary hover:bg-primary/90 text-white"
          >
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
