import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, Mail, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [inviteValid, setInviteValid] = useState(null);
  const [inviteData, setInviteData] = useState(null);

  useEffect(() => {
    // Validate invite token on mount
    if (!token) {
      setError("Invalid invite link");
      setInviteValid(false);
      return;
    }

    try {
      const invites = JSON.parse(
        localStorage.getItem("breakapi_invites") || "{}"
      );
      const invite = invites[token];

      if (!invite) {
        setError("Invite not found");
        setInviteValid(false);
        return;
      }

      if (invite.expiresAt < Date.now()) {
        setError("Invite has expired");
        setInviteValid(false);
        return;
      }

      if (invite.accepted) {
        setError("This invite has already been accepted");
        setInviteValid(false);
        return;
      }

      setInviteData(invite);
      setInviteValid(true);
    } catch {
      setError("Invalid invite link");
      setInviteValid(false);
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        setIsLoading(false);
        return;
      }

      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        setIsLoading(false);
        return;
      }

      // Get invite
      const invites = JSON.parse(
        localStorage.getItem("breakapi_invites") || "{}"
      );
      const invite = invites[token];

      if (!invite) {
        setError("Invalid invite request");
        setIsLoading(false);
        return;
      }

      // Update or create user
      const users = JSON.parse(localStorage.getItem("breakapi_users") || "[]");
      const existingIndex = users.findIndex((u) => u.email === invite.email);

      if (existingIndex !== -1) {
        // Update existing user with password
        users[existingIndex].password = password;
        users[existingIndex].status = "active";
      } else {
        // Create new user
        const newUser = {
          id: Date.now().toString(),
          email: invite.email,
          full_name: invite.full_name,
          password,
          role: invite.role,
          plan: invite.plan || "free",
          status: "active",
          company_name: "",
          currency: "USD",
          timezone: "UTC",
          logo_url: null
        };
        users.push(newUser);
      }

      localStorage.setItem("breakapi_users", JSON.stringify(users));

      // Mark invite as accepted
      invites[token].accepted = true;
      invites[token].acceptedAt = Date.now();
      localStorage.setItem("breakapi_invites", JSON.stringify(invites));

      setSuccess(true);
      setTimeout(() => {
        navigate(createPageUrl("Login"));
      }, 2000);
    } catch (err) {
      setError(err?.message || "Failed to accept invite");
    } finally {
      setIsLoading(false);
    }
  };

  if (inviteValid === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="pt-12 pb-6 text-center">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Validating invite...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inviteValid === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="pt-12 pb-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid invite</h2>
            <p className="text-sm text-slate-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="pt-12 pb-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Account created!</h2>
            <p className="text-sm text-slate-600">
              You can now log in with your email and password
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Accept your invite</CardTitle>
          <p className="text-sm text-slate-500">
            {inviteData?.email} • Role: {inviteData?.role === "admin" ? "Admin" : "User"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={inviteData?.email || ""}
                  disabled
                  className="pl-10 bg-slate-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                value={inviteData?.full_name || ""}
                disabled
                className="bg-slate-50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isLoading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
