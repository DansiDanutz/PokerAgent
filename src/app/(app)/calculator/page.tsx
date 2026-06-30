import { Calculator } from "@/components/poker/Calculator";

export default function CalculatorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-100">Odds Calculator</h1>
        <p className="text-sm text-ink-400">
          Live equity, outs and pot odds for Texas Hold&apos;em and Omaha.
        </p>
      </div>
      <Calculator />
    </div>
  );
}
