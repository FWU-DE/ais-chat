import ChevronLeftIcon from '@/components/icons/chevron-left';
import { cn } from '@/utils/tailwind';

type NavigateBackProps = {
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
};

export default function NavigateBack({ label, onClick, className }: NavigateBackProps) {
  return (
    <button
      onClick={onClick}
      className={cn('flex gap-3 items-center text-primary hover:underline', className)}
    >
      <ChevronLeftIcon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}
