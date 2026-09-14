'use client';

import type { UserAndContext } from '@/auth/types';
import ProfileMenu from '@/components/navigation/profile-menu';
import { ThreeDotsProfileMenu } from '@/components/navigation/three-dots-profile-menu';
import { ToggleSidebarButton } from '@/components/navigation/sidebar/collapsible-sidebar';
import { Fragment, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import useBreakpoints from '@/components/hooks/use-breakpoints';
import { reductionBreakpoint } from '@/utils/tailwind/layout';
import { useHeaderExtension } from '@/components/hooks/use-header-extension';

export type ApplicationHeaderMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

export type HeaderActionConfig = {
  id: string;
  headerNode?: ReactNode;
  menuItem?: Omit<ApplicationHeaderMenuItem, 'id'>;
};

export function ApplicationHeader({ userAndContext }: { userAndContext?: UserAndContext }) {
  const { setHeaderMountNode, compactMenuItems } = useHeaderExtension();
  const { isBelow } = useBreakpoints();
  const isCompact = isBelow[reductionBreakpoint];
  const headerMountNodeRef = useRef<HTMLDivElement | null>(null);

  const headerMountRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (headerMountNodeRef.current === node) {
        return;
      }

      headerMountNodeRef.current = node;
      setHeaderMountNode(node);
    },
    [setHeaderMountNode],
  );

  return (
    <header className="flex flex-row gap-4 min-h-20 px-6 py-2 items-center justify-between">
      <ToggleSidebarButton />
      <div
        className="flex flex-col sm:flex-row flex-wrap gap-4 min-w-0 flex-1"
        ref={headerMountRef}
      ></div>
      {isCompact && compactMenuItems.length > 0 ? (
        <ThreeDotsProfileMenu customItems={compactMenuItems} userAndContext={userAndContext} />
      ) : (
        <ProfileMenu userAndContext={userAndContext} />
      )}
    </header>
  );
}

export function ApplicationHeaderContent({ children }: { children: ReactNode }) {
  const { headerMountNode } = useHeaderExtension();

  if (!headerMountNode) {
    return null;
  }

  return createPortal(children, headerMountNode);
}

export function ApplicationHeaderActions({ actions }: { actions: HeaderActionConfig[] }) {
  const { headerMountNode, setCompactMenuItems } = useHeaderExtension();

  const compactItems = useMemo<ApplicationHeaderMenuItem[]>(
    () =>
      actions.flatMap((action) =>
        action.menuItem !== undefined ? [{ id: action.id, ...action.menuItem }] : [],
      ),
    [actions],
  );

  useEffect(() => {
    setCompactMenuItems(compactItems);

    return () => {
      setCompactMenuItems([]);
    };
  }, [compactItems, setCompactMenuItems]);

  if (!headerMountNode) {
    return null;
  }

  const headerNodes = actions.flatMap((action) =>
    action.headerNode !== undefined ? [{ id: action.id, node: action.headerNode }] : [],
  );

  return createPortal(
    <>
      {headerNodes.map((headerNode) => (
        <Fragment key={headerNode.id}>{headerNode.node}</Fragment>
      ))}
    </>,
    headerMountNode,
  );
}

/**
 * Registers custom items shown in ThreeDotsProfileMenu when the header is compact.
 * If no items are set, a plain ProfileMenu is shown instead.
 */
export function ApplicationHeaderCompactMenuItems({
  items,
}: {
  items: ApplicationHeaderMenuItem[];
}) {
  const { setCompactMenuItems } = useHeaderExtension();

  useEffect(() => {
    setCompactMenuItems(items);

    return () => {
      setCompactMenuItems([]);
    };
  }, [items, setCompactMenuItems]);

  return null;
}
