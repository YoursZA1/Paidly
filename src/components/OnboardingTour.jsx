import PropTypes from "prop-types";

/**
 * Simple OnboardingTour modal placeholder.
 * Replace with your actual onboarding steps and UI as needed.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const TOUR_STEPS = [
  {
    id: "welcome",
    headline: "Welcome to Paidly",
    subtext: "Let’s get you paid faster.",
    cta: "Start Setup",
    skip: true,
    highlight: null,
  },
  {
    id: "dashboard",
    headline: "Your business performance at a glance.",
    highlight: "[data-tour='dashboard-summary']",
  },
  {
    id: "create-invoice",
    headline: "This is where money starts.",
    highlight: "#create-invoice-btn",
  },
  {
    id: "clients",
    headline: "Manage your clients and billing entities.",
    highlight: "[data-tour='accounts-section']",
  },
  {
    id: "reports",
    headline: "Track performance and cash flow.",
    highlight: "[data-tour='reports-section']",
  },
  {
    id: "settings",
    headline: "Configure your company details and branding.",
    highlight: "[data-tour='settings-btn']",
  },
];

function getHighlightRect(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  };
}

export default function OnboardingTour({ isOpen, onClose }) {
  const [step, setStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState(null);
  const timeoutRef = useRef();

  const handleComplete = useCallback(() => {
    localStorage.setItem("onboardingTourCompleted", "1");
    onClose();
  }, [onClose]);

  // Store completion state in localStorage
  useEffect(() => {
    if (!isOpen) return;
    if (localStorage.getItem("onboardingTourCompleted")) {
      onClose();
    }
  }, [isOpen, onClose]);

  // Highlight logic
  useEffect(() => {
    if (!isOpen) return;
    const { highlight } = TOUR_STEPS[step];
    if (highlight) {
      setTimeout(() => {
        setHighlightRect(getHighlightRect(highlight));
      }, 200); // Wait for DOM
    } else {
      setHighlightRect(null);
    }
  }, [step, isOpen]);

  const handleNext = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleComplete();
    }
  }, [step, handleComplete]);

  const handleSkip = useCallback(() => {
    localStorage.setItem("onboardingTourCompleted", "1");
    onClose();
  }, [onClose]);

  // Auto-close after 60s max
  useEffect(() => {
    if (!isOpen) return;
    timeoutRef.current = setTimeout(() => {
      handleComplete();
    }, 60000);
    return () => clearTimeout(timeoutRef.current);
  }, [isOpen, handleComplete]);

  if (!isOpen) return null;

  const current = TOUR_STEPS[step];

  return (
    <>
      {/* Overlay highlight */}
      {highlightRect && (
        <div
          style={{
            position: "absolute",
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
            border: "2px solid #06b6d4",
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
            pointerEvents: "none",
            zIndex: 10000,
            transition: "all 0.2s cubic-bezier(.4,0,.2,1)",
          }}
        />
      )}
      {/* Modal content */}
      <div
        className="fixed inset-0 z-[10001] flex items-center justify-center"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center"
          style={{ pointerEvents: "auto" }}
        >
          {step === 0 ? (
            <>
              <h2 className="text-2xl font-bold mb-2 text-center">{current.headline}</h2>
              <p className="mb-6 text-gray-600 text-center">{current.subtext}</p>
              <div className="flex gap-3 w-full">
                <button
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg font-semibold hover:bg-primary/90 transition"
                  onClick={handleNext}
                >
                  {current.cta || "Start"}
                </button>
                <button
                  className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg font-semibold hover:bg-gray-200 transition"
                  onClick={handleSkip}
                >
                  Skip Tour
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-2 text-center">{current.headline}</h2>
              <div className="flex gap-3 w-full mt-4">
                <button
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg font-semibold hover:bg-primary/90 transition"
                  onClick={handleNext}
                >
                  {step === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
                </button>
                <button
                  className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg font-semibold hover:bg-gray-200 transition"
                  onClick={handleSkip}
                >
                  Skip
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

OnboardingTour.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
