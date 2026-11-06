/**
 * Chip component is based on shadcn badge component.
 * It adds a size variant and interactivity.
 * In ui systems badges are usually used for displaying static information.
 * Chips are used for displaying information that can be interacted with.
 *
 * Passing `onDelete` turns the Chip into a removable chip: it renders
 * a delete button, optionally wraps the label in a link (`href`), shows a loading
 * spinner (`isProcessing`) and can be wrapped in a tooltip (`tooltip`).
 */
import { XIcon } from '@phosphor-icons/react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '../lib/utils';
import { Spinner } from './spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

const chipVariants = cva(
  cn(
    'group/badge flex w-fit shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full border font-medium leading-none whitespace-nowrap has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5',
    'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    'has-[>a:focus-visible]:outline-none has-[>a:focus-visible]:ring-3 has-[>a:focus-visible]:ring-ring/50',
    '[&>a]:focus:outline-none [&>a]:focus-visible:outline-none',
  ),
  {
    variants: {
      variant: {
        default:
          'bg-primary/10 text-primary border-primary/30 [a&]:hover:bg-primary/20 has-[>a]:hover:bg-primary/20',
        secondary:
          'bg-secondary/30 text-secondary-foreground border-secondary [a&]:hover:bg-secondary/20',
        destructive:
          'bg-destructive/10 text-destructive border-destructive/30 [a&]:hover:bg-destructive/20',
      },
      size: {
        default: 'h-7 px-3 text-sm',
        sm: 'h-6 px-2 text-xs [&_svg:not([class*="size-"])]:size-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ChipProps = React.ComponentProps<'span'> &
  VariantProps<typeof chipVariants> & { asChild?: boolean } & {
    label?: string;
    href?: string;
    isProcessing?: boolean;
    ariaDeleteLabel?: string;
    tooltip?: string;
    onDelete?: () => void;
  };

function Chip({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  label,
  href,
  isProcessing,
  ariaDeleteLabel,
  tooltip,
  onDelete,
  key,
  children,
  ...props
}: ChipProps) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Tooltip key={key}>
      <TooltipTrigger asChild disableKeyboardToggle>
        <Comp
          data-slot="chip"
          data-variant={variant}
          data-size={size}
          className={cn(chipVariants({ variant, size }), className)}
          {...props}
        >
          {isProcessing && <Spinner className="size-4" />}
          {href ? (
            <a
              className="max-w-37.5 truncate"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.currentTarget.blur()} // closes the tooltip after navigation
            >
              {label}
            </a>
          ) : (
            (children ?? <span className="max-w-37.5 truncate">{label}</span>)
          )}
          {onDelete && (
            <button
              type="button"
              disabled={isProcessing}
              data-icon="inline-end"
              aria-label={ariaDeleteLabel}
              className="rounded-full hover:cursor-pointer hover:bg-primary/15 p-1 -m-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={onDelete}
            >
              <XIcon />
            </button>
          )}
        </Comp>
      </TooltipTrigger>
      {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
    </Tooltip>
  );
}

export { Chip, chipVariants };
