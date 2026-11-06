'use client';

import { useChatOverlayRoot } from '@/components/layout/chat-overlay-root-context';
import { cn } from '@/utils/tailwind';
import { useTranslations } from 'next-intl';
import React from 'react';
import { createPortal } from 'react-dom';
import useBreakpoints from '../hooks/use-breakpoints';
import ChevronDownIcon from '../icons/chevron-down';
import ChevronRightIcon from '../icons/chevron-right';
import MarkdownDisplay from './markdown-display';

export const dynamic = 'force-dynamic';

// Floating, minimizable, movable learning context dialog (desktop only) on mobile it's sticky on the top
export function FloatingText({
  learningContext,
  dialogStarted,
  title,
  parentRef,
  parentElement,
  maxWidth,
  maxHeight,
  minMargin,
}: {
  learningContext: string;
  dialogStarted: boolean;
  title: string;
  parentRef?: React.RefObject<HTMLElement>;
  parentElement?: HTMLElement | null;
  maxWidth: number;
  maxHeight: number;
  minMargin: number;
}) {
  const { isAtLeast } = useBreakpoints();
  const overlayTarget = useChatOverlayRoot();
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [position, setPosition] = React.useState({ x: minMargin, y: minMargin });
  const [dragging, setDragging] = React.useState(false);
  const [rel, setRel] = React.useState<{ x: number; y: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const t = useTranslations('common');

  const getParentElement = React.useCallback(() => {
    return overlayTarget ?? parentElement ?? parentRef?.current ?? null;
  }, [overlayTarget, parentElement, parentRef]);

  // Helper to clamp position within parent bounds
  function clampPosition({
    x,
    y,
    containerWidth,
    containerHeight,
  }: {
    x: number;
    y: number;
    containerWidth: number;
    containerHeight: number;
  }) {
    const parent = getParentElement();
    if (!parent) return { x, y };
    const parentRect = parent.getBoundingClientRect();
    const newX = Math.max(minMargin, Math.min(x, parentRect.width - containerWidth - minMargin));
    const newY = Math.max(minMargin, Math.min(y, parentRect.height - containerHeight - minMargin));
    return { x: newX, y: newY };
  }

  React.useEffect(() => {
    // Set initial position within parent (top-left corner with minMargin)
    if (getParentElement() && containerRef.current) {
      setPosition({
        x: minMargin,
        y: minMargin,
      });
    }
  }, [minMargin, containerRef, getParentElement]);

  React.useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging || !rel) return;
      const parent = getParentElement();
      if (!containerRef.current || !parent) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      const parentRect = parent.getBoundingClientRect();
      const newX = e.clientX - parentRect.left - rel.x;
      const newY = e.clientY - parentRect.top - rel.y;

      // Clamp values within parent
      const clamped = clampPosition({ x: newX, y: newY, containerWidth, containerHeight });
      setPosition(clamped);
    }
    function onMouseUp() {
      setDragging(false);
      setRel(null);
    }
    // Touch event handlers
    function onTouchMove(e: TouchEvent) {
      if (!dragging || !rel) return;
      const parent = getParentElement();
      if (!containerRef.current || !parent) return;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch?.clientX || !touch?.clientY) return;
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      const parentRect = parent.getBoundingClientRect();
      const newX = touch.clientX - parentRect.left - rel.x;
      const newY = touch.clientY - parentRect.top - rel.y;

      // Clamp values within parent
      const clamped = clampPosition({ x: newX, y: newY, containerWidth, containerHeight });
      setPosition(clamped);
    }
    function onTouchEnd() {
      setDragging(false);
      setRel(null);
    }
    if (dragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);
    } else {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, rel, getParentElement]);

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDragging(true);
      setRel({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }

  // Touch start handler
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (containerRef.current && e.touches.length === 1) {
      const rect = containerRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      if (!touch) return;
      setDragging(true);
      setRel({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
    }
  }

  if (!dialogStarted) return null;

  const floatingTextElement = (
    <aside
      ref={containerRef}
      aria-labelledby="floating-text-title"
      className={cn(
        'pointer-events-auto flex flex-col z-10 bg-secondary rounded-xl border select-none',
        // using string interpolations is extremely flaky, so we're using a static class name
        isAtLeast.lg ? 'absolute' : 'sticky',
        !isAtLeast.lg && 'mx-4',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={{
        left: isAtLeast.lg ? position.x : undefined,
        top: isAtLeast.lg ? position.y : minMargin,
        maxWidth: isAtLeast.lg ? maxWidth : '100%',
        maxHeight: isAtLeast.lg ? maxHeight : '40%',
      }}
    >
      <div
        role="presentation"
        className="flex items-center justify-between pl-4 py-2 rounded-t-xl mr-1"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <span
          id="floating-text-title"
          className={cn(dragging ? 'cursor-grabbing' : 'cursor-grab', 'font-semibold text-base')}
        >
          {title}
        </span>
        <button
          aria-label={isMinimized ? t('maximize') : t('minimize')}
          aria-expanded={!isMinimized}
          onClick={() => {
            setIsMinimized(!isMinimized);
            setTimeout(() => {
              const parent = getParentElement();
              if (containerRef.current && parent) {
                const parentRect = parent.getBoundingClientRect();
                const rect = containerRef.current.getBoundingClientRect();
                const newPos = {
                  x: Math.max(
                    minMargin,
                    Math.min(position.x, parentRect.width - rect.width - minMargin),
                  ),
                  y: Math.max(
                    minMargin,
                    Math.min(position.y, parentRect.height - rect.height - minMargin),
                  ),
                };
                if (newPos.x !== position.x || newPos.y !== position.y) {
                  setPosition(newPos);
                }
              }
            }, 0);
          }}
          className="flex items-center justify-center bg-none border-none cursor-pointer w-6 h-6"
        >
          {isMinimized ? (
            <ChevronRightIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
        </button>
      </div>
      {!isMinimized && (
        <div className="flex-1 ml-2 p-2 cursor-text select-text overflow-auto">
          <MarkdownDisplay>{learningContext ?? ''}</MarkdownDisplay>
        </div>
      )}
    </aside>
  );

  if (isAtLeast.lg && overlayTarget) {
    return createPortal(floatingTextElement, overlayTarget);
  }

  return floatingTextElement;
}
