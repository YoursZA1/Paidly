import { BentoDemo } from "@/components/ui/bento-grid-demo";

export default function BentoDemoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Bento grid
        </h1>
        <p className="text-muted-foreground mt-1">
          Feature highlights in a responsive bento layout.
        </p>
      </div>
      <BentoDemo />
    </div>
  );
}
