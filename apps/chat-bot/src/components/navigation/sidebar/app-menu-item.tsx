'use client';

import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@ais-chat/ui/components/sidebar';
import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';
import Link from 'next/link';
import { cloneElement, type ReactElement } from 'react';

import { useCustomPathname } from '@/hooks/use-custom-pathname';

type AppMenuItemProps = {
  href: string;
  icon: ReactElement<{ weight?: 'regular' | 'bold' }>;
  text: string;
};

export function AppMenuItem({ href, icon, text }: AppMenuItemProps) {
  const pathname = useCustomPathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const isActive = () => {
    // special case for help mode because it is also an assistant and starts with the same path
    if (pathname.startsWith(`/assistants/d/${HELP_MODE_ASSISTANT_ID}`)) {
      return href.startsWith(`/assistants/d/${HELP_MODE_ASSISTANT_ID}`);
    }

    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive()}>
        <Link
          href={href}
          onClick={() => {
            if (isMobile) {
              setOpenMobile(false);
            }
          }}
          prefetch={false}
          aria-current={isActive() ? 'page' : undefined}
        >
          <span className="text-primary">
            {cloneElement(icon, { weight: isActive() ? 'bold' : 'regular' })}
          </span>
          <span>{text}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export default AppMenuItem;
