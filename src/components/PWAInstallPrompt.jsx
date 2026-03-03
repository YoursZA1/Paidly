import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, X, Smartphone, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Listen for the beforeinstallprompt event
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            
            // Show prompt after a delay if not dismissed before
            setTimeout(() => {
                const dismissed = localStorage.getItem('pwa-prompt-dismissed');
                if (!dismissed) {
                    setShowPrompt(true);
                }
            }, 3000);
        };

        // Listen for app installed event
        const handleAppInstalled = () => {
            setIsInstalled(true);
            setShowPrompt(false);
            localStorage.removeItem('pwa-prompt-dismissed');
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            setShowPrompt(false);
        }
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-prompt-dismissed', 'true');
    };

    const getInstallInstructions = () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        if (isIOS) {
            return {
                icon: Smartphone,
                title: "Install Paidly",
                instructions: "Tap the Share button, then 'Add to Home Screen'"
            };
        } else if (isAndroid) {
            return {
                icon: Smartphone,
                title: "Install Paidly",
                instructions: "Tap 'Add to Home Screen' in your browser menu"
            };
        } else {
            return {
                icon: Monitor,
                title: "Install Paidly",
                instructions: "Click the install button in your browser's address bar"
            };
        }
    };

    if (isInstalled || !showPrompt) return null;

    const { icon: Icon, title, instructions } = getInstallInstructions();

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-4 right-4 z-50 max-w-sm"
            >
                <Card className="bg-white border border-blue-200 shadow-xl">
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <Icon className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
                                    <p className="text-xs text-slate-600 mt-1">{instructions}</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleDismiss}
                                className="h-6 w-6 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        
                        {deferredPrompt && (
                            <Button
                                onClick={handleInstall}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Install App
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}