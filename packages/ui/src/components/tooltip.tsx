'use client';

import { InfoIcon } from '@phosphor-icons/react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '../lib/utils';
import { DEFAULT_SCROLLING_TOOLTIP_DELAY_DURATION, DEFAULT_TOOLTIP_DELAY_DURATION } from './const';

type TooltipContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const TooltipContext = React.createContext<TooltipContextType | undefined>(undefined);

function useTooltip() {
  const context = React.useContext(TooltipContext);
  if (!context) {
    throw new Error('useTooltip must be used within a Tooltip component');
  }
  return context;
}

function TooltipProvider({
  delayDuration = DEFAULT_TOOLTIP_DELAY_DURATION,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

type TooltipProps = Omit<React.ComponentProps<typeof TooltipPrimitive.Root>, 'open'>;
type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger> & {
  disableKeyboardToggle?: boolean;
};

function Tooltip({ onOpenChange, defaultOpen, ...props }: TooltipProps) {
  const [isOpen, setIsOpen] = React.useState(Boolean(defaultOpen));

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      setIsOpen(newOpen);
      onOpenChange?.(newOpen);
    },
    [onOpenChange],
  );

  return (
    <TooltipContext.Provider value={{ isOpen, setIsOpen: handleOpenChange }}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={isOpen}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </TooltipContext.Provider>
  );
}

function TooltipTrigger({
  onKeyDown,
  onClick,
  onFocus,
  onBlur,
  disableKeyboardToggle = false,
  ...props
}: TooltipTriggerProps) {
  const { isOpen, setIsOpen } = useTooltip();
  const focusTimerRef = React.useRef<number | null>(null);

  const clearFocusTimer = React.useCallback(() => {
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return clearFocusTimer;
  }, [clearFocusTimer]);

  const handleKeyDown = React.useCallback<NonNullable<TooltipTriggerProps['onKeyDown']>>(
    (event) => {
      // Allow toggling tooltip with Enter or Space key for key navigation accessibility
      if (!disableKeyboardToggle && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        setIsOpen(!isOpen);
      }
      onKeyDown?.(event);
    },
    [disableKeyboardToggle, isOpen, setIsOpen, onKeyDown],
  );

  const handleClick = React.useCallback<NonNullable<TooltipTriggerProps['onClick']>>(
    (event) => {
      setIsOpen(!isOpen);
      onClick?.(event);
    },
    [isOpen, setIsOpen, onClick],
  );

  const handleFocus = React.useCallback<NonNullable<TooltipTriggerProps['onFocus']>>(
    (event) => {
      const currentTarget = event.currentTarget;

      clearFocusTimer();

      // Delay opening slightly so browser/container scroll can finish first.
      // This prevents that the tooltip vanishes on scrolling with key navigation
      focusTimerRef.current = window.setTimeout(() => {
        if (document.activeElement === currentTarget) {
          setIsOpen(true);
        }
      }, DEFAULT_SCROLLING_TOOLTIP_DELAY_DURATION);

      onFocus?.(event);
    },
    [clearFocusTimer, setIsOpen, onFocus],
  );

  const handleBlur = React.useCallback<NonNullable<TooltipTriggerProps['onBlur']>>(
    (event) => {
      clearFocusTimer();

      setIsOpen(false);
      onBlur?.(event);
    },
    [clearFocusTimer, setIsOpen, onBlur],
  );

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'whitespace-pre-line data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 rounded-md px-3 py-1.5 text-sm bg-foreground text-background z-50 w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin)',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="size-2.5 rotate-45 rounded-xs bg-foreground fill-foreground z-50 translate-y-[calc(-50%-2px)]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

type InfoTooltipBaseProps = {
  delayDuration?: number;
  skipDelayDuration?: number;
};

type InfoTooltipProps =
  | (InfoTooltipBaseProps & {
      tooltip: string;
      ariaLabel?: string;
    })
  | (InfoTooltipBaseProps & {
      tooltip: React.ReactNode;
      ariaLabel: string;
    });

function resolveAriaLabel(tooltip: React.ReactNode, ariaLabel?: string) {
  if (ariaLabel) {
    return ariaLabel;
  }

  return typeof tooltip === 'string' ? tooltip : undefined;
}

function InfoTooltip({
  tooltip,
  ariaLabel,
  delayDuration = DEFAULT_TOOLTIP_DELAY_DURATION,
  skipDelayDuration = 0,
}: InfoTooltipProps) {
  const resolvedAriaLabel = resolveAriaLabel(tooltip, ariaLabel);

  return (
    <TooltipProvider skipDelayDuration={skipDelayDuration} delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger
          aria-label={resolvedAriaLabel}
          className="rounded-full focus-visible:outline-primary focus-visible:outline-1 hover:bg-muted dark:hover:bg-muted/50 focus-visible:ring-3 focus-visible:border-ring focus-visible:ring-ring/50"
        >
          <InfoIcon className={'size-5 text-icon'} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { InfoTooltip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
