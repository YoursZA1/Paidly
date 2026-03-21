import {
  FileText,
  Wallet,
  Users,
  ArrowRightLeft,
  LineChart,
  Sparkles,
} from "lucide-react";
import FeatureCard from "./FeatureCard";

const FEATURES = [
  {
    title: "Create Invoices",
    description: "Send professional invoices in minutes — not hours.",
    icon: FileText,
  },
  {
    title: "Track Payments",
    description: "Know exactly who owes you and when.",
    icon: Wallet,
  },
  {
    title: "Manage Clients",
    description: "Keep all your customer details in one place.",
    icon: Users,
  },
  {
    title: "Quotes to Invoices",
    description: "Convert quotes into invoices instantly.",
    icon: ArrowRightLeft,
  },
  {
    title: "Cash Flow Visibility",
    description: "Understand your income at a glance.",
    icon: LineChart,
  },
  {
    title: "Professional output",
    description: "Branded PDFs and a dashboard that stays out of your way.",
    icon: Sparkles,
  },
];

export default function Features() {
  return (
    <section id="features" className="scroll-mt-24 border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
          Everything you need to run your billing
        </h2>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} icon={f.icon} />
          ))}
        </div>
      </div>
    </section>
  );
}
