import { cn } from '@ui/lib/utils';

const VARIANT_CLASSES = {
  secondary: 'border-secondary bg-secondary',
  neutral: 'border-gray-200 bg-gray-200',
};

export type BadgeProps = {
  text: string;
  variant?: keyof typeof VARIANT_CLASSES;
} & Omit<React.ComponentProps<'span'>, 'children'>;

export function Badge({ text, variant = 'secondary', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'border rounded-full text-black text-xs font-semibold px-2',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {text}
    </span>
  );
}
