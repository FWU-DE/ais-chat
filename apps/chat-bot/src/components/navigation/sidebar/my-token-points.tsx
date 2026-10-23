import TokenPointsProgressBar from '@/components/token-points-progress-bar';

type MyTokenPointsProps = {
  text: string;
  usedBudget: number;
  maxBudget: number;
  /** Regular monthly budget of the user's role, without vouchers or transfers (100 %). */
  monthlyBudget: number;
};

export function MyTokenPoints({ text, usedBudget, maxBudget, monthlyBudget }: MyTokenPointsProps) {
  // Relative to the regular monthly budget, so that vouchers and budget passed on or received
  // become visible (e.g. 80 % after passing on 20 %, 120 % after receiving 20 %). Without them
  // this equals 100 - used / max * 100.
  const remainingPercentage = ((maxBudget - usedBudget) / monthlyBudget) * 100;
  return (
    <div className="p-2">
      <div className="text-base mb-2">{text}</div>
      <TokenPointsProgressBar percentage={remainingPercentage} />
    </div>
  );
}
