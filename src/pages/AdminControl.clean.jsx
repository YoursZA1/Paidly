import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, FileText, Zap, Key, Shield, LifeBuoy } from "lucide-react";

export default function AdminControl() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 min-h-screen bg-slate-50">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-slate-900">Admin Control</h1>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/admin/roles-management')} className="gap-2 bg-primary hover:bg-primary/90">
              <Key className="w-4 h-4" />
              Admin Roles
            </Button>
            <Button onClick={() => navigate('/admin/security-compliance')} className="gap-2 bg-amber-600 hover:bg-amber-700">
              <Shield className="w-4 h-4" />
              Security & Compliance
            </Button>
            <Button onClick={() => navigate('/admin/support-tools')} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <LifeBuoy className="w-4 h-4" />
              Support & Admin Tools
            </Button>
          </div>
        </div>
        <p className="text-slate-600">
          Internal power tools for managing your workspace, users, and system.
        </p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 gap-2 mb-6">
          <TabsTrigger value="users" className="flex items-center gap-2 justify-start">
            <Users className="w-4 h-4" />
            View All Users
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2 justify-start">
            <FileText className="w-4 h-4" />
            View User Invoices
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2 justify-start">
            <Zap className="w-4 h-4" />
            Change User Plan
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          {/* ViewAllUsersSection component here */}
        </TabsContent>
        <TabsContent value="invoices">
          {/* ViewUserInvoicesSection component here */}
        </TabsContent>
        <TabsContent value="plans">
          {/* ChangeUserPlanSection component here */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
