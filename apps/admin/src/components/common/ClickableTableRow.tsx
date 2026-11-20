'use client';

import { ClickableTableRow as BaseClickableTableRow } from '@ui/components/table';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

/** Lets server components make a row navigate: they can pass an `href`, but not an `onClick` function. */
export function ClickableTableRow({
  href,
  ...props
}: { href: string } & Omit<ComponentProps<typeof BaseClickableTableRow>, 'onActivate'>) {
  const router = useRouter();

  return <BaseClickableTableRow onActivate={() => router.push(href)} {...props} />;
}
