/**
 * Admin Affiliate Management
 * Platform-level admin dashboard for managing affiliate applications and partners
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2, XCircle, Clock, Users, TrendingUp,
  Search, Eye, Mail, UserCheck, UserX
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

export default function AdminAffiliates() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('applications');
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [showApplicationModal, setShowApplicationModal] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadApplications(),
        loadAffiliates()
      ]);
    } catch (error) {
      console.error('Error loading affiliate data:', error);
      toast({
        title: 'Error loading data',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async () => {
    const { data, error } = await supabase
      .from('affiliate_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setApplications(data || []);
  };

  const loadAffiliates = async () => {
    const { data, error } = await supabase
      .from('affiliates')
      .select(`
        *,
        affiliate_applications (
          full_name,
          email,
          why_promote,
          audience_platform
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setAffiliates(data || []);
  };

  const handleApproveApplication = async (applicationId) => {
    try {
      // First, get the application details
      const application = applications.find(app => app.id === applicationId);
      if (!application) return;

      // Generate a unique referral code
      const referralCode = `AFF${Date.now().toString(36).toUpperCase()}`;

      if (!application.user_id) {
        throw new Error('Cannot approve: application is not linked to a registered user. Set user_id on the application first.');
      }

      // Update application status
      const { error: appError } = await supabase
        .from('affiliate_applications')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', applicationId);

      if (appError) throw appError;

      // Create affiliate record
      const { error: affiliateError } = await supabase
        .from('affiliates')
        .insert({
          user_id: application.user_id,
          application_id: applicationId,
          referral_code: referralCode,
          commission_rate: 0.20, // 20% default
          status: 'active'
        });

      if (affiliateError) throw affiliateError;

      toast({
        title: 'Application approved',
        description: `${application.full_name} has been approved as an affiliate.`
      });

      // Reload data
      await loadData();

    } catch (error) {
      console.error('Error approving application:', error);
      toast({
        title: 'Error approving application',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleRejectApplication = async (applicationId, reason) => {
    try {
      const { error } = await supabase
        .from('affiliate_applications')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (error) throw error;

      toast({
        title: 'Application rejected',
        description: 'The application has been rejected.'
      });

      await loadData();
    } catch (error) {
      console.error('Error rejecting application:', error);
      toast({
        title: 'Error rejecting application',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      pending: { variant: 'secondary', icon: Clock, label: 'Pending' },
      approved: { variant: 'default', icon: CheckCircle2, label: 'Approved' },
      rejected: { variant: 'destructive', icon: XCircle, label: 'Rejected' }
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const filteredApplications = applications.filter(app =>
    app.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingApplications = applications.filter(app => app.status === 'pending');
  const approvedApplications = applications.filter(app => app.status === 'approved');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading affiliate data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Affiliate Management</h1>
          <p className="text-muted-foreground">
            Manage affiliate applications and active partners
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{pendingApplications.length}</p>
                <p className="text-sm text-muted-foreground">Pending Applications</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{approvedApplications.length}</p>
                <p className="text-sm text-muted-foreground">Approved Applications</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{affiliates.length}</p>
                <p className="text-sm text-muted-foreground">Active Affiliates</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {affiliates.reduce((sum, aff) => sum + (aff.commission_rate * 100), 0) / affiliates.length || 0}%
                </p>
                <p className="text-sm text-muted-foreground">Avg Commission Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="applications">Applications ({applications.length})</TabsTrigger>
          <TabsTrigger value="affiliates">Active Affiliates ({affiliates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search applications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-4">
            {filteredApplications.map((application) => (
              <Card key={application.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{application.full_name}</h3>
                        {getStatusBadge(application.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{application.email}</p>
                      <p className="text-sm">
                        <strong>Platform:</strong> {application.audience_platform || 'Not specified'}
                      </p>
                      {application.why_promote && (
                        <p className="text-sm">
                          <strong>Why:</strong> {application.why_promote}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Applied {new Date(application.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedApplication(application);
                          setShowApplicationModal(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>

                      {application.status === 'pending' && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleApproveApplication(application.id)}
                          >
                            <UserCheck className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRejectApplication(application.id)}
                          >
                            <UserX className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredApplications.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No applications found</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="affiliates" className="space-y-4">
          <div className="space-y-4">
            {affiliates.map((affiliate) => (
              <Card key={affiliate.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">
                        {affiliate.affiliate_applications?.full_name || 'Unknown'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {affiliate.affiliate_applications?.email || 'No email'}
                      </p>
                      <p className="text-sm font-mono">
                        Code: {affiliate.referral_code}
                      </p>
                      <p className="text-sm">
                        Commission: {(affiliate.commission_rate * 100).toFixed(1)}%
                      </p>
                    </div>

                    <div className="text-right text-sm text-muted-foreground">
                      <p>Joined {new Date(affiliate.created_at).toLocaleDateString()}</p>
                      <Badge variant="outline" className="mt-1">
                        {affiliate.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {affiliates.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No active affiliates</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Application Detail Modal */}
      {showApplicationModal && selectedApplication && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Application Details</h2>

            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <p className="text-sm mt-1">{selectedApplication.full_name}</p>
              </div>

              <div>
                <Label>Email</Label>
                <p className="text-sm mt-1">{selectedApplication.email}</p>
              </div>

              <div>
                <Label>Platform/Audience</Label>
                <p className="text-sm mt-1">{selectedApplication.audience_platform || 'Not specified'}</p>
              </div>

              <div>
                <Label>Why they want to promote</Label>
                <Textarea
                  value={selectedApplication.why_promote || 'Not provided'}
                  readOnly
                  className="mt-1"
                  rows={4}
                />
              </div>

              <div>
                <Label>Applied on</Label>
                <p className="text-sm mt-1">
                  {new Date(selectedApplication.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowApplicationModal(false)}
              >
                Close
              </Button>

              {selectedApplication.status === 'pending' && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      handleRejectApplication(selectedApplication.id);
                      setShowApplicationModal(false);
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => {
                      handleApproveApplication(selectedApplication.id);
                      setShowApplicationModal(false);
                    }}
                  >
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}