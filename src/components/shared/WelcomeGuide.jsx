import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Lightbulb, Settings, Banknote } from 'lucide-react';

export default function WelcomeGuide({ user, hasBankingDetails }) {
    const isProfileComplete = user?.company_name && user?.company_address && user?.logo_url;

    if (isProfileComplete && hasBankingDetails) {
        return null;
    }

    return (
        <Card className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="w-6 h-6 text-blue-600" />
                    Welcome to InvoiceBreek!
                </CardTitle>
                <CardDescription>Let's get your account ready for professional invoicing.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {!isProfileComplete && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white rounded-lg gap-4">
                            <div>
                                <h4 className="font-semibold">Complete Your Company Profile</h4>
                                <p className="text-sm text-gray-600">Add your company name, address, and logo for branded documents.</p>
                            </div>
                            <Link to={createPageUrl("Settings")}>
                                <Button className="w-full sm:w-auto">
                                    <Settings className="w-4 h-4 mr-2" /> Go to Settings
                                </Button>
                            </Link>
                        </div>
                    )}
                     {!hasBankingDetails && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white rounded-lg gap-4">
                            <div>
                                <h4 className="font-semibold">Add Your Banking Details</h4>
                                <p className="text-sm text-gray-600">Add a bank account so your clients know how to pay you.</p>
                            </div>
                            <Link to={createPageUrl("Settings") + "?tab=payments"}>
                                <Button className="w-full sm:w-auto">
                                    <Banknote className="w-4 h-4 mr-2" /> Add Details
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}