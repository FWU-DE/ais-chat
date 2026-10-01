'use client';

import CheckIcon from '../icons/check';
import React from 'react';
import ClipboardLightIcon from '../icons/clipboard-light';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { useToast } from './toast';

type CopyToClipboardButtonProps = {
  text: string;
  className?: string;
  children?: ReactNode;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  'aria-label'?: string;
  title?: string;
  defaultIcons?: boolean;
};

export default function CopyToClipboardButton({
  text,
  className,
  children,
  variant = 'ghost',
  size = 'icon-round',
  'aria-label': ariaLabel,
  title,
  defaultIcons = true,
}: CopyToClipboardButtonProps) {
  const toast = useToast();
  const t = useTranslations('common');
  const [isCopied, setIsCopied] = React.useState(false);

  React.useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timeout = setTimeout(() => {
      setIsCopied(false);
    }, 2000);

    return () => {
      clearTimeout(timeout);
    };
  }, [isCopied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success(t('copy-clipboard-success'));
    } catch {
      setIsCopied(false);
      toast.error(t('copy-clipboard-error'));
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={ariaLabel ?? t('copy-clipboard')}
      title={title}
      data-testid="copy-to-clipboard"
      onClick={handleCopy}
      className="text-primary"
    >
      {defaultIcons &&
        (isCopied ? (
          <CheckIcon className={className} />
        ) : (
          <ClipboardLightIcon className={className} />
        ))}
      {children}
    </Button>
  );
}
