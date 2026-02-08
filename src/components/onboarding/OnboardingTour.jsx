import React, { useState, useEffect } from "react";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const tourSteps = [
    {
        targetId: "nav-dashboard",
        title: "Your Dashboard",
        content: "Get an overview of your business performance, recent activity, and quick actions.",
        position: "right"
    },
    {
        targetId: "nav-invoices",
        title: "Manage Invoices",
        content: "Create, track, and manage all your invoices in one place.",
        position: "right"
    },
    {
        targetId: "create-invoice-btn",
        title: "Quick Create",
        content: "Ready to get paid? Click here to create your first invoice instantly.",
        position: "right"
    },
    {
        targetId: "nav-settings",
        title: "Settings",
        content: "Configure your company profile, branding, and payment preferences here.",
        position: "right"
    }
];

export default function OnboardingTour({ isOpen, onClose }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const navigate = useNavigate();

    useEffect(() => {
        if (isOpen) {
            // Ensure we are on the dashboard for the tour initially
            if (window.location.pathname !== createPageUrl("Dashboard")) {
                navigate(createPageUrl("Dashboard"));
            }

            const timer = setTimeout(() => {
                const step = tourSteps[currentStep];
                const element = document.getElementById(step.targetId);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                }
                updatePosition();
            }, 300);
            
            // Add resize listener
            window.addEventListener('resize', updatePosition);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [isOpen, currentStep]);

    const updatePosition = () => {
        const step = tourSteps[currentStep];
        const element = document.getElementById(step.targetId);
        
        if (element) {
            const rect = element.getBoundingClientRect();
            // Calculate position based on preference
            let top = rect.top + (rect.height / 2);
            let left = rect.right + 20;

            // Clamp to viewport so the card stays visible
            const cardWidth = 320; // w-80
            const cardHeight = 220; // approximate
            const minTop = 80;
            const maxTop = window.innerHeight - cardHeight;
            const minLeft = 20;
            const maxLeft = window.innerWidth - cardWidth - 20;

            top = Math.min(Math.max(top, minTop), maxTop);
            left = Math.min(Math.max(left, minLeft), maxLeft);

            // Adjust if off screen (basic)
            if (window.innerWidth < 768) {
                // Mobile adjustment - center it
                top = window.innerHeight / 2;
                left = window.innerWidth / 2;
            }

            setPosition({ top, left });
        }
    };

    const handleNext = async () => {
        if (currentStep < tourSteps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            // Finish tour
            await User.updateMyUserData({ tour_completed: true });
            onClose();
        }
    };

    const handleSkip = async () => {
        await User.updateMyUserData({ tour_completed: true });
        onClose();
    };

    if (!isOpen) return null;

    const step = tourSteps[currentStep];

    return (
        <AnimatePresence>
            {/* Backdrop with hole highlight - simplified as overlay for now */}
            <div className="fixed inset-0 z-50 pointer-events-none">
                {/* We can use a sophisticated overlay or just a simple floating card */}
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="fixed z-[60] bg-white rounded-xl shadow-2xl p-6 w-80 border border-slate-100"
                style={{ 
                    top: position.top, 
                    left: position.left,
                    transform: 'translateY(-50%)',
                    // Fallback for mobile
                    ...(window.innerWidth < 768 ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } : {})
                }}
            >
                {/* Pointer Arrow */}
                <div className="absolute top-1/2 -left-2 w-4 h-4 bg-white transform -translate-y-1/2 rotate-45 border-l border-b border-slate-100 hidden md:block"></div>

                <button onClick={handleSkip} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                </button>

                <div className="mb-4">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                        Step {currentStep + 1} of {tourSteps.length}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mt-1">{step.title}</h3>
                    <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                        {step.content}
                    </p>
                </div>

                <div className="flex justify-between items-center mt-6">
                    <div className="flex gap-1">
                        {tourSteps.map((_, idx) => (
                            <div 
                                key={idx} 
                                className={`w-2 h-2 rounded-full transition-colors ${
                                    idx === currentStep ? 'bg-indigo-600' : 'bg-slate-200'
                                }`} 
                            />
                        ))}
                    </div>
                    <Button onClick={handleNext} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {currentStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
                        {currentStep !== tourSteps.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
                    </Button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}