import { useState } from "react";
import PropTypes from "prop-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Button from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader2, User } from "lucide-react";
import { userService } from "@/services/ExcelUserService";
import { PLANS, getPlanOrder } from "@/data/planLimits";

export default function CreateAccountDialog({ open, onOpenChange, onAccountCreated }) {
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    display_name: "",
    company_name: "",
    company_address: "",
    role: "user",
    plan: "free",
    currency: "ZAR",
    timezone: "UTC",
    phone: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(""); // Clear error on input change
  };
  const validateForm = () => {
    if (!formData.email.trim()) {
      setError("Email is required");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email address");
      return false;
    }

    if (!formData.full_name.trim()) {
      setError("Full name is required");
      return false;
    }

    return true;
  };

  const handleCreateAccount = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Create user in Excel service
      const newUser = userService.createUser({
        email: formData.email.trim().toLowerCase(),
        full_name: formData.full_name.trim(),
        display_name: formData.display_name.trim() || formData.full_name.trim(),
        company_name: formData.company_name.trim(),
        company_address: formData.company_address.trim(),
        role: formData.role,
        plan: formData.plan,
        currency: formData.currency,
        timezone: formData.timezone,
        phone: formData.phone.trim(),
      });

      setSuccess(true);
      
      // Reset form after success
      setTimeout(() => {
        setFormData({
          email: "",
          full_name: "",
          display_name: "",
          company_name: "",
          company_address: "",
          role: "user",
          plan: "free",
          currency: "ZAR",
          timezone: "UTC",
          phone: "",
        });
        setSuccess(false);
        onOpenChange(false);
        
        // Notify parent of account creation
        if (onAccountCreated) {
          onAccountCreated(newUser);
        }
      }, 1500);
    } catch (err) {
      setError(err.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      email: "",
      full_name: "",
      display_name: "",
      company_name: "",
      company_address: "",
      role: "user",
      plan: "free",
      currency: "ZAR",
      timezone: "UTC",
      phone: "",
    });
    setError("");
    setSuccess(false);
  };

  const timezones = [
    "UTC", "GMT", "EST", "CST", "MST", "PST",
    "SAST", // South Africa
  ];

  const currencies = ["ZAR", "USD", "EUR", "GBP"];
  const plans = getPlanOrder();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <User className="w-5 h-5" />
            Create New Account
          </DialogTitle>
          <DialogDescription className="text-sm">
            Fill in the details below to create a new user account.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {success && (
            <Card className="bg-green-50 border-green-200 mb-3">
              <CardContent className="py-3 px-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-900 font-medium">Account created successfully!</p>
              </CardContent>
            </Card>
          )}

          {error && (
            <Card className="bg-red-50 border-red-200 mb-3">
              <CardContent className="py-3 px-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Email */}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="email" className="text-xs font-medium">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                disabled={isLoading || success}
                className="h-9 text-sm"
              />
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="full_name" className="text-xs font-medium">Full Name *</Label>
              <Input
                id="full_name"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={(e) => handleInputChange("full_name", e.target.value)}
                disabled={isLoading || success}
                className="h-9 text-sm"
              />
            </div>

            {/* Display Name */}
            <div className="space-y-1.5">
              <Label htmlFor="display_name" className="text-xs font-medium">Display Name</Label>
              <Input
                id="display_name"
                placeholder="John"
                value={formData.display_name}
                onChange={(e) => handleInputChange("display_name", e.target.value)}
                disabled={isLoading || success}
                className="h-9 text-sm"
              />
            </div>

            {/* Company Name */}
            <div className="space-y-1.5">
              <Label htmlFor="company_name" className="text-xs font-medium">Company</Label>
              <Input
                id="company_name"
                placeholder="Acme Corp"
                value={formData.company_name}
                onChange={(e) => handleInputChange("company_name", e.target.value)}
                disabled={isLoading || success}
                className="h-9 text-sm"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-medium">Phone</Label>
              <Input
                id="phone"
                placeholder="+27 123 456 7890"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                disabled={isLoading || success}
                className="h-9 text-sm"
              />
            </div>

            {/* Role is fixed to user for self-service signups */}
            <input type="hidden" name="role" value={formData.role} />

            {/* Plan */}
            <div className="space-y-1.5">
              <Label htmlFor="plan" className="text-xs font-medium">Plan</Label>
              <Select
                value={formData.plan}
                onValueChange={(value) => handleInputChange("plan", value)}
                disabled={isLoading || success}
              >
                <SelectTrigger id="plan" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map(planKey => (
                    <SelectItem key={planKey} value={planKey} className="capitalize text-sm">
                      {PLANS[planKey]?.name || planKey}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label htmlFor="currency" className="text-xs font-medium">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => handleInputChange("currency", value)}
                disabled={isLoading || success}
              >
                <SelectTrigger id="currency" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map(currency => (
                    <SelectItem key={currency} value={currency} className="text-sm">
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label htmlFor="timezone" className="text-xs font-medium">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => handleInputChange("timezone", value)}
                disabled={isLoading || success}
              >
                <SelectTrigger id="timezone" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map(tz => (
                    <SelectItem key={tz} value={tz} className="text-sm">
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company Address - spans full width */}
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="company_address" className="text-xs font-medium">Company Address</Label>
              <Input
                id="company_address"
                placeholder="123 Main St, City, Country"
                value={formData.company_address}
                onChange={(e) => handleInputChange("company_address", e.target.value)}
                disabled={isLoading || success}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 mt-4 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => {
              handleReset();
              onOpenChange(false);
            }}
            disabled={isLoading || success}
            className="h-9 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateAccount}
            disabled={isLoading || success}
            className="h-9 text-sm"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {success ? "Account Created" : "Create Account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

CreateAccountDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
  onAccountCreated: PropTypes.func.isRequired
};
