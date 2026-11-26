'use client';

import { CaretRightIcon } from '@phosphor-icons/react';
import { Alert, AlertAction, AlertDescription } from '@ui/components/alert';

export function CustomChatShareInfo({
  href,
  info,
  linkText,
}: {
  href: string;
  info: string;
  linkText: string;
}) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const targetId = href.startsWith('#') ? href.slice(1) : null;

    if (!targetId) {
      return;
    }

    const targetElement = document.getElementById(targetId);
    if (!targetElement) {
      return;
    }

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Alert className="justify-between font-medium">
      <AlertDescription>{info}</AlertDescription>
      <AlertAction>
        <a
          href={href}
          className="inline-flex items-center whitespace-nowrap text-primary border border-transparent bg-clip-padding bg-transparent p-0 text-right text-sm outline-none transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg"
          onClick={handleClick}
        >
          {linkText}
          <CaretRightIcon className="inline-block size-4 text-primary mb-0.5 ml-1" />
        </a>
      </AlertAction>
    </Alert>
  );
}
