type TokenPointsProgressBarProps = {
  /** A normalized whole percentage between 0 and 100. */
  percentage: number;
  ariaLabel?: string;
};

export default function TokenPointsProgressBar({
  percentage,
  ariaLabel,
}: TokenPointsProgressBarProps) {
  function getColorByProgress() {
    if (percentage > 20) {
      return '#02A59B';
    }
    return '#E94D52';
  }

  const color = getColorByProgress();

  return (
    <div className="flex flex-col w-full">
      <div className="w-full">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          aria-label={ariaLabel}
          className="w-full h-[9px] relative rounded-[2px] overflow-hidden"
        >
          <div
            className="bg-[#D9D9D9] h-full transition-all duration-500 ease-in-out absolute left-0"
            style={{ width: '100%' }}
          ></div>
          <div
            className="h-full transition-all duration-500 ease-in-out absolute left-0 rounded-[2px]"
            style={{ width: `${percentage}%`, backgroundColor: color }}
          ></div>
        </div>
      </div>
    </div>
  );
}
